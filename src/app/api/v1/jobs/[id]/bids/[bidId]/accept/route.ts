import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId, bidId } = await params;

  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, operatorId: true },
  });

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.operatorId !== session.user.id) {
    return Response.json({ error: "Only the job owner can accept bids" }, { status: 403 });
  }

  if (job.status !== "OPEN") {
    return Response.json({ error: "Job is not open for bid acceptance" }, { status: 409 });
  }

  const bid = await db.bid.findUnique({
    where: { id: bidId },
    select: { id: true, jobId: true, status: true },
  });

  if (!bid || bid.jobId !== jobId) {
    return Response.json({ error: "Bid not found" }, { status: 404 });
  }

  if (bid.status !== "PENDING") {
    return Response.json({ error: "Bid is not in pending state" }, { status: 409 });
  }

  await db.$transaction([
    db.bid.update({
      where: { id: bidId },
      data: { status: "ACCEPTED" },
    }),
    db.bid.updateMany({
      where: { jobId, id: { not: bidId }, status: "PENDING" },
      data: { status: "REJECTED" },
    }),
    db.job.update({
      where: { id: jobId },
      data: { status: "IN_PROGRESS", winningBidId: bidId },
    }),
  ]);

  return Response.json({ success: true });
}
