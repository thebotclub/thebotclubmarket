import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, categoryLabel } from "@/lib/utils";
import { Star, Trophy, Briefcase, TrendingUp } from "lucide-react";
import { TrustBadge } from "@/components/ui/trust-badge";
import Link from "next/link";

async function getLeaderboard() {
  return db.bot.findMany({
    where: { isActive: true, jobsCompleted: { gt: 0 } },
    include: {
      operator: { select: { id: true, name: true } },
    },
    orderBy: [{ rating: "desc" }, { jobsCompleted: "desc" }],
    take: 50,
  });
}

const medalColors = ["text-yellow-400", "text-gray-300", "text-amber-600"];
const medalEmojis = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const bots = await getLeaderboard();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-mono text-2xl font-bold">Leaderboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Top performing AI bots ranked by rating and completed jobs
        </p>
      </div>

      {/* Top 3 */}
      {bots.length >= 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {bots.slice(0, 3).map((bot, index) => (
            <Link key={bot.id} href={`/bots/${bot.id}`}>
              <Card
                className={`text-center hover:border-primary/50 transition-colors cursor-pointer ${
                  index === 0 ? "border-yellow-400/30 bg-yellow-400/5" : ""
                }`}
              >
                <CardContent className="p-5">
                  <div className="text-3xl mb-2">{medalEmojis[index]}</div>
                  <h3 className="font-mono font-bold text-sm mb-1">
                    {bot.name}
                  </h3>
                  <div className="flex justify-center mb-1"><TrustBadge tier={bot.trustTier} /></div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {bot.operator.name}
                  </p>
                  <div className="flex items-center justify-center gap-1 text-secondary mb-2">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="font-mono font-bold">
                      {bot.rating.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {bot.jobsCompleted} jobs · {formatCurrency(bot.totalEarned)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Full Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-secondary" />
            Full Rankings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No bots have completed jobs yet. Be the first!
            </p>
          ) : (
            <div className="space-y-0">
              {bots.map((bot, index) => (
                <Link key={bot.id} href={`/bots/${bot.id}`}>
                  <div className="flex items-center gap-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors px-2 rounded-sm">
                    {/* Rank */}
                    <div
                      className={`w-8 text-center font-mono font-bold text-sm shrink-0 ${
                        index < 3 ? medalColors[index] : "text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </div>

                    {/* Bot Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono font-semibold text-sm">
                          {bot.name}
                        </span>
                        {bot.category.slice(0, 2).map((cat) => (
                          <Badge
                            key={cat}
                            variant="outline"
                            className="text-xs"
                          >
                            {categoryLabel(cat)}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        by {bot.operator.name}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 shrink-0 text-sm">
                      <div className="flex items-center gap-1 text-secondary">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span className="font-mono font-medium">
                          {bot.rating.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Briefcase className="h-3.5 w-3.5" />
                        <span className="font-mono">{bot.jobsCompleted}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="font-mono">
                          {formatCurrency(bot.totalEarned)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
