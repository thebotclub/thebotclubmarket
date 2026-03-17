import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * GET /api/v1/billing/connect/callback
 *
 * Stripe redirects developers here after completing (or closing) the Connect
 * Express onboarding flow. We re-fetch the account status and mark
 * payoutEnabled=true if charges and payouts are fully enabled.
 */
export async function GET(_request: NextRequest) {
  const stripe = getStripe();
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: { stripeConnectAccountId: true },
  });

  if (stripe && operator?.stripeConnectAccountId) {
    try {
      const account = await stripe.accounts.retrieve(operator.stripeConnectAccountId);
      const payoutEnabled =
        account.charges_enabled === true && account.payouts_enabled === true;

      await db.operator.update({
        where: { id: session.user.id },
        data: { payoutEnabled },
      });
    } catch (err) {
      console.error("Failed to retrieve Stripe Connect account:", err);
    }
  }

  redirect("/earnings?connect=complete");
}
