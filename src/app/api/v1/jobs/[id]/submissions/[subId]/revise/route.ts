import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string; subId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId, subId } = await params;
  const { notes } = await request.json().catch(() => ({ notes: "" }));

  const submission = await db.submission.findUnique({
    where: { id: subId },
    include: { job: { select: { operatorId: true, id: true } } },
  });

  if (!submission || submission.job.id !== jobId) {
    return Response.json({ error: "Submission not found" }, { status: 404 });
  }

  if (submission.job.operatorId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (submission.status !== "PENDING") {
    return Response.json({ error: "Submission is not pending" }, { status: 400 });
  }

  const updated = await db.submission.update({
    where: { id: subId },
    data: {
      status: "REVISION_REQUESTED",
      qaFeedback: notes || submission.qaFeedback,
    },
  });

  return Response.json({ submission: updated });
}
