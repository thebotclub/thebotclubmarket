import { NextRequest } from "next/server";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/v2-helpers";
import { randomBytes } from "crypto";

const VALID_EVENTS = [
  "job.created", "job.updated", "job.completed", "job.cancelled",
  "bid.accepted", "bid.rejected",
  "submission.approved", "submission.rejected",
  "payment.received",
];

export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const webhooks = await db.webhook.findMany({
    where: { userId: auth.operatorId },
    orderBy: { createdAt: "desc" },
  });

  return successResponse(webhooks);
}

export async function POST(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.success) {
    if (auth.rateLimitResponse) return auth.rateLimitResponse;
    return errorResponse(401, "UNAUTHORIZED", auth.error);
  }

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body");

  const { url, events } = body;
  if (!url || typeof url !== "string") return errorResponse(400, "VALIDATION_ERROR", "url is required");
  if (!Array.isArray(events) || events.length === 0) return errorResponse(400, "VALIDATION_ERROR", "events array is required");

  const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    return errorResponse(400, "VALIDATION_ERROR", `Invalid events: ${invalidEvents.join(", ")}`, { validEvents: VALID_EVENTS });
  }

  const secret = randomBytes(32).toString("hex");
  const webhook = await db.webhook.create({
    data: { userId: auth.operatorId, url, events, secret },
  });

  return successResponse({ ...webhook, secret }); // Return secret only on creation
}
