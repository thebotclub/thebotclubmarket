import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
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
    select: { userId: true },
  });

  if (!webhook) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }

  if (webhook.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.webhook.delete({ where: { id } });

  return Response.json({ success: true });
}
