import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate, categoryLabel } from "@/lib/utils";
import { Star, Briefcase, TrendingUp, ArrowRight } from "lucide-react";
import { TrustBadge } from "@/components/ui/trust-badge";
import Link from "next/link";

export default async function PublicBotProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const bot = await db.bot.findUnique({
    where: { id, isActive: true },
    include: {
      operator: { select: { name: true } },
      ratings: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { job: { select: { title: true } } },
      },
      capabilities: true,
      _count: { select: { bids: true, submissions: true } },
    },
  });

  if (!bot) notFound();

  const completionRate = bot.completionRate ? (Number(bot.completionRate) * 100).toFixed(0) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-mono text-3xl font-bold">{bot.name}</h1>
            <TrustBadge tier={bot.trustTier} size="md" />
          </div>
          <p className="text-sm text-muted-foreground">Operated by {bot.operator.name}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-secondary/10 border border-secondary/20 px-3 py-1.5 rounded-md">
          <Star className="h-4 w-4 text-secondary fill-current" />
          <span className="font-mono font-bold text-secondary">{bot.rating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">({bot.ratings.length} reviews)</span>
        </div>
      </div>

      {/* CTA */}
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href={`/jobs/create?botId=${bot.id}`}>
          Hire this Bot <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Jobs Completed", value: bot.jobsCompleted.toString(), icon: Briefcase },
          { label: "Total Earned", value: formatCurrency(bot.totalEarned), icon: TrendingUp },
          { label: "Completion Rate", value: completionRate ? `${completionRate}%` : "N/A", icon: Star },
          { label: "Rating", value: `${bot.rating.toFixed(1)}/5`, icon: Star },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="font-mono font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* About */}
      <Card>
        <CardHeader><CardTitle className="text-sm">About this Bot</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{bot.description ?? "No description provided."}</p>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Specialties</p>
            <div className="flex flex-wrap gap-2">
              {bot.category.map((cat) => (
                <Badge key={cat} variant="outline">{categoryLabel(cat)}</Badge>
              ))}
            </div>
          </div>
          {bot.capabilities.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Capabilities</p>
              <div className="flex flex-wrap gap-2">
                {bot.capabilities.map((c) => (
                  <Badge key={c.id} variant="secondary">{c.category}</Badge>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-muted-foreground">Registered {formatDate(bot.createdAt)}</div>
        </CardContent>
      </Card>

      {/* Reviews */}
      {bot.ratings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Reviews ({bot.ratings.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bot.ratings.map((rating) => (
                <div key={rating.id} className="pb-3 border-b border-border/50 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{rating.job.title}</p>
                    <div className="flex items-center gap-1" role="img" aria-label={`Rating: ${rating.score}/5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} aria-hidden className={`h-3 w-3 ${i < rating.score ? "text-secondary fill-current" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                  </div>
                  {rating.comment && <p className="text-xs text-muted-foreground">{rating.comment}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(rating.createdAt)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
