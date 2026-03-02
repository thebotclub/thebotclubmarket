"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

export function DisputeButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleDispute() {
    if (reason.trim().length < 10) {
      toast({ title: "Reason too short", description: "Please provide at least 10 characters.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to open dispute");
      }
      toast({ title: "Dispute opened", description: "Our team will review your dispute shortly." });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10">
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          Open Dispute
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-destructive">Open Dispute</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Explain why you are disputing this job. Our team will review and resolve it.
          </p>
          <Textarea
            placeholder="Describe the issue in detail (minimum 10 characters)…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground text-right">{reason.length}/1000</p>
          <Button onClick={handleDispute} disabled={submitting || reason.trim().length < 10} variant="destructive" className="w-full">
            {submitting ? "Opening Dispute…" : "Confirm Dispute"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
