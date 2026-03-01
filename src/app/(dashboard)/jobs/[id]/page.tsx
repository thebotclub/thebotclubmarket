import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  categoryLabel,
} from "@/lib/utils";
import {
  Clock,
  DollarSign,
  Tag,
  Users,
  Star,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

const submissionStatusIcon = {
  PENDING: <AlertCircle className="h-4 w-4 text-yellow-400" />,
  APPROVED: <CheckCircle2 className="h-4 w-4 text-green-400" />,
  REJECTED: <XCircle className="h-4 w-4 text-red-400" />,
  REVISION_REQUESTED: <AlertCircle className="h-4 w-4 text-orange-400" />,
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;
  const session = await auth();

  const job = await db.job.findUnique({
    where: { id },
    include: {
      operator: { select: { id: true, name: true, image: true } },
      bids: {
        include: {
          bot: {
            select: { id: true, name: true, rating: true, jobsCompleted: true },
          },
        },
        orderBy: { amount: "asc" },
      },
      submissions: {
        include: {
          bot: { select: { id: true, name: true, rating: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { bids: true, submissions: true } },
    },
  });

  if (!job) notFound();

  const isOwner = job.operatorId === session?.user?.id;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="font-mono text-2xl font-bold leading-tight">
            {job.title}
          </h1>
          <Badge
            variant={
              job.status === "OPEN"
                ? "success"
                : job.status === "COMPLETED"
                  ? "default"
                  : "warning"
            }
            className="shrink-0"
          >
            {job.status.replace("_", " ")}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            Budget:{" "}
            <span className="text-foreground font-medium font-mono">
              {formatCurrency(job.budget)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Deadline:{" "}
            <span className="text-foreground">
              {formatDate(job.deadline)} ({formatRelativeTime(job.deadline)})
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Tag className="h-4 w-4" />
            <Badge variant="outline">{categoryLabel(job.category)}</Badge>
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {job._count.bids} bid{job._count.bids !== 1 ? "s" : ""}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Posted by {job.operator.name} on {formatDate(job.createdAt)}
        </p>
      </div>

      <Separator />

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Job Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {job.description}
          </p>
        </CardContent>
      </Card>

      {/* Bids */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Bids ({job._count.bids})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {job.bids.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No bids yet. Bots will start bidding soon.
            </p>
          ) : (
            <div className="space-y-3">
              {job.bids.map((bid) => (
                <div
                  key={bid.id}
                  className={`flex items-start justify-between p-3 rounded-md border ${
                    bid.status === "ACCEPTED"
                      ? "border-green-600/30 bg-green-600/5"
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
                  <div className="font-mono font-bold text-primary ml-4 shrink-0">
                    {formatCurrency(bid.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions */}
      {(isOwner || job.submissions.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Submissions ({job._count.submissions})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {job.submissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No submissions yet.
              </p>
            ) : (
              <div className="space-y-4">
                {job.submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="border border-border/50 rounded-md p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {submissionStatusIcon[submission.status]}
                        <span className="font-medium text-sm">
                          {submission.bot.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(submission.createdAt)}
                        </span>
                      </div>
                      {submission.qaScore !== null && (
                        <span className="text-xs text-muted-foreground">
                          QA: {(submission.qaScore * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                      {submission.content}
                    </p>
                    {submission.qaFeedback && (
                      <p className="text-xs text-muted-foreground mt-2 border-t border-border/50 pt-2">
                        QA: {submission.qaFeedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
