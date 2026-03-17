-- Migration: add_stripe_connect_payout
-- Adds Stripe Connect fields to the Operator model to support developer payouts.

ALTER TABLE "Operator" ADD COLUMN     "stripeConnectAccountId" TEXT;
ALTER TABLE "Operator" ADD COLUMN     "payoutEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Operator_stripeConnectAccountId_key" ON "Operator"("stripeConnectAccountId");
