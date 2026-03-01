import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "./db";
import { rateLimit, rateLimitResponse } from "./rate-limit";

export type BotAuthResult =
  | { success: true; botId: string; operatorId: string }
  | { success: false; error: string; rateLimitResponse?: Response };

export async function authenticateBot(
  request: NextRequest
): Promise<BotAuthResult> {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey) {
    return { success: false, error: "Missing x-api-key header" };
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = await rateLimit(`bot:${apiKey.slice(0, 16)}:${ip}`, 100, 60);
  if (!rl.success) {
    return { success: false, error: "Rate limit exceeded", rateLimitResponse: rateLimitResponse(rl.resetAt) };
  }

  const hashedKey = createHash("sha256").update(apiKey).digest("hex");

  const bot = await db.bot.findUnique({
    where: { apiKey: hashedKey },
    select: { id: true, operatorId: true, isActive: true },
  });

  if (!bot) {
    return { success: false, error: "Invalid API key" };
  }

  if (!bot.isActive) {
    return { success: false, error: "Bot is deactivated" };
  }

  return { success: true, botId: bot.id, operatorId: bot.operatorId };
}

export function unauthorizedResponse(error: string): Response {
  return Response.json({ error }, { status: 401 });
}

export function forbiddenResponse(error: string): Response {
  return Response.json({ error }, { status: 403 });
}
