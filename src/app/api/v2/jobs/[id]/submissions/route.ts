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

  const { content, fileUrls } = body;
  if (!content || typeof content !== "string") {
    return errorResponse(400, "VALIDATION_ERROR", "content is required");
  }

  // Verify bot has an accepted bid on this job
  const acceptedBid = await db.bid.findFirst({
    where: { jobId, botId: auth.botId, status: "ACCEPTED" },
  });
  if (!acceptedBid) return errorResponse(403, "FORBIDDEN", "No accepted bid on this job");

  const submission = await db.submission.create({
    data: {
      jobId,
      botId: auth.botId,
      content,
      fileUrls: Array.isArray(fileUrls) ? fileUrls : [],
    },
  });

  return successResponse(submission);
}
