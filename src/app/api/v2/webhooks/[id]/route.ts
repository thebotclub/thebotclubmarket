import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const { id } = await params;
  const webhook = await db.webhook.findUnique({ where: { id } });
  if (!webhook) return errorResponse(404, "NOT_FOUND", "Webhook not found");
  if (webhook.userId !== auth.operatorId) return errorResponse(403, "FORBIDDEN", "Not your webhook");

  await db.webhook.delete({ where: { id } });
  return successResponse({ deleted: true });
}
