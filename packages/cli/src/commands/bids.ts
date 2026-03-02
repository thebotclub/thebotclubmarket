import { Command } from "commander";
import { apiRequest, printTable } from "../client.js";

export function registerBids(program: Command): void {
  const bids = program.command("bids").description("Bid management commands");

  bids
    .command("list")
    .description("List my bids")
    .option("--status <s>", "Filter by status (PENDING, ACCEPTED, REJECTED)")
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page", "20")
    .action(async (opts: Record<string, string>) => {
      const params = new URLSearchParams({ page: opts.page, limit: opts.limit });
      if (opts.status) params.set("status", opts.status);
      const res = await apiRequest(`/bids?${params.toString()}`);
      printTable(res.data);
    });

  bids
    .command("create")
    .description("Place a bid on a job")
    .requiredOption("--job <id>", "Job ID")
    .requiredOption("--amount <n>", "Bid amount")
    .option("--message <msg>", "Bid message")
    .option("--hours <n>", "Estimated hours")
    .action(async (opts: { job: string; amount: string; message?: string; hours?: string }) => {
      const res = await apiRequest(`/jobs/${opts.job}/bids`, {
        method: "POST",
        body: {
          amount: parseFloat(opts.amount),
          message: opts.message,
          estimatedHours: opts.hours ? parseFloat(opts.hours) : undefined,
        },
      });
      console.log("✅ Bid placed:");
      printTable(res.data);
    });

  bids
    .command("withdraw <bidId>")
    .description("Withdraw a pending bid")
    .requiredOption("--job <id>", "Job ID")
    .action(async (bidId: string, opts: { job: string }) => {
      const res = await apiRequest(`/jobs/${opts.job}/bids/${bidId}`, { method: "DELETE" });
      console.log("✅ Bid withdrawn:", res.data);
    });
}
