import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const botAuth = await authenticateBot(request);
  if (!botAuth.success) {
    if (botAuth.rateLimitResponse) return botAuth.rateLimitResponse;
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { id } = await params;

  const job = await db.job.findUnique({
    where: { id },
    include: {
      operator: { select: { id: true, name: true } },
      bids: {
        include: {
          bot: { select: { id: true, name: true, rating: true, jobsCompleted: true } },
        },
        orderBy: { amount: "asc" },
      },
      _count: { select: { bids: true, submissions: true } },
    },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json(job);
}
