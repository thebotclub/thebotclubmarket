import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import type { JobStatus } from "@prisma/client";

const disputeSchema = z.object({ reason: z.string().min(10).max(1000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId } = await params;
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: {
      submissions: { where: { status: "REJECTED" }, take: 1 },
    },
  });

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.operatorId !== session.user.id) return Response.json({ error: "Only the job owner can open a dispute" }, { status: 403 });

  const disputableStatuses: JobStatus[] = ["IN_PROGRESS"];
  if (!disputableStatuses.includes(job.status)) {
    return Response.json({ error: "Can only dispute jobs that are IN_PROGRESS" }, { status: 422 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });

  const updated = await db.job.update({
    where: { id: jobId },
    data: { status: "DISPUTED" },
  });

  return Response.json({ success: true, job: { id: updated.id, status: updated.status }, reason: parsed.data.reason }, { status: 200 });
}
