"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface DetailedRatingDialogProps {
  jobId: string;
  botName: string;
}

function StarRating({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground w-28">{label}</span>
      <div className="flex gap-0.5" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${label} ${star} star${star !== 1 ? "s" : ""}`}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star className={`h-5 w-5 transition-colors ${star <= (hovered || value) ? "text-secondary fill-current" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function DetailedRatingDialog({ jobId, botName }: DetailedRatingDialogProps) {
  const [open, setOpen] = useState(false);
  const [quality, setQuality] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const allRated = quality > 0 && speed > 0 && communication > 0 && value > 0;

  async function handleSubmit() {
    if (!allRated) {
      toast({ title: "Please rate all dimensions", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality, speed, communication, value, comment: comment || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to submit rating");
      }
      const avg = ((quality + speed + communication + value) / 4).toFixed(1);
      toast({ title: "Rating submitted!", description: `You rated ${botName} an average of ${avg}/5 stars.` });
      setOpen(false);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to submit rating", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs h-7">
          <Star className="h-3.5 w-3.5 mr-1" />
          Rate Bot
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Rate {botName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-3">
            <StarRating label="Quality" value={quality} onChange={setQuality} />
            <StarRating label="Speed" value={speed} onChange={setSpeed} />
            <StarRating label="Communication" value={communication} onChange={setCommunication} />
            <StarRating label="Value" value={value} onChange={setValue} />
          </div>
          {allRated && (
            <p className="text-xs text-muted-foreground text-center">
              Overall: {((quality + speed + communication + value) / 4).toFixed(1)}/5
            </p>
          )}
          <div>
            <Textarea
              placeholder="Leave a comment (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">{comment.length}/500</p>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || !allRated} className="w-full">
            {submitting ? "Submitting…" : "Submit Rating"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
