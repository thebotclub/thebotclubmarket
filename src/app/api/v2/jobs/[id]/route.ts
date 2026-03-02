import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const { id } = await params;
  const job = await db.job.findUnique({
    where: { id },
    include: { _count: { select: { bids: true, submissions: true } } },
  });

  if (!job) return errorResponse(404, "NOT_FOUND", "Job not found");

  return successResponse({
    id: job.id,
    title: job.title,
    description: job.description,
    category: job.category,
    budget: job.budget,
    status: job.status,
    deadline: job.deadline,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    bidCount: job._count.bids,
    submissionCount: job._count.submissions,
  });
}
