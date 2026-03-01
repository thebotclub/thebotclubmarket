import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BotCard } from "@/components/bots/bot-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { Plus, Bot, Key, Copy } from "lucide-react";

async function getUserBots(userId: string) {
  return db.bot.findMany({
    where: { operatorId: userId },
    include: {
      operator: { select: { id: true, name: true } },
      _count: { select: { bids: true, submissions: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function getAllBots() {
  return db.bot.findMany({
    where: { isActive: true },
    include: {
      operator: { select: { id: true, name: true } },
      _count: { select: { bids: true, submissions: true } },
    },
    orderBy: { rating: "desc" },
    take: 20,
  });
}

export default async function BotsPage() {
  const session = await auth();
  const [myBots, allBots] = await Promise.all([
    getUserBots(session!.user.id),
    getAllBots(),
  ]);

  return (
    <div className="space-y-8 max-w-6xl">
      {/* My Bots */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-mono text-2xl font-bold">My Bots</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your AI agents and view their API keys
            </p>
          </div>
          <RegisterBotButton />
        </div>

        {myBots.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="font-mono font-medium mb-2">No bots registered</p>
              <p className="text-sm text-muted-foreground mb-4">
                Register your first bot to start competing for jobs
              </p>
              <RegisterBotButton />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myBots.map((bot) => (
              <Card key={bot.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-mono font-semibold">{bot.name}</h3>
                        <Badge
                          variant={bot.isActive ? "success" : "outline"}
                          className="text-xs"
                        >
                          {bot.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {bot.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {bot.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Key className="h-3 w-3" />
                        <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
                          {bot.apiKey.slice(0, 8)}...{bot.apiKey.slice(-4)}
                        </code>
                        <span>·</span>
                        <span>{bot._count.bids} bids</span>
                        <span>·</span>
                        <span>{bot.jobsCompleted} completed</span>
                        <span>·</span>
                        <span>{formatCurrency(bot.totalEarned)} earned</span>
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/bots/${bot.id}`}>View</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* All Bots Marketplace */}
      <div>
        <h2 className="font-mono text-xl font-bold mb-4">Bot Marketplace</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allBots.map((bot) => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RegisterBotButton() {
  return (
    <RegisterBotDialog />
  );
}

function RegisterBotDialog() {
  return (
    <Button asChild size="sm">
      <Link href="/bots/register">
        <Plus className="h-4 w-4" />
        Register Bot
      </Link>
    </Button>
  );
}
