import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DollarSign, TrendingUp, Clock, Banknote } from "lucide-react";
import { EarningsActions, PayoutStatusBadge } from "@/components/earnings/earnings-actions";

async function getEarningsData(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalEarnings, monthEarnings, totalPaidOut, transactions, operator] = await Promise.all([
    db.ledger.aggregate({
      where: { operatorId: userId, type: "BOT_EARNING" },
      _sum: { amount: true },
    }),
    db.ledger.aggregate({
      where: { operatorId: userId, type: "BOT_EARNING", createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    db.ledger.aggregate({
      where: { operatorId: userId, type: "PAYOUT" },
      _sum: { amount: true },
    }),
    db.ledger.findMany({
      where: { operatorId: userId, type: { in: ["BOT_EARNING", "PAYOUT"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        createdAt: true,
      },
    }),
    db.operator.findUnique({
      where: { id: userId },
      select: {
        creditBalance: true,
        stripeConnectAccountId: true,
        payoutEnabled: true,
      },
    }),
  ]);

  return {
    totalEarnings: totalEarnings._sum.amount ?? 0,
    monthEarnings: monthEarnings._sum.amount ?? 0,
    totalPaidOut: totalPaidOut._sum.amount ?? 0,
    creditBalance: operator?.creditBalance ?? 0,
    stripeConnectAccountId: operator?.stripeConnectAccountId ?? null,
    payoutEnabled: operator?.payoutEnabled ?? false,
    transactions,
  };
}

export default async function EarningsPage() {
  const session = await auth();
  const data = await getEarningsData(session!.user.id);

  // Available = total earned minus already paid out
  const availableForPayout =
    Math.max(0, Number(data.totalEarnings) - Number(data.totalPaidOut));

  const payoutHistory = data.transactions.filter((tx) => tx.type === "PAYOUT");
  const earningHistory = data.transactions.filter((tx) => tx.type === "BOT_EARNING");

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-bold">Earnings &amp; Payouts</h1>
            <PayoutStatusBadge payoutEnabled={data.payoutEnabled} />
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Track your bot earnings and withdraw to your bank account
          </p>
        </div>

        <EarningsActions
          payoutEnabled={data.payoutEnabled}
          connectAccountExists={!!data.stripeConnectAccountId}
          availableCredits={availableForPayout}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "All-Time Earnings",
            value: formatCurrency(data.totalEarnings),
            icon: TrendingUp,
            color: "text-primary",
          },
          {
            label: "This Month",
            value: formatCurrency(data.monthEarnings),
            icon: DollarSign,
            color: "text-green-400",
          },
          {
            label: "Available for Payout",
            value: formatCurrency(availableForPayout),
            icon: Banknote,
            color: "text-secondary",
          },
          {
            label: "Total Paid Out",
            value: formatCurrency(data.totalPaidOut),
            icon: Clock,
            color: "text-muted-foreground",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="font-mono text-xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ready to withdraw banner */}
      {availableForPayout > 0 && data.payoutEnabled && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-medium">Ready to withdraw</p>
              <p className="text-2xl font-mono font-bold text-primary mt-1">
                {formatCurrency(availableForPayout)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ≈ ${(availableForPayout / 10).toFixed(2)} USD at 1 credit = $0.10
              </p>
            </div>
            <EarningsActions
              payoutEnabled={data.payoutEnabled}
              connectAccountExists={!!data.stripeConnectAccountId}
              availableCredits={availableForPayout}
            />
          </CardContent>
        </Card>
      )}

      {/* Connect Stripe CTA (when no account yet) */}
      {!data.stripeConnectAccountId && (
        <Card className="border-dashed border-muted-foreground/30">
          <CardContent className="p-6 text-center space-y-3">
            <Banknote className="h-8 w-8 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium">Set up payouts</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your Stripe account to withdraw your earnings directly to your bank.
                <br />
                1 credit = $0.10 USD · Minimum payout: 100 credits ($10.00)
              </p>
            </div>
            <EarningsActions
              payoutEnabled={false}
              connectAccountExists={false}
              availableCredits={availableForPayout}
            />
          </CardContent>
        </Card>
      )}

      {/* Payout history */}
      {payoutHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Payout History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {payoutHistory.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      Payout
                    </Badge>
                    <span className="font-mono text-sm font-medium text-muted-foreground">
                      -{formatCurrency(tx.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Earning history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Earning History</CardTitle>
        </CardHeader>
        <CardContent>
          {earningHistory.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No earnings yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Start bidding on jobs to earn credits
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {earningHistory.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <Badge variant="success" className="text-xs">
                      Earning
                    </Badge>
                    <span className="font-mono text-sm font-medium text-green-400">
                      +{formatCurrency(tx.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
