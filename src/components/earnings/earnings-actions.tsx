"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowDownToLine, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface EarningsActionsProps {
  /** Whether the operator has a connected Stripe account with payouts enabled */
  payoutEnabled: boolean;
  /** Whether a Stripe Connect account ID exists (even if onboarding incomplete) */
  connectAccountExists: boolean;
  /** Credits available for withdrawal */
  availableCredits: number;
}

/** 1 credit = $0.10 USD */
const CREDITS_PER_DOLLAR = 10;
const MIN_PAYOUT_CREDITS = 100;

export function EarningsActions({
  payoutEnabled,
  connectAccountExists,
  availableCredits,
}: EarningsActionsProps) {
  const { toast } = useToast();
  const [connectLoading, setConnectLoading] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutCredits, setPayoutCredits] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);

  // ── Stripe Connect onboarding ──────────────────────────────────────────
  async function handleConnectStripe() {
    setConnectLoading(true);
    try {
      const res = await fetch("/api/v1/billing/connect/onboard", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Error", description: data.error });
        return;
      }
      // Redirect to Stripe's hosted onboarding page
      window.location.href = data.url;
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to start onboarding" });
    } finally {
      setConnectLoading(false);
    }
  }

  // ── Payout request ────────────────────────────────────────────────────
  async function handlePayoutSubmit() {
    const credits = Number(payoutCredits);
    if (!Number.isFinite(credits) || credits < MIN_PAYOUT_CREDITS) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: `Minimum payout is ${MIN_PAYOUT_CREDITS} credits ($${(MIN_PAYOUT_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)})`,
      });
      return;
    }
    if (credits > availableCredits) {
      toast({
        variant: "destructive",
        title: "Insufficient credits",
        description: `You only have ${Math.floor(availableCredits)} credits available`,
      });
      return;
    }

    setPayoutLoading(true);
    try {
      const res = await fetch("/api/v1/billing/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Payout failed", description: data.error });
        return;
      }
      toast({
        title: "Payout requested!",
        description: `${credits} credits ($${data.amountUsd}) will be sent to your bank account.`,
      });
      setPayoutOpen(false);
      setPayoutCredits("");
      // Refresh to update balances
      window.location.reload();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to process payout" });
    } finally {
      setPayoutLoading(false);
    }
  }

  const usdPreview =
    payoutCredits && Number(payoutCredits) > 0
      ? `≈ $${(Number(payoutCredits) / CREDITS_PER_DOLLAR).toFixed(2)} USD`
      : null;

  // ── Not connected yet ─────────────────────────────────────────────────
  if (!payoutEnabled) {
    return (
      <div className="flex items-center gap-3">
        {connectAccountExists && !payoutEnabled && (
          <div className="flex items-center gap-1.5 text-xs text-amber-500">
            <AlertCircle className="h-3.5 w-3.5" />
            Onboarding incomplete
          </div>
        )}
        <Button
          onClick={handleConnectStripe}
          disabled={connectLoading}
          variant="outline"
          className="gap-2"
        >
          <ExternalLink className="h-4 w-4" />
          {connectLoading
            ? "Redirecting…"
            : connectAccountExists
              ? "Resume Stripe Onboarding"
              : "Connect Stripe"}
        </Button>
      </div>
    );
  }

  // ── Connected & enabled ───────────────────────────────────────────────
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Stripe Connected
        </div>
        <Button
          onClick={() => setPayoutOpen(true)}
          disabled={availableCredits < MIN_PAYOUT_CREDITS}
          className="gap-2"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Request Payout
        </Button>
      </div>

      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
            <DialogDescription>
              Enter the number of credits to withdraw. 1 credit = $0.10 USD.
              Minimum: {MIN_PAYOUT_CREDITS} credits (${(MIN_PAYOUT_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Credits to withdraw
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={MIN_PAYOUT_CREDITS}
                  max={Math.floor(availableCredits)}
                  step={1}
                  placeholder={`Min ${MIN_PAYOUT_CREDITS}`}
                  value={payoutCredits}
                  onChange={(e) => setPayoutCredits(e.target.value)}
                  className="font-mono"
                />
                {usdPreview && (
                  <span className="flex items-center text-sm text-muted-foreground whitespace-nowrap">
                    {usdPreview}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Available: {Math.floor(availableCredits)} credits
              </p>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p>• Transfers are processed within 1–2 business days</p>
              <p>• Funds will be deposited to your connected bank account</p>
              <p>• Platform fee: 0% (TheBotClub retains the application fee at job completion)</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePayoutSubmit} disabled={payoutLoading}>
              {payoutLoading ? "Processing…" : "Confirm Payout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Inline badge shown in the earnings header when payout is not yet enabled */
export function PayoutStatusBadge({ payoutEnabled }: { payoutEnabled: boolean }) {
  if (payoutEnabled) {
    return (
      <Badge variant="success" className="text-xs gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Payouts Enabled
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      Payouts Not Set Up
    </Badge>
  );
}
