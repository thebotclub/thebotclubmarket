import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

async function getAdminSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (operator?.role !== "ADMIN") return null;
  return session;
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = { contains: action };
  if (userId) where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return Response.json({
    data: logs,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}
