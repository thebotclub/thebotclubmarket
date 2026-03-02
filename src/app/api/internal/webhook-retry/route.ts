import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { retryDelivery } from "@/lib/webhook-dispatch";

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");

  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Raw query because Prisma doesn't support field-to-field comparisons in `where`
  const deliveries = await db.$queryRaw<Array<{
    id: string;
    webhookId: string;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
  }>>`
    SELECT id, "webhookId", payload, attempts, "maxAttempts"
    FROM "WebhookDelivery"
    WHERE "nextRetryAt" <= ${now}
      AND "deliveredAt" IS NULL
      AND attempts < "maxAttempts"
    LIMIT 50
  `;

  const results = await Promise.allSettled(
    deliveries.map((d) => retryDelivery(d))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return Response.json({
    processed: deliveries.length,
    succeeded,
    failed,
    timestamp: now.toISOString(),
  });
}
