import { createHmac, createHash, randomBytes } from "crypto";

// SEC-006: HMAC-SHA256 for API keys — DB compromise alone cannot reverse keys
// Previously: bare SHA-256 (no secret key = rainbow table attack possible)
// Fix: HMAC with secret key from environment

function getHmacSecret(): string {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("API_KEY_HMAC_SECRET is required in production");
  }
  return secret ?? "dev-fallback";
}

export function hashApiKey(rawKey: string): string {
  return createHmac("sha256", getHmacSecret())
    .update(rawKey)
    .digest("hex");
}

// Legacy hash for backward-compat migration period
export function legacyHashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): string {
  const prefix = process.env.NODE_ENV === "production" ? "bc_live_" : "bc_test_";
  return prefix + randomBytes(32).toString("hex");
}
