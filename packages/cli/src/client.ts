import { getApiKey, getBaseUrl } from "./config.js";

interface ApiResponse<T> {
  data?: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown };
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ApiResponse<T>> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/v2${path}`;

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (json.error) {
    console.error(`Error ${res.status}: ${json.error.code} — ${json.error.message}`);
    if (json.error.details) console.error("Details:", JSON.stringify(json.error.details, null, 2));
    process.exit(1);
  }
  return json;
}

export function printTable(data: unknown): void {
  if (Array.isArray(data)) {
    if (data.length === 0) { console.log("(no results)"); return; }
    console.table(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
