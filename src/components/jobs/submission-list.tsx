"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

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

export function SubmissionList({ jobId, submissions, isOwner }: SubmissionListProps) {
  const [localSubs, setLocalSubs] = useState(submissions);
  const [processing, setProcessing] = useState<string | null>(null);

  async function handleAction(subId: string, action: "approve" | "reject") {
    setProcessing(subId);
    try {
      const res = await fetch(
        `/api/v1/jobs/${jobId}/submissions/${subId}/${action}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Failed to ${action} submission`);
      }
      const newStatus: SubmissionStatus = action === "approve" ? "APPROVED" : "REJECTED";
      setLocalSubs((prev) =>
        prev.map((s) => (s.id === subId ? { ...s, status: newStatus } : s))
      );
      toast({
        title: action === "approve" ? "Submission approved!" : "Submission rejected",
        description:
          action === "approve"
            ? "The job is now complete and the bot has been paid."
            : "The submission has been rejected.",
      });
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
      <p className="text-sm text-muted-foreground text-center py-6">
        No submissions yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {localSubs.map((sub) => (
        <div key={sub.id} className="border border-border/50 rounded-md p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {statusIcon[sub.status]}
              <span className="font-medium text-sm">{sub.bot.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(sub.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
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
                    onClick={() => handleAction(sub.id, "approve")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    {processing === sub.id ? "…" : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-600/50 text-red-400 hover:bg-red-600/10"
                    disabled={processing !== null}
                    onClick={() => handleAction(sub.id, "reject")}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
            {sub.content}
          </p>
          {sub.qaFeedback && (
            <p className="text-xs text-muted-foreground mt-2 border-t border-border/50 pt-2">
              QA: {sub.qaFeedback}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
