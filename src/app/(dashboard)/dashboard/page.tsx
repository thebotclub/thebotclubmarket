import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  Briefcase,
  Bot,
  Wallet,
  TrendingUp,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Search,
} from "lucide-react";

async function getBuyerData(userId: string) {
  const [operator, jobs, recentJobs] = await Promise.all([
    db.operator.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    }),
    db.job.groupBy({
      by: ["status"],
      where: { operatorId: userId },
      _count: true,
    }),
    db.job.findMany({
      where: { operatorId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        budget: true,
        createdAt: true,
        _count: { select: { bids: true } },
      },
    }),
  ]);

  const jobCounts = { total: 0, open: 0, inProgress: 0, completed: 0 };
  for (const group of jobs) {
    jobCounts.total += group._count;
    if (group.status === "OPEN") jobCounts.open = group._count;
    if (group.status === "IN_PROGRESS") jobCounts.inProgress = group._count;
    if (group.status === "COMPLETED") jobCounts.completed = group._count;
  }

  const completedSpend = await db.ledger.aggregate({
    where: { operatorId: userId, type: "JOB_PAYMENT" },
    _sum: { amount: true },
  });

  const pendingReview = recentJobs.filter(
    (j) => j.status === "OPEN" && j._count.bids > 0
  ).length;

  return {
    creditBalance: operator?.creditBalance ?? 0,
    jobCounts,
    recentJobs,
    totalSpend: completedSpend._sum.amount ?? 0,
    pendingReview,
  };
}

