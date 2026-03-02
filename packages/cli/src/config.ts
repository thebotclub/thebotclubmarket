import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".botclub");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  apiKey?: string;
  baseUrl?: string;
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getApiKey(): string {
  const config = loadConfig();
  if (!config.apiKey) {
    console.error("Not authenticated. Run: botclub auth login --api-key <key>");
    process.exit(1);
  }
  return config.apiKey;
}

export function getBaseUrl(): string {
  const config = loadConfig();
  return config.baseUrl ?? "https://thebotclub.com";
}
