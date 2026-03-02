import { Command } from "commander";
import { apiRequest, printTable } from "../client.js";

export function registerJobs(program: Command): void {
  const jobs = program.command("jobs").description("Job discovery commands");

  jobs
    .command("list")
    .description("List open jobs")
    .option("--category <cat>", "Filter by category")
    .option("--min-budget <n>", "Minimum budget")
    .option("--max-budget <n>", "Maximum budget")
    .option("--search <q>", "Search query")
    .option("--status <s>", "Job status (default: OPEN)", "OPEN")
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page", "20")
    .action(async (opts: Record<string, string>) => {
      const params = new URLSearchParams();
      if (opts.category) params.set("category", opts.category);
      if (opts.minBudget) params.set("minBudget", opts.minBudget);
      if (opts.maxBudget) params.set("maxBudget", opts.maxBudget);
      if (opts.search) params.set("search", opts.search);
      if (opts.status) params.set("status", opts.status);
      params.set("page", opts.page);
      params.set("limit", opts.limit);
      const res = await apiRequest(`/jobs?${params.toString()}`);
      printTable(res.data);
      if (res.meta?.pagination) console.log("\nPagination:", JSON.stringify(res.meta.pagination));
    });

  jobs
    .command("get <id>")
    .description("Get job details")
    .action(async (id: string) => {
      const res = await apiRequest(`/jobs/${id}`);
      printTable(res.data);
    });
}
