/**
 * Auth & API Key Tests
 *
 * Tests for:
 * - API key generation and HMAC verification
 * - Session validation
 * - Bot authentication
 * - Legacy hash backward-compat
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

// These are mocked via setup.ts
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// ─── 1. Crypto: API key generation ──────────────────────────────────────────

describe("generateApiKey", () => {
  it("generates a test-prefixed key in non-production env", async () => {
    process.env.NODE_ENV = "test";
    const { generateApiKey } = await import("@/lib/crypto");
    const key = generateApiKey();
    expect(key).toMatch(/^bc_test_[a-f0-9]{64}$/);
  });

  it("generates unique keys on each call", async () => {
    const { generateApiKey } = await import("@/lib/crypto");
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });
});

// ─── 2. Crypto: HMAC hashing ────────────────────────────────────────────────

describe("hashApiKey (HMAC-SHA256)", () => {
  it("produces consistent HMAC for same input", async () => {
    process.env.API_KEY_HMAC_SECRET = "test-hmac-secret-32chars-padded!!";
    const { hashApiKey } = await import("@/lib/crypto");
    const result1 = hashApiKey("bc_test_somekey");
    const result2 = hashApiKey("bc_test_somekey");
    expect(result1).toBe(result2);
  });

  it("produces different hashes for different keys", async () => {
    const { hashApiKey } = await import("@/lib/crypto");
    const h1 = hashApiKey("key_one");
    const h2 = hashApiKey("key_two");
    expect(h1).not.toBe(h2);
  });

  it("HMAC output differs from bare SHA-256 (not reversible via rainbow table)", async () => {
    const { hashApiKey, legacyHashApiKey } = await import("@/lib/crypto");
    const raw = "bc_test_someapikey123";
    const hmac = hashApiKey(raw);
    const sha256 = legacyHashApiKey(raw);
    expect(hmac).not.toBe(sha256);
  });

  it("produces a 64-char hex string", async () => {
    const { hashApiKey } = await import("@/lib/crypto");
    const result = hashApiKey("test_key");
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── 3. Crypto: Legacy hash ──────────────────────────────────────────────────

describe("legacyHashApiKey (SHA-256 backward-compat)", () => {
  it("produces the same as direct SHA-256", async () => {
    const { legacyHashApiKey } = await import("@/lib/crypto");
    const raw = "legacy_key_123";
    const expected = createHash("sha256").update(raw).digest("hex");
    expect(legacyHashApiKey(raw)).toBe(expected);
  });
});

// ─── 4. Bot authentication ───────────────────────────────────────────────────

describe("authenticateBot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({ success: true, resetAt: null } as never);
  });

  function makeAuthRequest(apiKey?: string) {
    const headers: Record<string, string> = {};
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["x-forwarded-for"] = "127.0.0.1";
    return new NextRequest("http://localhost/api/test", { headers });
  }

  it("returns error when x-api-key header is missing", async () => {
    const { authenticateBot } = await import("@/lib/api-auth");
    const req = makeAuthRequest(); // no key
    const result = await authenticateBot(req);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/missing/i);
  });

  it("returns rate-limit error when rate limit exceeded", async () => {
    vi.mocked(rateLimit).mockResolvedValue({
      success: false,
      resetAt: new Date(),
    } as never);
    const { authenticateBot } = await import("@/lib/api-auth");
    const req = makeAuthRequest("bc_test_somekey");
    const result = await authenticateBot(req);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/rate limit/i);
  });

  it("returns error for invalid API key", async () => {
    vi.mocked(db.bot.findUnique).mockResolvedValue(null);
    const { authenticateBot } = await import("@/lib/api-auth");
    const req = makeAuthRequest("bc_test_badkey");
    const result = await authenticateBot(req);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Invalid API key");
  });

  it("returns error for deactivated bot", async () => {
    vi.mocked(db.bot.findUnique).mockResolvedValue({
      id: "bot_1",
      operatorId: "op_1",
      isActive: false,
    } as never);
    const { authenticateBot } = await import("@/lib/api-auth");
    const req = makeAuthRequest("bc_test_deactivated");
    const result = await authenticateBot(req);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Bot is deactivated");
  });

  it("returns success with botId and operatorId for valid active bot", async () => {
    vi.mocked(db.bot.findUnique).mockResolvedValue({
      id: "bot_active",
      operatorId: "op_owner",
      isActive: true,
    } as never);
    const { authenticateBot } = await import("@/lib/api-auth");
    const req = makeAuthRequest("bc_test_validkey");
    const result = await authenticateBot(req);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.botId).toBe("bot_active");
      expect(result.operatorId).toBe("op_owner");
    }
  });

  it("falls back to legacy SHA-256 hash when HMAC lookup fails", async () => {
    // First call (HMAC) returns null, second call (legacy) returns the bot
    vi.mocked(db.bot.findUnique)
      .mockResolvedValueOnce(null) // HMAC lookup fails
      .mockResolvedValueOnce({    // legacy SHA-256 lookup succeeds
        id: "bot_legacy",
        operatorId: "op_owner",
        isActive: true,
      } as never);

    const { authenticateBot } = await import("@/lib/api-auth");
    const req = makeAuthRequest("bc_test_legacykey");
    const result = await authenticateBot(req);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.botId).toBe("bot_legacy");
    }
  });
});

// ─── 5. Session validation ───────────────────────────────────────────────────

describe("Session validation in route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests with expired/null session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/jobs/route");
    const req = new NextRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: JSON.stringify({ title: "test" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("passes requests with valid session (auth does not block)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "op_123", name: "Test", email: "test@test.com" },
    } as never);
    // db.$transaction throws "insufficient credits" — means auth passed
    vi.mocked(db.$transaction).mockRejectedValue(
      Object.assign(new Error("Insufficient credits"), { code: "INSUFFICIENT_CREDITS" })
    );
    const { POST } = await import("@/app/api/v1/jobs/route");
    const req = new NextRequest("http://localhost/api/v1/jobs", {
      method: "POST",
      body: JSON.stringify({
        title: "Write a compelling product description for our SaaS",
        description:
          "We need a 500-word product description that highlights key features and benefits of our project management tool aimed at remote teams.",
        category: "writing",
        budget: 100,
        deadline: new Date(Date.now() + 86400_000).toISOString(),
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    // 402 means auth passed and we got to the credit check
    expect(res.status).toBe(402);
  });
});
