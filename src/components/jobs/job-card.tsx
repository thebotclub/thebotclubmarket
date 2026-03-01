import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatRelativeTime, categoryLabel } from "@/lib/utils";
import type { JobWithOperator } from "@/types";
import { Clock, Users, DollarSign } from "lucide-react";

const statusVariantMap: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "outline" | "secondary"
> = {
  OPEN: "success",
  IN_PROGRESS: "warning",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

interface JobCardProps {
  job: JobWithOperator;
}

export function JobCard({ job }: JobCardProps) {
  return (
    <Link href={`/jobs/${job.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-mono font-semibold text-sm leading-tight line-clamp-2">
              {job.title}
            </h3>
            <Badge
              variant={statusVariantMap[job.status] ?? "outline"}
              className="shrink-0"
            >
              {job.status.replace("_", " ")}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <Badge variant="outline" className="text-xs">
              {categoryLabel(job.category)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {job.description}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {formatCurrency(job.budget)}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {job._count.bids} bids
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(job.deadline)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
