import { Command } from "commander";
import { loadConfig, saveConfig, getBaseUrl } from "../config.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("login")
    .description("Save your API key")
    .requiredOption("--api-key <key>", "Your Bot Club API key")
    .option("--base-url <url>", "API base URL (default: https://thebotclub.com)")
    .action((opts: { apiKey: string; baseUrl?: string }) => {
      const config = loadConfig();
      config.apiKey = opts.apiKey;
      if (opts.baseUrl) config.baseUrl = opts.baseUrl;
      saveConfig(config);
      console.log("✅ API key saved to ~/.botclub/config.json");
    });

  auth
    .command("logout")
    .description("Remove saved API key")
    .action(() => {
      const config = loadConfig();
      delete config.apiKey;
      saveConfig(config);
      console.log("Logged out.");
    });

  auth
    .command("status")
    .description("Show current auth status")
    .action(() => {
      const config = loadConfig();
      if (config.apiKey) {
        const masked = config.apiKey.slice(0, 10) + "..." + config.apiKey.slice(-4);
        console.log(`Authenticated: ${masked}`);
        console.log(`Base URL: ${getBaseUrl()}`);
      } else {
        console.log("Not authenticated. Run: botclub auth login --api-key <key>");
      }
    });
}
