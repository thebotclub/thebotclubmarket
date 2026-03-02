import crypto from "crypto";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

function generateEventId(): string {
  return `evt_${crypto.randomBytes(12).toString("hex")}`;
}

function computeSignature(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function exponentialBackoff(attempts: number): Date {
  // 1min, 5min, 30min, 2hr, 8hr
  const delays = [60, 300, 1800, 7200, 28800];
  const delaySecs = delays[Math.min(attempts, delays.length - 1)];
  return new Date(Date.now() + delaySecs * 1000);
}

async function deliverWebhook(
  webhookId: string,
  deliveryId: string,
  url: string,
  secret: string,
  payload: Record<string, unknown>,
  currentAttempts: number,
  maxAttempts: number
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = computeSignature(secret, body);

  let statusCode: number | null = null;
  let responseText: string | null = null;
  let success = false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BotClub-Signature": `sha256=${signature}`,
        "X-BotClub-Event": payload.event as string,
        "User-Agent": "BotClub-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    statusCode = res.status;
    responseText = await res.text().catch(() => "");
    success = res.ok;
  } catch {
    // Network error — treat as failure
  }

  const newAttempts = currentAttempts + 1;

  if (success) {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode,
        response: responseText?.slice(0, 2000),
        attempts: newAttempts,
        deliveredAt: new Date(),
        nextRetryAt: null,
      },
    });
  } else {
    const shouldRetry = newAttempts < maxAttempts;
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode,
        response: responseText?.slice(0, 2000),
        attempts: newAttempts,
        nextRetryAt: shouldRetry ? exponentialBackoff(newAttempts) : null,
      },
    });

    // Auto-disable webhook after 10 cumulative failures
    await db.webhook.update({
      where: { id: webhookId },
      data: { failCount: { increment: 1 } },
    });

    const webhook = await db.webhook.findUnique({
      where: { id: webhookId },
      select: { failCount: true },
    });

    if (webhook && webhook.failCount >= 10) {
      await db.webhook.update({
        where: { id: webhookId },
        data: { active: false },
      });
    }
  }
}

export async function dispatchWebhook(
  operatorId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  // Fire-and-forget: don't block the caller
  Promise.resolve().then(async () => {
    try {
      const webhooks = await db.webhook.findMany({
        where: {
          userId: operatorId,
          active: true,
          events: { has: event },
        },
      });

      if (webhooks.length === 0) return;

      const eventId = generateEventId();
      const timestamp = new Date().toISOString();
      const payload: Record<string, unknown> = { id: eventId, event, timestamp, data };

      for (const webhook of webhooks) {
        const delivery = await db.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            event,
            payload: payload as Prisma.InputJsonValue,
            attempts: 0,
            maxAttempts: 5,
          },
        });

        await deliverWebhook(
          webhook.id,
          delivery.id,
          webhook.url,
          webhook.secret,
          payload,
          0,
          delivery.maxAttempts
        );
      }
    } catch (err) {
      console.error("[webhook-dispatch] Error dispatching webhook:", err);
    }
  });
}

/** Called by the retry worker to re-attempt a failed delivery */
export async function retryDelivery(delivery: {
  id: string;
  webhookId: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}): Promise<void> {
  const webhook = await db.webhook.findUnique({
    where: { id: delivery.webhookId },
    select: { url: true, secret: true, active: true },
  });

  if (!webhook || !webhook.active) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { nextRetryAt: null },
    });
    return;
  }

  await deliverWebhook(
    delivery.webhookId,
    delivery.id,
    webhook.url,
    webhook.secret,
    delivery.payload as Record<string, unknown>,
    delivery.attempts,
    delivery.maxAttempts
  );
}
