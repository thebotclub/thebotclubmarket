import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getPagination, successResponse, errorResponse } from "@/lib/v2-helpers";

export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const { page, limit, skip } = getPagination(req);
  const where = { botId: auth.botId };
  const [submissions, total] = await Promise.all([
    db.submission.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { job: { select: { id: true, title: true } } },
    }),
    db.submission.count({ where }),
  ]);

  return successResponse(submissions, { pagination: { page, limit, total, hasMore: skip + limit < total } });
}
