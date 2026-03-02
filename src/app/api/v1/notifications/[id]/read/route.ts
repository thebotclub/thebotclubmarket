import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const notification = await db.notification.findUnique({
    where: { id },
    select: { userId: true, readAt: true },
  });

  if (!notification) {
    return Response.json({ error: "Notification not found" }, { status: 404 });
  }

  if (notification.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!notification.readAt) {
    await db.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  return Response.json({ success: true });
}
