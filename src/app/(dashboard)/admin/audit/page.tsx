import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@prisma/client";

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

interface PageProps {
  searchParams: Promise<{
    page?: string;
    action?: string;
    userId?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 20;
  const actionFilter = params.action;
  const userIdFilter = params.userId;
  const fromFilter = params.from;
  const toFilter = params.to;

  const where: Prisma.AuditLogWhereInput = {};
  if (actionFilter) where.action = { contains: actionFilter };
  if (userIdFilter) where.userId = userIdFilter;
  if (fromFilter || toFilter) {
    where.createdAt = {};
    if (fromFilter) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(fromFilter);
    if (toFilter) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(toFilter);
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

  const totalPages = Math.ceil(total / pageSize);

  const ACTION_COLORS: Record<string, string> = {
    "job.create": "bg-green-100 text-green-800",
    "job.cancel": "bg-red-100 text-red-800",
    "bid.accept": "bg-blue-100 text-blue-800",
    "submission.approve": "bg-purple-100 text-purple-800",
    "credit.escrow": "bg-yellow-100 text-yellow-800",
  };

  function buildUrl(newPage: number) {
    const q = new URLSearchParams();
    q.set("page", String(newPage));
    if (actionFilter) q.set("action", actionFilter);
    if (userIdFilter) q.set("userId", userIdFilter);
    if (fromFilter) q.set("from", fromFilter);
    if (toFilter) q.set("to", toFilter);
    return `/admin/audit?${q.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-mono text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">{total} total entries</p>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-3 text-sm">
            <input
              name="action"
              defaultValue={actionFilter ?? ""}
              placeholder="Action (e.g. job.create)"
              className="border rounded px-3 py-1.5 text-sm bg-background"
            />
            <input
              name="userId"
              defaultValue={userIdFilter ?? ""}
              placeholder="User ID"
              className="border rounded px-3 py-1.5 text-sm bg-background"
            />
            <input
              name="from"
              type="date"
              defaultValue={fromFilter ?? ""}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            />
            <input
              name="to"
              type="date"
              defaultValue={toFilter ?? ""}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            />
            <Button type="submit" size="sm">Filter</Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/audit">Reset</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resource</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resource ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">User ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {log.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-800"}`}
                      >
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.resource}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                      {log.resourceId ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                      {log.userId ?? "system"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No audit log entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} of {totalPages} · {total} entries
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildUrl(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildUrl(page + 1)}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
