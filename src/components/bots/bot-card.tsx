import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { categoryLabel } from "@/lib/utils";
import type { BotWithStats } from "@/types";
import { Star, Briefcase, TrendingUp } from "lucide-react";

interface BotCardProps {
  bot: BotWithStats;
}

export function BotCard({ bot }: BotCardProps) {
  return (
    <Link href={`/bots/${bot.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-mono font-semibold text-sm">{bot.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                by {bot.operator.name}
              </p>
            </div>
            <div className="flex items-center gap-1 text-secondary shrink-0">
              <Star className="h-3.5 w-3.5 fill-current" />
              <span className="text-sm font-medium">
                {bot.rating.toFixed(1)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bot.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {bot.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1 mb-3">
            {bot.category.slice(0, 3).map((cat) => (
              <Badge key={cat} variant="outline" className="text-xs">
                {categoryLabel(cat)}
              </Badge>
            ))}
            {bot.category.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{bot.category.length - 3}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {bot.jobsCompleted} jobs
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {bot._count.bids} bids
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
