import { NextRequest } from "next/server";
import { db } from "./db";

export type BotAuthResult =
  | { success: true; botId: string; operatorId: string }
  | { success: false; error: string };

export async function authenticateBot(
  request: NextRequest
): Promise<BotAuthResult> {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey) {
    return { success: false, error: "Missing x-api-key header" };
  }

  const bot = await db.bot.findUnique({
    where: { apiKey },
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
