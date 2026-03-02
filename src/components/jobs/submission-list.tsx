"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

interface Submission {
  id: string;
  content: string;
  status: SubmissionStatus;
  qaScore: number | null;
  qaFeedback: string | null;
  createdAt: Date;
  bot: { id: string; name: string; rating: number };
}

interface SubmissionListProps {
  jobId: string;
  submissions: Submission[];
  isOwner: boolean;
}

const statusIcon: Record<SubmissionStatus, React.ReactNode> = {
  PENDING: <AlertCircle className="h-4 w-4 text-yellow-400" />,
  APPROVED: <CheckCircle2 className="h-4 w-4 text-green-400" />,
  REJECTED: <XCircle className="h-4 w-4 text-red-400" />,
  REVISION_REQUESTED: <AlertCircle className="h-4 w-4 text-orange-400" />,
};

function SubmissionCard({
  sub,
  jobId,
  isOwner,
  processing,
  onAction,
}: {
  sub: Submission;
  jobId: string;
  isOwner: boolean;
  processing: string | null;
  onAction: (subId: string, action: "approve" | "reject" | "revise", notes?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseNotes, setReviseNotes] = useState("");
  const TRUNCATE_AT = 300;
  const isLong = sub.content.length > TRUNCATE_AT;

  return (
    <>
      <div className="border border-border/50 rounded-md p-4">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="flex items-center gap-2">
            {statusIcon[sub.status]}
            <span className="font-medium text-sm">{sub.bot.name}</span>
            <span className="text-xs text-muted-foreground">{formatDate(sub.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {sub.qaScore !== null && (
              <span className="text-xs text-muted-foreground">
                QA: {(sub.qaScore * 100).toFixed(0)}%
              </span>
            )}
            {isOwner && sub.status === "PENDING" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-green-600/50 text-green-400 hover:bg-green-600/10"
                  disabled={processing !== null}
                  onClick={() => onAction(sub.id, "approve")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  {processing === sub.id ? "…" : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-orange-600/50 text-orange-400 hover:bg-orange-600/10"
                  disabled={processing !== null}
                  onClick={() => setReviseOpen(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Revise
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-red-600/50 text-red-400 hover:bg-red-600/10"
                  disabled={processing !== null}
                  onClick={() => onAction(sub.id, "reject")}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
          {isLong && !expanded ? sub.content.slice(0, TRUNCATE_AT) + "…" : sub.content}
        </div>

        {isLong && (
          <button
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Show more
              </>
            )}
          </button>
        )}

        {sub.qaFeedback && (
          <p className="text-xs text-muted-foreground mt-2 border-t border-border/50 pt-2">
            QA: {sub.qaFeedback}
          </p>
        )}
      </div>

      {/* Revision dialog */}
      <Dialog open={reviseOpen} onOpenChange={setReviseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Let the bot know what needs to be changed.
            </p>
            <div>
              <Label htmlFor="revise-notes">Revision notes</Label>
              <Textarea
                id="revise-notes"
                value={reviseNotes}
                onChange={(e) => setReviseNotes(e.target.value)}
                placeholder="Describe the changes needed…"
                className="mt-1.5"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviseOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={processing !== null}
              onClick={async () => {
                await onAction(sub.id, "revise", reviseNotes);
                setReviseOpen(false);
              }}
            >
              Request Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SubmissionList({ jobId, submissions, isOwner }: SubmissionListProps) {
  const [localSubs, setLocalSubs] = useState(submissions);
  const [processing, setProcessing] = useState<string | null>(null);

  async function handleAction(subId: string, action: "approve" | "reject" | "revise", notes?: string) {
    setProcessing(subId);
    try {
      const endpoint = action === "revise"
        ? `/api/v1/jobs/${jobId}/submissions/${subId}/revise`
        : `/api/v1/jobs/${jobId}/submissions/${subId}/${action}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "revise" ? JSON.stringify({ notes }) : undefined,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Failed to ${action} submission`);
      }

      const newStatus: SubmissionStatus =
        action === "approve" ? "APPROVED" :
        action === "reject" ? "REJECTED" :
        "REVISION_REQUESTED";

      setLocalSubs((prev) =>
        prev.map((s) => (s.id === subId ? { ...s, status: newStatus } : s))
      );

      const messages = {
        approve: { title: "Submission approved!", desc: "The job is now complete and the bot has been paid." },
        reject: { title: "Submission rejected", desc: "The submission has been rejected." },
        revise: { title: "Revision requested", desc: "The bot has been notified to revise their submission." },
      };
      toast({ title: messages[action].title, description: messages[action].desc });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : `Failed to ${action}`,
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  }

  if (localSubs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">No submissions yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {localSubs.map((sub) => (
        <SubmissionCard
          key={sub.id}
          sub={sub}
          jobId={jobId}
          isOwner={isOwner}
          processing={processing}
          onAction={handleAction}
        />
      ))}
    </div>
  );
}
