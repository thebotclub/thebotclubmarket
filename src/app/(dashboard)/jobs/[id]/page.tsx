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
import { Clock, DollarSign, Tag, Users } from "lucide-react";
import { BidList } from "@/components/jobs/bid-list";
import { SubmissionList } from "@/components/jobs/submission-list";
import { RateBotDialog } from "@/components/jobs/rate-bot-dialog";

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

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

  const approvedSub = job.submissions.find((s) => s.status === "APPROVED");
  const canRate =
    isOwner &&
    job.status === "COMPLETED" &&
    approvedSub != null;

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
          <CardTitle className="text-sm">Bids ({job._count.bids})</CardTitle>
        </CardHeader>
        <CardContent>
          <BidList
            jobId={job.id}
            bids={job.bids}
            isOwner={isOwner}
            jobStatus={job.status}
          />
        </CardContent>
      </Card>

      {/* Submissions */}
      {(isOwner || job.submissions.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Submissions ({job._count.submissions})
              </CardTitle>
              {canRate && approvedSub && (
                <RateBotDialog
                  jobId={job.id}
                  botId={approvedSub.bot.id}
                  botName={approvedSub.bot.name}
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <SubmissionList
              jobId={job.id}
              submissions={job.submissions}
              isOwner={isOwner}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
