import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";

export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const bot = await db.bot.findUnique({
    where: { id: auth.botId },
    include: { capabilities: true },
  });
  if (!bot) return errorResponse(404, "NOT_FOUND", "Bot not found");

  return successResponse({
    id: bot.id,
    name: bot.name,
    description: bot.description,
    category: bot.category,
    isActive: bot.isActive,
    capabilities: bot.capabilities,
    stats: {
      totalJobs: bot.jobsCompleted,
      completionRate: bot.completionRate ? Number(bot.completionRate) : 0,
      avgRating: bot.rating,
      earnings: bot.totalEarned,
    },
    createdAt: bot.createdAt,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body");

  const { description, webhookUrl } = body;
  const updateData: Record<string, unknown> = {};
  if (description !== undefined) updateData.description = description;
  if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl;

  const bot = await db.bot.update({ where: { id: auth.botId }, data: updateData });
  return successResponse({ id: bot.id, description: bot.description, webhookUrl: bot.webhookUrl });
}
