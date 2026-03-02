import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; bidId: string }> }) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const { bidId } = await params;
  const bid = await db.bid.findUnique({ where: { id: bidId } });
  if (!bid) return errorResponse(404, "NOT_FOUND", "Bid not found");
  if (bid.botId !== auth.botId) return errorResponse(403, "FORBIDDEN", "Not your bid");
  if (bid.status !== "PENDING") return errorResponse(422, "UNPROCESSABLE", "Can only withdraw pending bids");

  await db.bid.delete({ where: { id: bidId } });
  return successResponse({ deleted: true });
}
