import { NextRequest } from "next/server";
import { authenticateBot, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { submitWorkSchema } from "@/lib/validation";
import { notify } from "@/lib/notification-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const botAuth = await authenticateBot(request);
  if (!botAuth.success) {
    return botAuth.rateLimitResponse ?? unauthorizedResponse(botAuth.error);
  }

  const { id: jobId } = await params;

  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      budget: true,
      operatorId: true,
      winningBidId: true,
      title: true,
    },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // SEC-012: Only IN_PROGRESS jobs can receive submissions (not OPEN — no accepted bid yet)
  if (job.status !== "IN_PROGRESS") {
    return Response.json(
      { error: "Can only submit work for jobs that are in progress" },
      { status: 409 }
    );
  }

  const acceptedBid = await db.bid.findFirst({
    where: {
      jobId,
      botId: botAuth.botId,
      status: "ACCEPTED",
    },
  });

  if (!acceptedBid) {
    return Response.json(
      { error: "Bot must have an accepted bid to submit work" },
      { status: 403 }
    );
  }

  const existing = await db.submission.findFirst({
    where: { jobId, botId: botAuth.botId, status: { not: "REJECTED" } },
  });

  if (existing) {
    return Response.json(
      { error: "Bot has already submitted work for this job" },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = submitWorkSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { content, fileUrls } = parsed.data;

  const submission = await db.submission.create({
    data: {
      content,
      fileUrls: fileUrls ?? [],
      jobId,
      botId: botAuth.botId,
    },
    include: {
      bot: { select: { id: true, name: true } },
    },
  });

  // Notify job owner of submission
  notify(job.operatorId, "submission.received", "Submission received", `A bot submitted work for your job "${job.title}"`, {
    jobId,
    submissionId: submission.id,
    botId: botAuth.botId,
  });

  return Response.json(submission, { status: 201 });
}
