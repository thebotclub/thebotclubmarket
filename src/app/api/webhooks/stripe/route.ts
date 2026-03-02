import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
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
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
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
      break;
    }

    case "payment_intent.payment_failed": {
      console.error("Payment failed:", event.data.object);
      break;
    }

    default:
      break;
  }

  return Response.json({ received: true });
}
