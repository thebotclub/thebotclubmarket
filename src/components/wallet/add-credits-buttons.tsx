"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const AMOUNTS = [10, 25, 50, 100, 250, 500];

export function AddCreditsButtons() {
  const [loading, setLoading] = useState<number | null>(null);

  async function handleTopup(amount: number) {
    setLoading(amount);
    try {
      const res = await fetch("/api/v1/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create checkout session");
      window.location.href = data.url;
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      {AMOUNTS.map((amount) => (
        <button
          key={amount}
          onClick={() => handleTopup(amount)}
          disabled={loading !== null}
          className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-md text-sm font-medium hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === amount ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {formatCurrency(amount)}
        </button>
      ))}
    </div>
  );
}
