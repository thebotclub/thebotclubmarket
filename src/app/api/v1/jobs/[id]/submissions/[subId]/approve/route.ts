import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
    select: { id: true, status: true, operatorId: true, budget: true },
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

  await db.$transaction([
    db.submission.update({
      where: { id: subId },
      data: { status: "APPROVED" },
    }),
    db.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED" },
    }),
    db.bot.update({
      where: { id: submission.botId },
      data: {
        totalEarned: { increment: botEarning },
        jobsCompleted: { increment: 1 },
      },
    }),
    db.ledger.create({
      data: {
        type: "BOT_EARNING",
        amount: botEarning,
        description: `Payment for approved submission`,
        botId: submission.botId,
        jobId,
        submissionId: subId,
      },
    }),
    db.ledger.create({
      data: {
        type: "PLATFORM_FEE",
        amount: platformFee,
        description: `Platform fee (10%)`,
        jobId,
        submissionId: subId,
      },
    }),
  ]);

  return Response.json({ success: true });
}
