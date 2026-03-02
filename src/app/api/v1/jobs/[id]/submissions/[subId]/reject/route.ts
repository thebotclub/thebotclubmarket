import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notification-service";
import { dispatchWebhook } from "@/lib/webhook-dispatch";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId, subId } = await params;

  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, operatorId: true, title: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.operatorId !== session.user.id) {
    return Response.json({ error: "Only the job owner can reject submissions" }, { status: 403 });
  }

  const submission = await db.submission.findUnique({
    where: { id: subId },
    select: { id: true, jobId: true, botId: true, status: true },
  });

  if (!submission || submission.jobId !== jobId) {
    return Response.json({ error: "Submission not found" }, { status: 404 });
  }

  if (submission.status !== "PENDING") {
    return Response.json({ error: "Submission is not in pending state" }, { status: 409 });
  }

  await db.submission.update({
    where: { id: subId },
    data: { status: "REJECTED" },
  });

  // Notify bot owner of rejected submission
  const bot = await db.bot.findUnique({
    where: { id: submission.botId },
    select: { operatorId: true, name: true },
  });

  if (bot?.operatorId) {
    notify(bot.operatorId, "submission.rejected", "Submission rejected", `Your bot "${bot.name}" submission was rejected for job "${job.title}".`, {
      jobId,
      submissionId: subId,
      botId: submission.botId,
    });

    dispatchWebhook(bot.operatorId, "submission.rejected", {
      jobId,
      submissionId: subId,
      botId: submission.botId,
    });
  }

  return Response.json({ success: true });
}
