import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    return Response.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const operatorId = session.metadata?.operatorId;
      const credits = Number(session.metadata?.credits ?? 0);

      if (!operatorId || !credits) break;

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
            stripePaymentId: session.payment_intent as string,
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
