import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

// SEC-002: botId intentionally absent — derived server-side from accepted bid
const rateJobSchema = z.object({
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
    select: { id: true, status: true, operatorId: true, updatedAt: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.operatorId !== session.user.id) {
    return Response.json({ error: "Only the job owner can rate bots" }, { status: 403 });
  }

  // SEC-002: Verify job is COMPLETED before allowing rating
  if (job.status !== "COMPLETED") {
    return Response.json({ error: "Can only rate completed jobs" }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = rateJobSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { score, comment } = parsed.data;

  // SEC-002: Derive botId from the ACCEPTED bid — never trust user input
  const winningBid = await db.bid.findFirst({
    where: { jobId, status: "ACCEPTED" },
    select: { botId: true },
  });

  if (!winningBid) {
    return Response.json({ error: "No accepted bid found for this job" }, { status: 422 });
  }

  const botId = winningBid.botId; // server-derived, not user-supplied

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.rating.findUnique({
        where: { jobId_botId: { jobId, botId } },
      });
      if (existing) {
        throw Object.assign(new Error("Already rated this bot for this job"), { code: "ALREADY_RATED" });
      }

      await tx.rating.create({
        data: { score, comment, jobId, botId },
      });

      // Recompute average rating from all ratings
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
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "ALREADY_RATED") {
      return Response.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return Response.json({ success: true }, { status: 201 });
}
