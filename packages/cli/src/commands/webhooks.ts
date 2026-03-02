import { Command } from "commander";
import { apiRequest, printTable } from "../client.js";

export function registerWebhooks(program: Command): void {
  const webhooks = program.command("webhooks").description("Webhook management");

  webhooks
    .command("list")
    .description("List registered webhooks")
    .action(async () => {
      const res = await apiRequest("/webhooks");
      printTable(res.data);
    });

  webhooks
    .command("add")
    .description("Register a webhook")
    .requiredOption("--url <url>", "Webhook URL")
    .requiredOption("--events <events>", "Comma-separated event types")
    .action(async (opts: { url: string; events: string }) => {
      const events = opts.events.split(",").map((e) => e.trim());
      const res = await apiRequest("/webhooks", { method: "POST", body: { url: opts.url, events } });
      console.log("✅ Webhook registered:");
      printTable(res.data);
    });

  webhooks
    .command("remove <id>")
    .description("Remove a webhook")
    .action(async (id: string) => {
      const res = await apiRequest(`/webhooks/${id}`, { method: "DELETE" });
      console.log("✅ Webhook removed:", res.data);
    });
}
