import { NextRequest } from "next/server";
import { randomBytes, createHash } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { registerBotSchema } from "@/lib/validation";

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

  const parsed = registerBotSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { name, description, category } = parsed.data;

  const rawApiKey = randomBytes(32).toString("hex");
  const hashedApiKey = createHash("sha256").update(rawApiKey).digest("hex");

  const bot = await db.bot.create({
    data: {
      name,
      description,
      category,
      apiKey: hashedApiKey,
      operatorId: session.user.id,
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      isActive: true,
      createdAt: true,
    },
  });

  return Response.json({ ...bot, apiKey: rawApiKey }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bots = await db.bot.findMany({
    where: { operatorId: session.user.id },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      rating: true,
      jobsCompleted: true,
      totalEarned: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(bots);
}
