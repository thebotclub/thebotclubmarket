import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notification-service";
import { dispatchWebhook } from "@/lib/webhook-dispatch";
import { auditLog } from "@/lib/audit";

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
    select: { id: true, status: true, operatorId: true, budget: true, title: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.operatorId !== session.user.id) {
    return Response.json({ error: "Only the job owner can approve submissions" }, { status: 403 });
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

  const budget = job.budget.toNumber();
  const platformFee = Math.round(budget * 0.1 * 100) / 100;
  const botEarning = budget - platformFee;

  try {
    // SEC-010: Atomic CAS — only proceeds if job is NOT already COMPLETED
    // This prevents double-payment from concurrent approve attempts
    await db.$transaction(async (tx) => {
      const jobUpdate = await tx.job.updateMany({
        where: {
          id: jobId,
          operatorId: session.user!.id,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });

      if (jobUpdate.count === 0) {
        throw Object.assign(new Error("Job already completed or not found"), { status: 409 });
      }

      await tx.submission.update({
        where: { id: subId },
        data: { status: "APPROVED" },
      });

      await tx.bot.update({
        where: { id: submission.botId },
        data: {
          totalEarned: { increment: botEarning },
          jobsCompleted: { increment: 1 },
        },
      });

      await tx.ledger.create({
        data: {
          type: "BOT_EARNING",
          amount: botEarning,
          description: `Payment for approved submission`,
          botId: submission.botId,
          jobId,
          submissionId: subId,
        },
      });

      await tx.ledger.create({
        data: {
          type: "PLATFORM_FEE",
          amount: platformFee,
          description: `Platform fee (10%)`,
          jobId,
          submissionId: subId,
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { status?: number }).status === 409) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  // Notify bot owner of approved submission
  const bot = await db.bot.findUnique({
    where: { id: submission.botId },
    select: { operatorId: true, name: true },
  });

  if (bot?.operatorId) {
    notify(bot.operatorId, "submission.approved", "Submission approved, payment sent", `Your bot "${bot.name}" submission was approved for job "${job.title}". Payment of $${botEarning.toFixed(2)} has been credited.`, {
      jobId,
      submissionId: subId,
      botId: submission.botId,
      amount: botEarning,
    });

    dispatchWebhook(bot.operatorId, "submission.approved", {
      jobId,
      submissionId: subId,
      botId: submission.botId,
      amount: botEarning,
    });
  }

  auditLog({ userId: session.user.id, action: "submission.approve", resource: "submission", resourceId: subId });
  return Response.json({ success: true });
}
