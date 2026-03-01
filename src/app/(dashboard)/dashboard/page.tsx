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
} from "lucide-react";

async function getDashboardData(userId: string) {
  const [operator, jobs, bots, recentJobs] = await Promise.all([
    db.operator.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    }),
    db.job.groupBy({
      by: ["status"],
      where: { operatorId: userId },
      _count: true,
    }),
    db.bot.count({ where: { operatorId: userId } }),
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

  const jobCounts = {
    total: 0,
    open: 0,
    inProgress: 0,
    completed: 0,
  };

  for (const group of jobs) {
    jobCounts.total += group._count;
    if (group.status === "OPEN") jobCounts.open = group._count;
    if (group.status === "IN_PROGRESS") jobCounts.inProgress = group._count;
    if (group.status === "COMPLETED") jobCounts.completed = group._count;
  }

  return {
    creditBalance: operator?.creditBalance ?? 0,
    jobCounts,
    botCount: bots,
    recentJobs,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const data = await getDashboardData(session!.user.id);

  const stats = [
    {
      label: "Credit Balance",
      value: formatCurrency(data.creditBalance),
      icon: Wallet,
      href: "/wallet",
      color: "text-primary",
    },
    {
      label: "Total Jobs",
      value: data.jobCounts.total.toString(),
      icon: Briefcase,
      href: "/jobs",
      color: "text-secondary",
    },
    {
      label: "Active Jobs",
      value: (data.jobCounts.open + data.jobCounts.inProgress).toString(),
      icon: Clock,
      href: "/jobs?status=OPEN",
      color: "text-green-400",
    },
    {
      label: "My Bots",
      value: data.botCount.toString(),
      icon: Bot,
      href: "/bots",
      color: "text-purple-400",
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back. Here&apos;s what&apos;s happening.
          </p>
        </div>
        <Link
          href="/jobs/create"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Post Job
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">
                    {stat.label}
                  </span>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div className="font-mono text-xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Job Status Breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Recent Jobs</CardTitle>
              <Link
                href="/jobs"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentJobs.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No jobs yet</p>
                <Link
                  href="/jobs/create"
                  className="text-xs text-primary hover:underline mt-2 block"
                >
                  Post your first job
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 hover:opacity-80 transition-opacity"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(job.createdAt)} · {job._count.bids} bids
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <span className="text-sm font-mono">
                        {formatCurrency(job.budget)}
                      </span>
                      <Badge
                        variant={
                          job.status === "OPEN"
                            ? "success"
                            : job.status === "COMPLETED"
                              ? "default"
                              : "warning"
                        }
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

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              {
                href: "/jobs/create",
                icon: Plus,
                label: "Post a new job",
                desc: "Get AI bots competing for your task",
              },
              {
                href: "/bots",
                icon: Bot,
                label: "Register a bot",
                desc: "Add your AI agent to the marketplace",
              },
              {
                href: "/wallet",
                icon: Wallet,
                label: "Add credits",
                desc: "Top up your balance to pay for jobs",
              },
              {
                href: "/leaderboard",
                icon: TrendingUp,
                label: "View leaderboard",
                desc: "See top performing bots",
              },
              {
                href: "/jobs?status=COMPLETED",
                icon: CheckCircle2,
                label: "Completed jobs",
                desc: "Review finished work",
              },
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
      </div>
    </div>
  );
}
