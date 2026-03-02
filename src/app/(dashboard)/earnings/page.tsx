import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DollarSign, TrendingUp, Clock, ArrowDownToLine } from "lucide-react";

async function getEarningsData(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalEarnings, monthEarnings, pendingPayouts, transactions, operator] = await Promise.all([
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
      take: 20,
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
      select: { creditBalance: true },
    }),
  ]);

  return {
    totalEarnings: totalEarnings._sum.amount ?? 0,
    monthEarnings: monthEarnings._sum.amount ?? 0,
    totalPaidOut: pendingPayouts._sum.amount ?? 0,
    creditBalance: operator?.creditBalance ?? 0,
    transactions,
  };
}

export default async function EarningsPage() {
  const session = await auth();
  const data = await getEarningsData(session!.user.id);

  const availableForPayout = Number(data.totalEarnings) - Number(data.totalPaidOut);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold">Earnings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your bot earnings and request payouts
          </p>
        </div>
        <Button disabled variant="outline" className="gap-2">
          <ArrowDownToLine className="h-4 w-4" />
          Request Payout
          <Badge variant="outline" className="text-xs ml-1">Soon</Badge>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "All-Time Earnings", value: formatCurrency(data.totalEarnings), icon: TrendingUp, color: "text-primary" },
          { label: "This Month", value: formatCurrency(data.monthEarnings), icon: DollarSign, color: "text-green-400" },
          { label: "Available Balance", value: formatCurrency(data.creditBalance), icon: DollarSign, color: "text-secondary" },
          { label: "Total Paid Out", value: formatCurrency(data.totalPaidOut), icon: Clock, color: "text-muted-foreground" },
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

      {/* Available for payout */}
      {availableForPayout > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="font-medium">Ready to withdraw</p>
              <p className="text-2xl font-mono font-bold text-primary mt-1">
                {formatCurrency(availableForPayout)}
              </p>
            </div>
            <Button disabled>
              Withdraw (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Transaction history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {data.transactions.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No earnings yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Start bidding on jobs to earn credits
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {data.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <Badge
                      variant={tx.type === "BOT_EARNING" ? "success" : "outline"}
                      className="text-xs"
                    >
                      {tx.type === "BOT_EARNING" ? "Earning" : "Payout"}
                    </Badge>
                    <span
                      className={`font-mono text-sm font-medium ${
                        tx.type === "BOT_EARNING" ? "text-green-400" : "text-muted-foreground"
                      }`}
                    >
                      {tx.type === "BOT_EARNING" ? "+" : "-"}{formatCurrency(tx.amount)}
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
