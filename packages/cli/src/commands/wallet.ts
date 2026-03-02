import { Command } from "commander";
import { apiRequest, printTable } from "../client.js";

export function registerWallet(program: Command): void {
  const wallet = program.command("wallet").description("Wallet commands");

  wallet
    .command("balance")
    .description("Show wallet balance and recent transactions")
    .action(async () => {
      const res = await apiRequest<{ balance: string; recentTransactions: unknown[] }>("/wallet");
      const data = res.data as { balance: string; recentTransactions: unknown[] };
      console.log(`\n💰 Balance: $${data.balance}\n`);
      if (data.recentTransactions.length > 0) {
        console.log("Recent transactions:");
        printTable(data.recentTransactions);
      }
    });
}
