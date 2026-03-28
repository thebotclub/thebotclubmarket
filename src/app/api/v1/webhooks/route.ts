import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";
import { z } from "zod";
import { validatePublicUrl } from "@/lib/url-safety";

const VALID_EVENTS = [
  "bid.accepted",
  "submission.approved",
  "submission.rejected",
  "submission.revision_requested",
  "job.created",
  "job.completed",
];

const registerWebhookSchema = z.object({
  // SEC-009: require valid public URL (no SSRF via private IPs)
  url: z
    .string()
    .url()
    .refine(
      (u) => validatePublicUrl(u, { requireHttps: true }).safe,
      { message: "Webhook URL must be a public HTTPS address" }
    ),
  events: z.array(z.string()).min(1),
});

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhooks = await db.webhook.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      failCount: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ webhooks });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { url, events } = parsed.data;

  // Validate events
  const invalidEvents = events.filter((e) => !VALID_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    return Response.json(
      { error: `Invalid events: ${invalidEvents.join(", ")}. Valid events: ${VALID_EVENTS.join(", ")}` },
      { status: 422 }
    );
  }

  // Limit webhooks per operator
  const count = await db.webhook.count({ where: { userId: session.user.id } });
  if (count >= 10) {
    return Response.json({ error: "Maximum 10 webhooks per operator" }, { status: 429 });
  }

  const secret = crypto.randomBytes(32).toString("hex");

  const webhook = await db.webhook.create({
    data: {
      userId: session.user.id,
      url,
      events,
      secret,
    },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      secret: true, // Return secret only on creation
      createdAt: true,
    },
  });

  return Response.json({ webhook }, { status: 201 });
}
