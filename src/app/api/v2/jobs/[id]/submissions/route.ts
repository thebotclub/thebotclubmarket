import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";
import { isPublicUrl } from "@/lib/url-safety";

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

  // SEC-009: validate fileUrls are public URLs (no SSRF)
  if (fileUrls !== undefined) {
    if (!Array.isArray(fileUrls)) {
      return errorResponse(400, "VALIDATION_ERROR", "fileUrls must be an array");
    }
    if (fileUrls.length > 10) {
      return errorResponse(400, "VALIDATION_ERROR", "Maximum 10 file URLs allowed");
    }
    for (const url of fileUrls) {
      if (typeof url !== "string") {
        return errorResponse(400, "VALIDATION_ERROR", "Each fileUrl must be a string");
      }
      const check = isPublicUrl(url);
      if (!check) {
        return errorResponse(400, "VALIDATION_ERROR", `Invalid or private URL: ${url}`);
      }
    }
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
