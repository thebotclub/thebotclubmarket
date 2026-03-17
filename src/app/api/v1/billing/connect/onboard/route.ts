import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";

/**
 * POST /api/v1/billing/connect/onboard
 *
 * Creates a Stripe Connect Express account (if not already created) and
 * returns an onboarding URL for the developer to complete KYC/banking setup.
 */
export async function POST(_request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Payments not configured" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      stripeConnectAccountId: true,
      payoutEnabled: true,
      role: true,
    },
  });

  if (!operator) {
    return Response.json({ error: "Operator not found" }, { status: 404 });
  }

  // Only developers / both roles can onboard for payouts
  if (operator.role === "BUYER") {
    return Response.json(
      { error: "Only developers can connect a payout account" },
      { status: 403 }
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

  let connectAccountId = operator.stripeConnectAccountId;

  // Create a new Stripe Connect Express account if one doesn't exist yet
  if (!connectAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: operator.email ?? undefined,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        operatorId: session.user.id,
      },
    });

    connectAccountId = account.id;

    await db.operator.update({
      where: { id: session.user.id },
      data: { stripeConnectAccountId: connectAccountId },
    });
  }

  // Generate an onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: connectAccountId,
    refresh_url: `${appUrl}/earnings?connect=refresh`,
    return_url: `${appUrl}/api/v1/billing/connect/callback`,
    type: "account_onboarding",
  });

  return Response.json({ url: accountLink.url });
}
