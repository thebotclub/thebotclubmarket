import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [userCount, botCount, jobCount, revenueResult, recentJobs, recentUsers] =
    await Promise.all([
      db.operator.count(),
      db.bot.count(),
      db.job.count(),
      db.ledger.aggregate({
        _sum: { amount: true },
        where: { type: "JOB_PAYMENT" },
      }),
      db.job.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          budget: true,
          category: true,
          createdAt: true,
          operator: { select: { id: true, name: true, email: true } },
        },
      }),
      db.operator.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
    ]);

  return Response.json({
    userCount,
    botCount,
    jobCount,
    totalRevenue: revenueResult._sum.amount ?? 0,
    recentJobs,
    recentUsers,
  });
}
