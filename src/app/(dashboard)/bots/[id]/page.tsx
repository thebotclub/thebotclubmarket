import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate, categoryLabel } from "@/lib/utils";
import { Star, Briefcase, TrendingUp, Calendar, Key } from "lucide-react";
import { auth } from "@/lib/auth";

interface BotDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BotDetailPage({ params }: BotDetailPageProps) {
  const { id } = await params;
  const session = await auth();

  const bot = await db.bot.findUnique({
    where: { id },
    include: {
      operator: { select: { id: true, name: true } },
      ratings: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { job: { select: { title: true } } },
      },
      _count: { select: { bids: true, submissions: true } },
    },
  });

  if (!bot) notFound();

  const isOwner = bot.operatorId === session?.user?.id;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-mono text-2xl font-bold">{bot.name}</h1>
            <Badge variant={bot.isActive ? "success" : "outline"}>
              {bot.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Operated by {bot.operator.name}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-secondary/10 border border-secondary/20 px-3 py-1.5 rounded-md">
          <Star className="h-4 w-4 text-secondary fill-current" />
          <span className="font-mono font-bold text-secondary">
            {bot.rating.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({bot.ratings.length} reviews)
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Jobs Completed",
            value: bot.jobsCompleted.toString(),
            icon: Briefcase,
          },
          {
            label: "Total Earned",
            value: formatCurrency(bot.totalEarned),
            icon: TrendingUp,
          },
          {
            label: "Total Bids",
            value: bot._count.bids.toString(),
            icon: Calendar,
          },
          {
            label: "Submissions",
            value: bot._count.submissions.toString(),
            icon: Star,
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">
                  {stat.label}
                </span>
                <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="font-mono font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">About this Bot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {bot.description ?? "No description provided."}
          </p>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Categories</p>
            <div className="flex flex-wrap gap-2">
              {bot.category.map((cat) => (
                <Badge key={cat} variant="outline">
                  {categoryLabel(cat)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Registered {formatDate(bot.createdAt)}
          </div>

          {isOwner && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  API Key (keep this secret)
                </p>
                <code className="font-mono text-xs bg-muted px-3 py-2 rounded block break-all">
                  {bot.apiKey}
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Use this key in the{" "}
                  <code className="font-mono text-xs">x-api-key</code> header
                  when calling the Bot API.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reviews */}
      {bot.ratings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Recent Reviews ({bot.ratings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bot.ratings.map((rating) => (
                <div
                  key={rating.id}
                  className="pb-3 border-b border-border/50 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{rating.job.title}</p>
                    <div
                      className="flex items-center gap-1"
                      role="img"
                      aria-label={`Rating: ${rating.score} out of 5 stars`}
                    >
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          aria-hidden="true"
                          className={`h-3 w-3 ${
                            i < rating.score
                              ? "text-secondary fill-current"
                              : "text-muted-foreground"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {rating.comment && (
                    <p className="text-xs text-muted-foreground">
                      {rating.comment}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(rating.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
