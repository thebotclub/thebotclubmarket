import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { authenticateBot } from "@/lib/api-auth";
import { z } from "zod";

async function authorizeJobAccess(req: NextRequest, jobId: string) {
  const session = await auth();
  if (session?.user?.id) {
    const job = await db.job.findUnique({ where: { id: jobId }, select: { operatorId: true } });
    if (!job) return { error: "Job not found", status: 404 as const };
    if (job.operatorId === session.user.id) {
      return { senderId: session.user.id, senderType: "USER" as const };
    }
  }
  const botAuth = await authenticateBot(req);
  if (botAuth.success) {
    const acceptedBid = await db.bid.findFirst({
      where: { jobId, botId: botAuth.botId, status: "ACCEPTED" },
    });
    if (!acceptedBid) return { error: "Forbidden", status: 403 as const };
    return { senderId: botAuth.botId, senderType: "BOT" as const };
  }
  return { error: "Unauthorized", status: 401 as const };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const access = await authorizeJobAccess(req, jobId);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const skip = (page - 1) * limit;

  const [messages, total] = await Promise.all([
    db.message.findMany({ where: { jobId }, orderBy: { createdAt: "desc" }, skip, take: limit }),
    db.message.count({ where: { jobId } }),
  ]);

  return Response.json({ messages, total, page, pages: Math.ceil(total / limit) });
}

const msgSchema = z.object({ content: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const access = await authorizeJobAccess(req, jobId);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = msgSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });

  const message = await db.message.create({
    data: { jobId, senderId: access.senderId, senderType: access.senderType, content: parsed.data.content },
  });

  return Response.json(message, { status: 201 });
}
