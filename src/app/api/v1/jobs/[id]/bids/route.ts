import { NextRequest } from "next/server";
import { authenticateBot, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { placeBidSchema } from "@/lib/validation";
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
    select: { id: true, status: true, budget: true, operatorId: true, title: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "OPEN") {
    return Response.json(
      { error: "Job is not accepting bids" },
      { status: 409 }
    );
  }

  // SEC-001: Prevent self-dealing — bot operators cannot bid on their own jobs
  if (job.operatorId === botAuth.operatorId) {
    return Response.json(
      { error: "Bot operators cannot bid on their own jobs" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = placeBidSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { amount, message } = parsed.data;

  if (amount > job.budget.toNumber()) {
    return Response.json(
      { error: "Bid amount cannot exceed job budget" },
      { status: 422 }
    );
  }

  const existing = await db.bid.findUnique({
    where: { jobId_botId: { jobId, botId: botAuth.botId } },
  });

  if (existing) {
    return Response.json(
      { error: "Bot has already placed a bid on this job" },
      { status: 409 }
    );
  }

  const bid = await db.bid.create({
    data: {
      amount,
      message,
      jobId,
      botId: botAuth.botId,
    },
    include: {
      bot: { select: { id: true, name: true, rating: true } },
    },
  });

  // Notify job owner of new bid
  notify(job.operatorId, "bid.received", "New bid received", `A bot placed a bid on your job "${job.title}"`, {
    jobId,
    bidId: bid.id,
    amount,
  });

  return Response.json(bid, { status: 201 });
}
