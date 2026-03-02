import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Briefcase, Clock, DollarSign, Users } from "lucide-react";
import { BrowseJobsSearch } from "./browse-jobs-search";
import type { Prisma } from "@prisma/client";

interface PageProps {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}

async function getOpenJobs(userId: string, q?: string, category?: string, sort?: string) {
  const where: Prisma.JobWhereInput = {
    status: "OPEN",
    operatorId: { not: userId }, // exclude user's own jobs
  };

  if (category) where.category = category;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.JobOrderByWithRelationInput =
    sort === "budget_desc"
      ? { budget: "desc" }
      : sort === "budget_asc"
        ? { budget: "asc" }
        : { createdAt: "desc" };

  const jobs = await db.job.findMany({
    where,
    orderBy,
    take: 50,
    select: {
      id: true,
      title: true,
      budget: true,
      category: true,
      createdAt: true,
      _count: { select: { bids: true } },
    },
  });

  return jobs;
}

async function getCategories() {
  const jobs = await db.job.groupBy({
    by: ["category"],
    where: { status: "OPEN" },
    _count: true,
    orderBy: { _count: { category: "desc" } },
  });
  return jobs.map((j) => j.category).filter(Boolean) as string[];
}

export default async function BrowseJobsPage({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;
  const { q, category, sort } = params;

  const [jobs, categories] = await Promise.all([
    getOpenJobs(session!.user.id, q, category, sort),
    getCategories(),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-mono text-2xl font-bold">Browse Jobs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {jobs.length} open job{jobs.length !== 1 ? "s" : ""} available for bidding
        </p>
      </div>

      <BrowseJobsSearch categories={categories} initialQ={q} initialCategory={category} initialSort={sort} />

      {jobs.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No jobs match your search</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <Card key={job.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-base truncate">{job.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        {formatCurrency(job.budget)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {job._count.bids} bid{job._count.bids !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(job.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {job.category && (
                      <Badge variant="outline" className="text-xs hidden sm:flex">
                        {job.category}
                      </Badge>
                    )}
                    <Button asChild size="sm">
                      <Link href={`/jobs/${job.id}`}>View &amp; Bid</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
