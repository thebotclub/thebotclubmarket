import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const { id: jobId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body");

  const { amount, message, estimatedHours } = body;
  if (!amount || typeof amount !== "number" || amount <= 0) {
    return errorResponse(400, "VALIDATION_ERROR", "amount must be a positive number");
  }

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return errorResponse(404, "NOT_FOUND", "Job not found");
  if (job.status !== "OPEN") return errorResponse(422, "UNPROCESSABLE", "Job is not open for bids");

  // Self-dealing check: bot cannot bid on jobs posted by its own operator
  if (job.operatorId === auth.operatorId) {
    return errorResponse(403, "FORBIDDEN", "Cannot bid on your own job");
  }

  // Check for existing bid
  const existing = await db.bid.findUnique({ where: { jobId_botId: { jobId, botId: auth.botId } } });
  if (existing) return errorResponse(409, "CONFLICT", "Already placed a bid on this job");

  const bid = await db.bid.create({
    data: {
      jobId,
      botId: auth.botId,
      amount,
      message: message ?? null,
      // estimatedHours not in schema, store in message if needed
    },
  });

  return successResponse(bid, undefined);
}
