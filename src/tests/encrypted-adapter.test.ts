/**
 * Tests for SEC-007: encrypted-adapter.ts
 *
 * Covers:
 * - AES-256-GCM encrypt/decrypt roundtrip
 * - Null / undefined passthrough
 * - Legacy plaintext passthrough (migration period)
 * - Key versioning prefix format
 * - Unique ciphertexts (random IV)
 * - Bad key length rejection
 * - Production guard (missing key)
 * - EncryptedPrismaAdapter wraps linkAccount and getAccount correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  encryptToken,
  decryptToken,
  EncryptedPrismaAdapter,
  _resetKeyCache,
} from "@/lib/encrypted-adapter";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setKey(hex: string) {
  process.env.DB_TOKEN_ENCRYPTION_KEY = hex;
  _resetKeyCache();
}

function clearKey() {
  delete process.env.DB_TOKEN_ENCRYPTION_KEY;
  _resetKeyCache();
}

const VALID_KEY_HEX = "a".repeat(64); // 32 bytes, all 0xaa

// ─── encryptToken / decryptToken ─────────────────────────────────────────────

describe("encryptToken / decryptToken", () => {
  beforeEach(() => setKey(VALID_KEY_HEX));
  afterEach(() => clearKey());

  it("roundtrips a plain string", () => {
    const plaintext = "ya29.A0ARrdaM-some-google-access-token";
    const ciphertext = encryptToken(plaintext);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it("roundtrips a long JWT-style id_token", () => {
    const jwt =
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ." +
      "eyJzdWIiOiIxMjM0NTY3ODkwIn0." +
      "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(decryptToken(encryptToken(jwt))).toBe(jwt);
  });

  it("produces ciphertext with version prefix v1:", () => {
    const ct = encryptToken("token");
    expect(ct).toMatch(/^v1:/);
  });

  it("produces unique ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptToken("same");
    const b = encryptToken("same");
    expect(a).not.toBe(b);
  });

  it("returns null for null input", () => {
    expect(decryptToken(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(decryptToken(undefined)).toBeNull();
  });

  it("passes through legacy plaintext (no version prefix)", () => {
    const legacy = "ya29.legacy-plaintext-token";
    expect(decryptToken(legacy)).toBe(legacy);
  });

  it("throws on tampered ciphertext (GCM auth tag failure)", () => {
    const ct = encryptToken("token-value");
    // Flip a byte in the base64 payload
    const [prefix, b64] = ct.split(":");
    const buf = Buffer.from(b64, "base64");
    buf[buf.length - 1] ^= 0xff; // corrupt last authTag byte
    const tampered = `${prefix}:${buf.toString("base64")}`;
    expect(() => decryptToken(tampered)).toThrow();
  });
});

// ─── Key validation ───────────────────────────────────────────────────────────

describe("key validation", () => {
  afterEach(() => clearKey());

  it("throws if key is not 32 bytes (too short)", () => {
    process.env.DB_TOKEN_ENCRYPTION_KEY = "aabbcc"; // only 3 bytes
    _resetKeyCache();
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });

  it("uses dev fallback when key not set (non-production)", () => {
    // NODE_ENV is "test" in setup.ts, so this should not throw
    clearKey();
    expect(() => encryptToken("x")).not.toThrow();
    expect(decryptToken(encryptToken("hello"))).toBe("hello");
  });

  it("throws in production when key not set", () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    clearKey();
    try {
      expect(() => encryptToken("x")).toThrow(/required in production/);
    } finally {
      process.env.NODE_ENV = orig;
      _resetKeyCache();
    }
  });
});

// ─── Key rotation ────────────────────────────────────────────────────────────

describe("key rotation", () => {
  afterEach(() => {
    delete process.env.DB_TOKEN_ENCRYPTION_KEY;
    delete process.env.DB_TOKEN_ENCRYPTION_KEY_V2;
    _resetKeyCache();
  });

  it("decrypts v1 ciphertext after adding a v2 key", () => {
    process.env.DB_TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
    _resetKeyCache();
    const ct = encryptToken("rotate-me");

    // Now add v2 key — v1 should still decrypt
    process.env.DB_TOKEN_ENCRYPTION_KEY_V2 = "b".repeat(64);
    _resetKeyCache();
    expect(decryptToken(ct)).toBe("rotate-me");
  });
});

// ─── EncryptedPrismaAdapter ───────────────────────────────────────────────────

describe("EncryptedPrismaAdapter", () => {
  beforeEach(() => setKey(VALID_KEY_HEX));
  afterEach(() => clearKey());

  function makeMockPrisma() {
    let storedAccount: Record<string, unknown> | null = null;

    const account = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        storedAccount = { ...data };
        return storedAccount;
      }),
      findFirst: vi.fn(async () => storedAccount),
    };

    return {
      prisma: { account } as unknown as import("@prisma/client").PrismaClient,
      getStored: () => storedAccount,
    };
  }

  it("encrypts tokens when linkAccount is called", async () => {
    const { prisma, getStored } = makeMockPrisma();
    const adapter = EncryptedPrismaAdapter(prisma);

    const accountData = {
      userId: "user_1",
      type: "oauth",
      provider: "google",
      providerAccountId: "123",
      access_token: "plain-access-token",
      refresh_token: "plain-refresh-token",
      id_token: "plain-id-token",
    };

    await adapter.linkAccount!(accountData as Parameters<typeof adapter.linkAccount>[0]);

    const stored = getStored()!;
    expect(stored.access_token).not.toBe("plain-access-token");
    expect(stored.refresh_token).not.toBe("plain-refresh-token");
    expect(stored.id_token).not.toBe("plain-id-token");
    expect(stored.access_token).toMatch(/^v1:/);
    expect(stored.refresh_token).toMatch(/^v1:/);
    expect(stored.id_token).toMatch(/^v1:/);
  });

  it("decrypts tokens when getAccount is called", async () => {
    const { prisma, getStored } = makeMockPrisma();
    const adapter = EncryptedPrismaAdapter(prisma);

    const accountData = {
      userId: "user_1",
      type: "oauth",
      provider: "google",
      providerAccountId: "123",
      access_token: "plain-access-token",
      refresh_token: "plain-refresh-token",
      id_token: "plain-id-token",
    };

    await adapter.linkAccount!(accountData as Parameters<typeof adapter.linkAccount>[0]);

    // getAccount reads the stored (encrypted) row and should decrypt it
    const retrieved = await adapter.getAccount!("123", "google");
    expect(retrieved!.access_token).toBe("plain-access-token");
    expect(retrieved!.refresh_token).toBe("plain-refresh-token");
    expect(retrieved!.id_token).toBe("plain-id-token");
  });

  it("handles null token fields gracefully", async () => {
    const { prisma } = makeMockPrisma();
    const adapter = EncryptedPrismaAdapter(prisma);

    const accountData = {
      userId: "user_1",
      type: "oauth",
      provider: "github",
      providerAccountId: "456",
      // no tokens
    };

    await expect(
      adapter.linkAccount!(accountData as Parameters<typeof adapter.linkAccount>[0])
    ).resolves.not.toThrow();
  });

  it("decrypts legacy plaintext tokens transparently (migration period)", async () => {
    // Simulate a row written before encryption was enabled
    const legacyAccount = {
      userId: "user_old",
      type: "oauth",
      provider: "google",
      providerAccountId: "789",
      access_token: "legacy-plain-token",
      refresh_token: null,
      id_token: "legacy-id",
    };

    const prisma = {
      account: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(legacyAccount),
      },
    } as unknown as import("@prisma/client").PrismaClient;

    const adapter = EncryptedPrismaAdapter(prisma);
    const result = await adapter.getAccount!("789", "google");
    expect(result!.access_token).toBe("legacy-plain-token");
    expect(result!.id_token).toBe("legacy-id");
    expect(result!.refresh_token).toBeNull();
  });
});
