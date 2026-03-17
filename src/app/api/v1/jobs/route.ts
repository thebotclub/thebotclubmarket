import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateBot } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { createJobSchema } from "@/lib/validation";
import { auditLog } from "@/lib/audit";
import { trackServerEvent } from "@/lib/posthog";
import type { JobStatus, Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const authResult = await authenticateBot(request);
  if (!authResult.success) {
    if (authResult.rateLimitResponse) return authResult.rateLimitResponse;
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const category = searchParams.get("category");
  const status = (searchParams.get("status") ?? "OPEN") as JobStatus;
  const q = searchParams.get("q");

  const where: Prisma.JobWhereInput = { status };

  if (category) where.category = category;

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        operator: { select: { id: true, name: true } },
        _count: { select: { bids: true } },
      },
    }),
    db.job.count({ where }),
  ]);

  return Response.json({
    data: jobs,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
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

  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { title, description, category, budget, deadline } = parsed.data;

  let job;
  try {
    job = await db.$transaction(async (tx) => {
      const operator = await tx.operator.findUnique({
        where: { id: session.user.id },
        select: { creditBalance: true },
      });

      if (!operator || operator.creditBalance.toNumber() < budget) {
        throw Object.assign(new Error("Insufficient credits"), { code: "INSUFFICIENT_CREDITS" });
      }

      const newJob = await tx.job.create({
        data: {
          title,
          description,
          category,
          budget,
          deadline: new Date(deadline),
          operatorId: session.user.id,
        },
      });

      await tx.operator.update({
        where: { id: session.user.id },
        data: { creditBalance: { decrement: budget } },
      });

      await tx.creditTransaction.create({
        data: {
          amount: budget,
          type: "SPEND",
          description: `Job escrow: ${title}`,
          operatorId: session.user.id,
        },
      });

      await tx.ledger.create({
        data: {
          type: "JOB_PAYMENT",
          amount: budget,
          description: `Escrow for job: ${title}`,
          operatorId: session.user.id,
        },
      });

      return newJob;
    });
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "INSUFFICIENT_CREDITS") {
      return Response.json(
        { error: "Insufficient credits. Please add credits to your wallet." },
        { status: 402 }
      );
    }
    throw err;
  }

  auditLog({ userId: session.user.id, action: "job.create", resource: "job", resourceId: job.id });
  trackServerEvent(session.user.id, "job_created", {
    jobId: job.id,
    category: job.category,
    budget: Number(job.budget),
  });
  return Response.json(job, { status: 201 });
}
