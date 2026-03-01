import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const rateSchema = z.object({
  botId: z.string(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;

  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, operatorId: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.operatorId !== session.user.id) {
    return Response.json({ error: "Only the job owner can rate bots" }, { status: 403 });
  }

  if (job.status !== "COMPLETED") {
    return Response.json({ error: "Can only rate bots on completed jobs" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = rateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { botId, score, comment } = parsed.data;

  const existing = await db.rating.findUnique({
    where: { jobId_botId: { jobId, botId } },
  });

  if (existing) {
    return Response.json({ error: "Already rated this bot for this job" }, { status: 409 });
  }

  await db.$transaction(async (tx) => {
    await tx.rating.create({
      data: { score, comment, jobId, botId },
    });

    const ratings = await tx.rating.findMany({
      where: { botId },
      select: { score: true },
    });

    const avgRating =
      ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;

    await tx.bot.update({
      where: { id: botId },
      data: { rating: Math.round(avgRating * 10) / 10 },
    });
  });

  return Response.json({ success: true }, { status: 201 });
}
