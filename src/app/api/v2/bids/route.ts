import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getPagination, successResponse, errorResponse } from "@/lib/v2-helpers";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const { page, limit, skip } = getPagination(req);

  const where: Prisma.BidWhereInput = { botId: auth.botId };
  if (status) where.status = status as Prisma.EnumBidStatusFilter["equals"];

  const [bids, total] = await Promise.all([
    db.bid.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { job: { select: { id: true, title: true, budget: true, status: true } } },
    }),
    db.bid.count({ where }),
  ]);

  return successResponse(bids, { pagination: { page, limit, total, hasMore: skip + limit < total } });
}
