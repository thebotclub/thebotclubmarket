import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { trackServerEvent } from "@/lib/posthog";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Payments not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    return Response.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    // ─── One-time credit purchases ──────────────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "payment") {
        // One-time credit purchase
        const operatorId = session.metadata?.operatorId;
        const credits = Number(session.metadata?.credits ?? 0);
        const paymentIntentId = session.payment_intent as string;

        if (!operatorId || !credits) break;

        try {
          await db.$transaction([
            db.operator.update({
              where: { id: operatorId },
              data: { creditBalance: { increment: credits } },
            }),
            db.creditTransaction.create({
              data: {
                amount: credits,
                type: "PURCHASE",
                description: `Stripe purchase: ${credits} credits`,
                stripePaymentId: paymentIntentId,
                operatorId,
              },
            }),
            db.ledger.create({
              data: {
                type: "CREDIT_PURCHASE",
                amount: credits,
                description: `Credit purchase via Stripe`,
                operatorId,
              },
            }),
          ]);
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            (err as NodeJS.ErrnoException & { code?: string }).code === "P2002"
          ) {
            console.log(`Duplicate Stripe webhook skipped: ${paymentIntentId}`);
            return Response.json({ received: true });
          }
          throw err;
        }

        trackServerEvent(operatorId, "payment_completed", {
          credits,
          paymentIntentId,
          type: "credit_purchase",
        });
      }
      break;
    }

    // ─── Subscription lifecycle ─────────────────────────────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(subscription);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // Find operator by Stripe customer ID
      const operator = await db.operator.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
        select: { id: true },
      });
      if (operator) {
        await db.operator.update({
          where: { id: operator.id },
          data: {
            subscriptionTier: "FREE",
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            subscriptionPeriodEnd: null,
          },
        });
        console.log(`Subscription canceled for operator: ${operator.id}`);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const operator = await db.operator.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true, email: true },
      });
      if (operator) {
        await db.operator.update({
          where: { id: operator.id },
          data: { subscriptionStatus: "past_due" },
        });
        console.error(`Invoice payment failed for operator: ${operator.id} (${operator.email})`);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      console.error("Payment failed:", event.data.object);
      break;
    }

    // ─── Stripe Connect: account onboarding ────────────────────────────────
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const operatorId = account.metadata?.operatorId;

      if (!operatorId) {
        console.warn("account.updated webhook received with no operatorId in metadata");
        break;
      }

      const payoutEnabled =
        account.charges_enabled === true && account.payouts_enabled === true;

      await db.operator.updateMany({
        where: {
          stripeConnectAccountId: account.id,
          id: operatorId,
        },
        data: { payoutEnabled },
      });

      console.log(
        `Connect account updated for operator ${operatorId}: payoutEnabled=${payoutEnabled}`
      );
      break;
    }

    default:
      break;
  }

  return Response.json({ received: true });
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const operator = await db.operator.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });

  if (!operator) {
    console.error(`No operator found for Stripe customer: ${customerId}`);
    return;
  }

  // Derive tier from metadata or price lookup
  const tier = subscription.metadata?.tier as string | undefined;
  const status = subscription.status;
  const periodEnd = new Date((subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end! * 1000);

  await db.operator.update({
    where: { id: operator.id },
    data: {
      subscriptionTier: tier ?? "FREE",
      subscriptionStatus: status,
      stripeSubscriptionId: subscription.id,
      subscriptionPeriodEnd: periodEnd,
    },
  });

  console.log(`Subscription updated for operator: ${operator.id} → ${tier} (${status})`);
}
