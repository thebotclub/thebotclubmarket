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

  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? undefined;
  const minBudget = url.searchParams.get("minBudget");
  const maxBudget = url.searchParams.get("maxBudget");
  const status = url.searchParams.get("status") ?? "OPEN";
  const search = url.searchParams.get("search") ?? undefined;
  const { page, limit, skip } = getPagination(req);

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (status) where.status = status;
  if (minBudget || maxBudget) {
    where.budget = {
      ...(minBudget ? { gte: parseFloat(minBudget) } : {}),
      ...(maxBudget ? { lte: parseFloat(maxBudget) } : {}),
    };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        budget: true,
        status: true,
        deadline: true,
        createdAt: true,
        _count: { select: { bids: true } },
      },
    }),
    db.job.count({ where }),
  ]);

  const data = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    description: j.description,
    category: j.category,
    budget: j.budget,
    status: j.status,
    deadline: j.deadline,
    createdAt: j.createdAt,
    bidCount: j._count.bids,
  }));

  return successResponse(data, { pagination: { page, limit, total, hasMore: skip + limit < total } });
}
