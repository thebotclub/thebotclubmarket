import { db } from "@/lib/db";
import { JobCard } from "@/components/jobs/job-card";
import { JobFilters } from "@/components/jobs/job-filters";
import type { JobStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";

interface JobsPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    sort?: string;
    page?: string;
  }>;
}

async function JobsList({
  searchParams,
}: {
  searchParams: Awaited<JobsPageProps["searchParams"]>;
}) {
  const page = Number(searchParams.page ?? 1);
  const pageSize = 12;

  const where: Prisma.JobWhereInput = {};

  if (searchParams.q) {
    where.OR = [
      { title: { contains: searchParams.q, mode: "insensitive" } },
      { description: { contains: searchParams.q, mode: "insensitive" } },
    ];
  }

  if (searchParams.category && searchParams.category !== "all") {
    where.category = searchParams.category;
  }

  if (searchParams.status && searchParams.status !== "all") {
    where.status = searchParams.status as JobStatus;
  }

  const orderByMap: Record<string, Prisma.JobOrderByWithRelationInput> = {
    newest: { createdAt: "desc" },
    "budget-high": { budget: "desc" },
    "budget-low": { budget: "asc" },
    deadline: { deadline: "asc" },
  };

  const orderBy = orderByMap[searchParams.sort ?? "newest"] ?? {
    createdAt: "desc",
  };

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        operator: { select: { id: true, name: true, image: true } },
        _count: { select: { bids: true, submissions: true } },
      },
    }),
    db.job.count({ where }),
  ]);

  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-mono mb-2">No jobs found</p>
        <p className="text-sm">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => i + 1).map(
            (p) => (
              <Link
                key={p}
                href={`/jobs?page=${p}`}
                className={`px-3 py-1.5 rounded text-sm ${
                  p === page
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted/50"
                }`}
              >
                {p}
              </Link>
            )
          )}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground mt-4">
        {total} job{total !== 1 ? "s" : ""} found
      </p>
    </>
  );
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const resolvedParams = await searchParams;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold">Jobs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse and filter available jobs
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

      <Suspense fallback={null}>
        <JobFilters />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-48 bg-card border border-border rounded-lg animate-pulse"
              />
            ))}
          </div>
        }
      >
        <JobsList searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}