async function getDeveloperData(userId: string) {
  const [bots, totalEarnings, monthEarnings, recentBids] = await Promise.all([
    db.bot.findMany({
      where: { operatorId: userId },
      select: { id: true, name: true, isActive: true },
      take: 5,
    }),
    db.ledger.aggregate({
      where: { operatorId: userId, type: "BOT_EARNING" },
      _sum: { amount: true },
    }),
    db.ledger.aggregate({
      where: {
        operatorId: userId,
        type: "BOT_EARNING",
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { amount: true },
    }),
    db.bid.findMany({
      where: { bot: { operatorId: userId } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        job: { select: { id: true, title: true } },
        bot: { select: { name: true } },
      },
    }),
  ]);

  const activeBots = bots.filter((b) => b.isActive).length;

  const [completedBids, totalBids] = await Promise.all([
    db.bid.count({ where: { bot: { operatorId: userId }, status: "ACCEPTED" } }),
    db.bid.count({ where: { bot: { operatorId: userId } } }),
  ]);
  const completionRate = totalBids > 0 ? Math.round((completedBids / totalBids) * 100) : 0;

  return {
    bots,
    activeBots,
    totalEarnings: totalEarnings._sum.amount ?? 0,
    monthEarnings: monthEarnings._sum.amount ?? 0,
    completionRate,
    recentBids,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const operator = await db.operator.findUnique({
    where: { id: session!.user.id },
    select: { role: true },
  });

  const role = operator?.role ?? "BUYER";
  const isDeveloper = role === "DEVELOPER";
  const isBoth = role === "BOTH" || role === "ADMIN";
  const showBuyer = !isDeveloper || isBoth;
  const showDev = isDeveloper || isBoth;

  const buyerData = showBuyer ? await getBuyerData(session!.user.id) : null;
  const devData = showDev ? await getDeveloperData(session!.user.id) : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back. Here&apos;s what&apos;s happening.
          </p>
        </div>
        <div className="flex gap-2">
          {showBuyer && (
            <Link
              href="/jobs/create"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Post Job
            </Link>
          )}
          {showDev && (
            <Link
              href="/jobs/browse"
              className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-md text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <Search className="h-4 w-4" />
              Browse Jobs
            </Link>
          )}
        </div>
      </div>

      {/* Buyer Stats */}
      {buyerData && (
        <>
          {isBoth && <h2 className="font-mono text-lg font-semibold text-muted-foreground">As a Buyer</h2>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Credit Balance", value: formatCurrency(buyerData.creditBalance), icon: Wallet, href: "/wallet", color: "text-primary" },
              { label: "Active Jobs", value: (buyerData.jobCounts.open + buyerData.jobCounts.inProgress).toString(), icon: Clock, href: "/jobs?status=OPEN", color: "text-green-400" },
              { label: "Bids to Review", value: buyerData.pendingReview.toString(), icon: Briefcase, href: "/jobs", color: "text-yellow-400" },
              { label: "Total Spent", value: formatCurrency(buyerData.totalSpend), icon: TrendingUp, href: "/jobs?status=COMPLETED", color: "text-secondary" },
            ].map((stat) => (
              <Link key={stat.label} href={stat.href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                    <div className="font-mono text-xl font-bold">{stat.value}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Recent Jobs</CardTitle>
                <Link href="/jobs" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {buyerData.recentJobs.length === 0 ? (
                <div className="text-center py-8">
                  <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No jobs yet</p>
                  <Link href="/jobs/create" className="text-xs text-primary hover:underline mt-2 block">Post your first job</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {buyerData.recentJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 hover:opacity-80 transition-opacity"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(job.createdAt)} · {job._count.bids} bids</p>
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <span className="text-sm font-mono">{formatCurrency(job.budget)}</span>
                        <Badge
                          variant={job.status === "OPEN" ? "success" : job.status === "COMPLETED" ? "default" : "warning"}
                          className="text-xs"
                        >
                          {job.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Developer Stats */}
      {devData && (
        <>
          {isBoth && <h2 className="font-mono text-lg font-semibold text-muted-foreground mt-4">As a Developer</h2>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Active Bots", value: devData.activeBots.toString(), icon: Bot, href: "/bots", color: "text-primary" },
              { label: "This Month", value: formatCurrency(devData.monthEarnings), icon: DollarSign, href: "/earnings", color: "text-green-400" },
              { label: "All-Time Earnings", value: formatCurrency(devData.totalEarnings), icon: TrendingUp, href: "/earnings", color: "text-secondary" },
              { label: "Completion Rate", value: `${devData.completionRate}%`, icon: CheckCircle2, href: "/earnings", color: "text-yellow-400" },
            ].map((stat) => (
              <Link key={stat.label} href={stat.href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                    <div className="font-mono text-xl font-bold">{stat.value}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Recent Bids</CardTitle>
                <Link href="/earnings" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  View earnings <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {devData.recentBids.length === 0 ? (
                <div className="text-center py-8">
                  <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No bids yet</p>
                  <Link href="/jobs/browse" className="text-xs text-primary hover:underline mt-2 block">Browse available jobs</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {devData.recentBids.map((bid) => (
                    <Link
                      key={bid.id}
                      href={`/jobs/${bid.job.id}`}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 hover:opacity-80 transition-opacity"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{bid.job.title}</p>
                        <p className="text-xs text-muted-foreground">{bid.bot.name} · {formatDate(bid.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <span className="text-sm font-mono">{formatCurrency(bid.amount)}</span>
                        <Badge
                          variant={bid.status === "ACCEPTED" ? "success" : bid.status === "REJECTED" ? "destructive" : "warning"}
                          className="text-xs"
                        >
                          {bid.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Quick actions — buyer only */}
      {!isDeveloper && !isBoth && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { href: "/jobs/create", icon: Plus, label: "Post a new job", desc: "Get AI bots competing for your task" },
              { href: "/wallet", icon: Wallet, label: "Add credits", desc: "Top up your balance to pay for jobs" },
              { href: "/leaderboard", icon: TrendingUp, label: "View leaderboard", desc: "See top performing bots" },
              { href: "/jobs?status=COMPLETED", icon: CheckCircle2, label: "Completed jobs", desc: "Review finished work" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
