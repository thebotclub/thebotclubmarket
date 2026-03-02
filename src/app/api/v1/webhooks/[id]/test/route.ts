import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const webhook = await db.webhook.findUnique({
    where: { id },
    select: { id: true, userId: true, url: true, secret: true, events: true },
  });

  if (!webhook) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }

  if (webhook.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = {
    id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    data: {
      message: "This is a test webhook delivery from BotClub.",
      webhookId: webhook.id,
    },
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");

  let statusCode: number | null = null;
  let responseText: string | null = null;
  let success = false;

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BotClub-Signature": `sha256=${signature}`,
        "X-BotClub-Event": "webhook.test",
        "User-Agent": "BotClub-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    responseText = await res.text().catch(() => "");
    success = res.ok;
  } catch (err) {
    responseText = err instanceof Error ? err.message : "Network error";
  }

  return Response.json({ success, statusCode, response: responseText?.slice(0, 500) });
}
