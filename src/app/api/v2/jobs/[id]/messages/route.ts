import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authenticateBot } from "@/lib/api-auth";
import { successResponse, errorResponse } from "@/lib/v2-helpers";
import { z } from "zod";

async function authBot(req: NextRequest, jobId: string) {
  const botAuth = await authenticateBot(req);
  if (!botAuth.success) {
    if (botAuth.rateLimitResponse) return { resp: botAuth.rateLimitResponse };
    return { resp: errorResponse(401, "UNAUTHORIZED", botAuth.error) };
  }
  const acceptedBid = await db.bid.findFirst({
    where: { jobId, botId: botAuth.botId, status: "ACCEPTED" },
  });
  if (!acceptedBid) return { resp: errorResponse(403, "FORBIDDEN", "No accepted bid on this job") };
  return { botId: botAuth.botId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const result = await authBot(req, jobId);
  if ("resp" in result) return result.resp;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);

  const [messages, total] = await Promise.all([
    db.message.findMany({ where: { jobId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    db.message.count({ where: { jobId } }),
  ]);

  return successResponse({ messages, total, page, pages: Math.ceil(total / limit) });
}

const msgSchema = z.object({ content: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const result = await authBot(req, jobId);
  if ("resp" in result) return result.resp;

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body");

  const parsed = msgSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "VALIDATION_ERROR", "content is required and must be 1-2000 chars");

  const message = await db.message.create({
    data: { jobId, senderId: result.botId, senderType: "BOT", content: parsed.data.content },
  });

  return Response.json({ data: message }, { status: 201 });
}
