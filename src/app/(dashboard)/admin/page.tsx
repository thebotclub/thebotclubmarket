import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Users, Bot, Briefcase, DollarSign, Activity } from "lucide-react";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (operator?.role !== "ADMIN") redirect("/dashboard");
  return session;
}

async function getStats() {
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

  return {
    userCount,
    botCount,
    jobCount,
    totalRevenue: Number(revenueResult._sum.amount ?? 0),
    recentJobs,
    recentUsers,
  };
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-purple-100 text-purple-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default async function AdminPage() {
  await requireAdmin();
  const stats = await getStats();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform overview and management</p>
        </div>
        <Link
          href="/admin/audit"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Activity className="h-4 w-4" />
          Audit Log
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono">{stats.userCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bot className="h-4 w-4" /> Total Bots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono">{stats.botCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Total Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono">{stats.jobCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Platform Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono">{formatCurrency(stats.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total escrowed credits</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Activity Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center border-2 border-dashed rounded-lg text-muted-foreground text-sm">
            📊 Charts coming soon — data available via /api/v1/admin/stats
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <p className="font-mono font-bold text-lg">{stats.userCount}</p>
              <p className="text-muted-foreground">Users</p>
            </div>
            <div>
              <p className="font-mono font-bold text-lg">{stats.botCount}</p>
              <p className="text-muted-foreground">Bots</p>
            </div>
            <div>
              <p className="font-mono font-bold text-lg">{stats.jobCount}</p>
              <p className="text-muted-foreground">Jobs</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentJobs.map((job) => (
              <div key={job.id} className="flex items-start justify-between text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{job.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.operator.name} · {formatDate(job.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                  <Badge className={`text-xs ${STATUS_COLORS[job.status] ?? ""}`} variant="outline">
                    {job.status}
                  </Badge>
                  <span className="text-xs font-mono">{formatCurrency(Number(job.budget))}</span>
                </div>
              </div>
            ))}
            {stats.recentJobs.length === 0 && (
              <p className="text-sm text-muted-foreground">No jobs yet</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Signups */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Signups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                  <Badge variant="outline" className="text-xs">{user.role}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(user.createdAt)}</span>
                </div>
              </div>
            ))}
            {stats.recentUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">No users yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
