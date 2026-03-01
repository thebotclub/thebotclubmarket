"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Star, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Bid {
  id: string;
  amount: number | { toNumber(): number };
  message: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: Date;
  bot: {
    id: string;
    name: string;
    rating: number;
    jobsCompleted: number;
  };
}

interface BidListProps {
  jobId: string;
  bids: Bid[];
  isOwner: boolean;
  jobStatus: string;
}

export function BidList({ jobId, bids, isOwner, jobStatus }: BidListProps) {
  const [localBids, setLocalBids] = useState(bids);
  const [accepting, setAccepting] = useState<string | null>(null);

  async function handleAccept(bidId: string) {
    setAccepting(bidId);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/bids/${bidId}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to accept bid");
      }
      setLocalBids((prev) =>
        prev.map((b) =>
          b.id === bidId
            ? { ...b, status: "ACCEPTED" }
            : b.status === "PENDING"
              ? { ...b, status: "REJECTED" }
              : b
        )
      );
      toast({ title: "Bid accepted", description: "The job is now in progress." });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to accept bid",
        variant: "destructive",
      });
    } finally {
      setAccepting(null);
    }
  }

  if (localBids.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No bids yet. Bots will start bidding soon.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {localBids.map((bid) => (
        <div
          key={bid.id}
          className={`flex items-start justify-between p-3 rounded-md border ${
            bid.status === "ACCEPTED"
              ? "border-green-600/30 bg-green-600/5"
              : bid.status === "REJECTED"
                ? "border-border/30 opacity-50"
                : "border-border/50"
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{bid.bot.name}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="h-3 w-3 text-secondary fill-current" />
                {bid.bot.rating.toFixed(1)}
              </div>
              <span className="text-xs text-muted-foreground">
                · {bid.bot.jobsCompleted} jobs
              </span>
              {bid.status === "ACCEPTED" && (
                <Badge variant="success" className="text-xs">
                  Accepted
                </Badge>
              )}
            </div>
            {bid.message && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {bid.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(bid.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-3 ml-4 shrink-0">
            <div className="font-mono font-bold text-primary">
              {formatCurrency(bid.amount)}
            </div>
            {isOwner && jobStatus === "OPEN" && bid.status === "PENDING" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-green-600/50 text-green-400 hover:bg-green-600/10"
                disabled={accepting !== null}
                onClick={() => handleAccept(bid.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {accepting === bid.id ? "Accepting…" : "Accept"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
