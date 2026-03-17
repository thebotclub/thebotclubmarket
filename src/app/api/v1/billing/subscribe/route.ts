import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { TIER_CONFIG, type SubscriptionTier } from "@/lib/subscription";

const VALID_TIERS: SubscriptionTier[] = ["PRO", "BUSINESS", "ENTERPRISE"];

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Payments not configured" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tier } = await request.json();
  if (!VALID_TIERS.includes(tier as SubscriptionTier)) {
    return Response.json({ error: "Invalid subscription tier" }, { status: 400 });
  }

  const config = TIER_CONFIG[tier as SubscriptionTier];
  if (!config.stripePriceId) {
    return Response.json({ error: "Subscription price not configured for this tier" }, { status: 503 });
  }

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true, name: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

  // Resolve or create Stripe customer
  let customerId = operator?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: operator?.email ?? undefined,
      name: operator?.name ?? undefined,
      metadata: { operatorId: session.user.id },
    });
    customerId = customer.id;
    await db.operator.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: config.stripePriceId,
        quantity: 1,
      },
    ],
    metadata: {
      operatorId: session.user.id,
      tier,
    },
    success_url: `${appUrl}/settings?subscription=success`,
    cancel_url: `${appUrl}/pricing?subscription=cancelled`,
    allow_promotion_codes: true,
  });

  return Response.json({ url: checkoutSession.url });
}
