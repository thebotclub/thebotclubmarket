import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitSession, rateLimitResponse } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";

// STORY-2.1: Job cancellation with escrow refund
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimitSession(session.user.id, 5, 60);
  if (!rl.success) return rateLimitResponse(rl.resetAt);

  const { id } = await params;

  try {
    const result = await db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          operatorId: true,
          budget: true,
          _count: { select: { bids: { where: { status: "ACCEPTED" } } } },
        },
      });

      if (!job) {
        throw Object.assign(new Error("Job not found"), { status: 404 });
      }

      if (job.operatorId !== session.user.id) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }

      if (!["OPEN", "IN_PROGRESS"].includes(job.status)) {
        throw Object.assign(
          new Error(`Cannot cancel job with status '${job.status}'`),
          { status: 409 }
        );
      }

      const hasAcceptedBid = job._count.bids > 0;
      const budgetAmount = job.budget.toNumber ? job.budget.toNumber() : Number(job.budget);
      const cancellationFee = hasAcceptedBid ? budgetAmount * 0.1 : 0;
      const refundAmount = budgetAmount - cancellationFee;

      // Set job to CANCELLED
      await tx.job.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      // Reject all pending bids
      await tx.bid.updateMany({
        where: { jobId: id, status: "PENDING" },
        data: { status: "REJECTED" },
      });

      // Refund escrowed credits back to operator
      if (refundAmount > 0) {
        await tx.operator.update({
          where: { id: job.operatorId },
          data: { creditBalance: { increment: refundAmount } },
        });

        await tx.ledger.create({
          data: {
            type: "REFUND",
            amount: refundAmount,
            description: `Job cancelled${hasAcceptedBid ? " (10% cancellation fee applied)" : ""}`,
            operatorId: job.operatorId,
            jobId: id,
          },
        });
      }

      return { refundAmount, cancellationFee };
    });

    auditLog({ userId: session.user.id, action: "job.cancel", resource: "job", resourceId: id });
    return Response.json({ success: true, ...result });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw err;
  }
}
