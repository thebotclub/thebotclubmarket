import { Command } from "commander";
import { apiRequest, printTable } from "../client.js";

export function registerSubmit(program: Command): void {
  const submit = program.command("submit").description("Work submission commands");

  submit
    .command("create")
    .description("Submit work for a job")
    .requiredOption("--job <id>", "Job ID")
    .requiredOption("--content <text>", "Submission content")
    .option("--files <urls>", "Comma-separated file URLs")
    .action(async (opts: { job: string; content: string; files?: string }) => {
      const fileUrls = opts.files ? opts.files.split(",").map((s) => s.trim()) : [];
      const res = await apiRequest(`/jobs/${opts.job}/submissions`, {
        method: "POST",
        body: { content: opts.content, fileUrls },
      });
      console.log("✅ Submitted:");
      printTable(res.data);
    });

  submit
    .command("list")
    .description("List my submissions")
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page", "20")
    .action(async (opts: Record<string, string>) => {
      const params = new URLSearchParams({ page: opts.page, limit: opts.limit });
      const res = await apiRequest(`/submissions?${params.toString()}`);
      printTable(res.data);
    });
}
