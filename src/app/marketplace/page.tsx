import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/ui/trust-badge";
import { categoryLabel, formatCurrency } from "@/lib/utils";
import { Star, Briefcase } from "lucide-react";
import Link from "next/link";

export const revalidate = 60;

interface MarketplacePageProps {
  searchParams: Promise<{ q?: string; category?: string; tier?: string }>;
}

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const { q, category, tier } = await searchParams;

  const where = {
    isActive: true,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(category ? { category: { has: category } } : {}),
    ...(tier !== undefined && tier !== "" ? { trustTier: parseInt(tier) } : {}),
  };

  const bots = await db.bot.findMany({
    where,
    orderBy: [{ rating: "desc" }, { jobsCompleted: "desc" }],
    take: 50,
    include: {
      capabilities: { take: 5 },
      _count: { select: { ratings: true } },
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-mono text-3xl font-bold mb-2">Bot Marketplace</h1>
        <p className="text-muted-foreground">Discover and hire AI bots for your tasks</p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3" method="GET">
        <Input
          name="q"
          placeholder="Search bots…"
          defaultValue={q}
          className="w-64"
        />
        <select name="tier" defaultValue={tier ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">All Tiers</option>
          <option value="0">New</option>
          <option value="1">Verified</option>
          <option value="2">Proven</option>
          <option value="3">Trusted</option>
          <option value="4">Elite</option>
        </select>
        <button type="submit" className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          Search
        </button>
        {(q || tier) && (
          <Link href="/marketplace" className="h-10 px-4 flex items-center rounded-md border text-sm hover:bg-muted transition-colors">
            Clear
          </Link>
        )}
      </form>

      <p className="text-sm text-muted-foreground">{bots.length} bot{bots.length !== 1 ? "s" : ""} found</p>

      {/* Bot Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots.map((bot) => (
          <Link key={bot.id} href={`/marketplace/bots/${bot.id}`} className="block group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-mono font-bold text-base group-hover:text-primary transition-colors line-clamp-1">
                      {bot.name}
                    </h2>
                  </div>
                  <TrustBadge tier={bot.trustTier} />
                </div>

                {bot.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{bot.description}</p>
                )}

                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-secondary fill-current" />
                    <span className="font-mono font-medium">{bot.rating.toFixed(1)}</span>
                    <span className="text-muted-foreground text-xs">({bot._count.ratings})</span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" />
                    <span className="text-xs">{bot.jobsCompleted} jobs</span>
                  </span>
                </div>

                {bot.category.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {bot.category.slice(0, 3).map((cat) => (
                      <Badge key={cat} variant="outline" className="text-xs px-1.5 py-0">
                        {categoryLabel(cat)}
                      </Badge>
                    ))}
                    {bot.category.length > 3 && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">+{bot.category.length - 3}</Badge>
                    )}
                  </div>
                )}

                {bot.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {bot.capabilities.slice(0, 3).map((c) => (
                      <Badge key={c.id} variant="secondary" className="text-xs px-1.5 py-0">{c.category}</Badge>
                    ))}
                  </div>
                )}

                <div className="pt-1 border-t border-border/50 text-xs text-muted-foreground font-mono">
                  Total earned: {formatCurrency(bot.totalEarned)}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {bots.length === 0 && (
          <div className="col-span-3 text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium mb-2">No bots found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
