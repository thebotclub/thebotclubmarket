import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Wallet, TrendingUp, TrendingDown, Plus } from "lucide-react";

async function getWalletData(userId: string) {
  const [operator, transactions, ledger] = await Promise.all([
    db.operator.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    }),
    db.creditTransaction.findMany({
      where: { operatorId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.ledger.findMany({
      where: { operatorId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    balance: operator?.creditBalance ?? 0,
    transactions,
    ledger,
  };
}

const creditTypeLabel: Record<string, string> = {
  PURCHASE: "Credit Purchase",
  SPEND: "Job Payment",
  REFUND: "Refund",
  BONUS: "Bonus Credits",
};

const ledgerTypeLabel: Record<string, string> = {
  CREDIT_PURCHASE: "Credit Purchase",
  JOB_PAYMENT: "Job Payment",
  BOT_EARNING: "Bot Earning",
  PLATFORM_FEE: "Platform Fee",
  REFUND: "Refund",
  PAYOUT: "Payout",
};

export default async function WalletPage() {
  const session = await auth();
  const data = await getWalletData(session!.user.id);

  const totalPurchased = data.transactions
    .filter((t) => t.type === "PURCHASE")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSpent = data.transactions
    .filter((t) => t.type === "SPEND")
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-mono text-2xl font-bold">Wallet</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your credits and view transaction history
        </p>
      </div>

      {/* Balance Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">
                Current Balance
              </span>
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div className="font-mono text-2xl font-bold text-primary">
              {formatCurrency(data.balance)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">
                Total Purchased
              </span>
              <TrendingUp className="h-4 w-4 text-green-400" />
            </div>
            <div className="font-mono text-xl font-bold">
              {formatCurrency(totalPurchased)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Total Spent</span>
              <TrendingDown className="h-4 w-4 text-red-400" />
            </div>
            <div className="font-mono text-xl font-bold">
              {formatCurrency(totalSpent)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Credits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add Credits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Purchase credits to pay for jobs. Credits are held in escrow until
            you approve a submission.
          </p>
          <div className="flex flex-wrap gap-3">
            {[10, 25, 50, 100, 250, 500].map((amount) => (
              <button
                key={amount}
                className="flex items-center gap-2 border border-border hover:border-primary/50 hover:bg-primary/5 px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {formatCurrency(amount)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Stripe integration required. Set{" "}
            <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> in
            your environment.
          </p>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {data.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-2">
              {data.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {creditTypeLabel[tx.type] ?? tx.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx.description} · {formatDate(tx.createdAt)}
                    </p>
                  </div>
                  <div
                    className={`font-mono font-medium text-sm ${
                      tx.type === "PURCHASE" || tx.type === "BONUS" || tx.type === "REFUND"
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {tx.type === "PURCHASE" || tx.type === "BONUS" || tx.type === "REFUND"
                      ? "+"
                      : "-"}
                    {formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ledger */}
      {data.ledger.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.ledger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {ledgerTypeLabel[entry.type] ?? entry.type}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {entry.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {entry.description} · {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <div className="font-mono font-medium text-sm">
                    {formatCurrency(entry.amount)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
