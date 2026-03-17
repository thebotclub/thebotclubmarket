import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";

/**
 * Credit-to-currency conversion rate.
 * 1 credit = $0.10 USD  →  10 credits = $1.00
 */
const CREDITS_PER_DOLLAR = 10;

/** Minimum payout: $10 USD = 100 credits */
const MIN_PAYOUT_CREDITS = 100;

/**
 * POST /api/v1/billing/payout
 *
 * Body: { credits: number }  — how many credits to cash out.
 *
 * Validates the request, deducts credits from the operator's balance,
 * creates a Stripe Connect transfer, and records the event in the ledger.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Payments not configured" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { credits?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const credits = Number(body.credits);
  if (!Number.isFinite(credits) || credits <= 0 || !Number.isInteger(credits)) {
    return Response.json({ error: "credits must be a positive integer" }, { status: 400 });
  }

  if (credits < MIN_PAYOUT_CREDITS) {
    return Response.json(
      {
        error: `Minimum payout is ${MIN_PAYOUT_CREDITS} credits ($${(MIN_PAYOUT_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)})`,
      },
      { status: 400 }
    );
  }

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: {
      creditBalance: true,
      stripeConnectAccountId: true,
      payoutEnabled: true,
      role: true,
    },
  });

  if (!operator) {
    return Response.json({ error: "Operator not found" }, { status: 404 });
  }

  if (operator.role === "BUYER") {
    return Response.json({ error: "Only developers can request payouts" }, { status: 403 });
  }

  if (!operator.stripeConnectAccountId || !operator.payoutEnabled) {
    return Response.json(
      { error: "Payout account not connected. Please complete Stripe Connect onboarding first." },
      { status: 422 }
    );
  }

  const currentBalance = operator.creditBalance.toNumber();
  if (credits > currentBalance) {
    return Response.json(
      { error: `Insufficient credits. Available: ${Math.floor(currentBalance)}` },
      { status: 422 }
    );
  }

  // Amount in cents (USD)
  const amountUsd = credits / CREDITS_PER_DOLLAR;
  const amountCents = Math.round(amountUsd * 100);

  // Perform the transfer inside a DB transaction so the credit deduction and
  // ledger entry are atomic. The Stripe transfer is made before the DB write;
  // if the DB write fails we log the Stripe transfer ID so it can be reconciled.
  let stripeTransferId: string | undefined;

  try {
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: operator.stripeConnectAccountId,
      description: `TheBotClub payout: ${credits} credits → $${amountUsd.toFixed(2)}`,
      metadata: {
        operatorId: session.user.id,
        credits: String(credits),
      },
    });

    stripeTransferId = transfer.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe transfer failed";
    console.error("Stripe transfer error:", err);
    return Response.json({ error: message }, { status: 502 });
  }

  try {
    await db.$transaction([
      // Deduct credits from operator balance
      db.operator.update({
        where: { id: session.user.id },
        data: { creditBalance: { decrement: credits } },
      }),
      // Record in ledger
      db.ledger.create({
        data: {
          type: "PAYOUT",
          amount: credits,
          description: `Payout: ${credits} credits ($${amountUsd.toFixed(2)}) — transfer ${stripeTransferId}`,
          operatorId: session.user.id,
        },
      }),
      // Record in credit transactions
      db.creditTransaction.create({
        data: {
          amount: credits,
          type: "SPEND",
          description: `Payout withdrawal: ${credits} credits → $${amountUsd.toFixed(2)}`,
          stripePaymentId: stripeTransferId,
          operatorId: session.user.id,
        },
      }),
    ]);
  } catch (err) {
    // The Stripe transfer succeeded but our DB write failed — log for manual reconciliation
    console.error(
      `CRITICAL: Stripe transfer ${stripeTransferId} succeeded but DB update failed for operator ${session.user.id}`,
      err
    );
    return Response.json(
      {
        error: "Payout transfer succeeded but we failed to update your balance. Please contact support.",
        stripeTransferId,
      },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    creditsDeducted: credits,
    amountUsd: amountUsd.toFixed(2),
    stripeTransferId,
  });
}
