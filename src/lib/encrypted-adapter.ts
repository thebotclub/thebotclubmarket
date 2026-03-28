/**
 * SEC-007: Encrypted Prisma Adapter
 *
 * Wraps @auth/prisma-adapter to AES-256-GCM encrypt OAuth tokens
 * (refresh_token, access_token, id_token) before writing to DB,
 * and decrypt on read.
 *
 * Ciphertext format: `v{N}:{base64(iv || ciphertext || authTag)}`
 * - v{N} = key version (for rotation support)
 * - IV   = 12 bytes (GCM standard)
 * - authTag = 16 bytes (GCM standard)
 *
 * Env var: DB_TOKEN_ENCRYPTION_KEY
 *   - Hex-encoded 32-byte key (64 hex chars)
 *   - Can hold multiple key versions: DB_TOKEN_ENCRYPTION_KEY_V2, etc.
 *   - Generate: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { Adapter } from "next-auth/adapters";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CURRENT_KEY_VERSION = 1;

// ─── Key Management ──────────────────────────────────────────────────────────

type KeyMap = Map<number, Buffer>;

let _keyMap: KeyMap | null = null;

function loadKeys(): KeyMap {
  if (_keyMap) return _keyMap;

  const keys: KeyMap = new Map();

  // Primary key (v1) from DB_TOKEN_ENCRYPTION_KEY
  const primary = process.env.DB_TOKEN_ENCRYPTION_KEY;
  if (primary) {
    const buf = Buffer.from(primary, "hex");
    if (buf.length !== 32) {
      throw new Error(
        "DB_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars)"
      );
    }
    keys.set(1, buf);
  }

  // Additional versioned keys: DB_TOKEN_ENCRYPTION_KEY_V2, V3, …
  for (let v = 2; v <= 10; v++) {
    const val = process.env[`DB_TOKEN_ENCRYPTION_KEY_V${v}`];
    if (!val) break;
    const buf = Buffer.from(val, "hex");
    if (buf.length !== 32) {
      throw new Error(
        `DB_TOKEN_ENCRYPTION_KEY_V${v} must be exactly 32 bytes (64 hex chars)`
      );
    }
    keys.set(v, buf);
  }

  if (keys.size === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DB_TOKEN_ENCRYPTION_KEY is required in production. " +
          "Generate with: openssl rand -hex 32"
      );
    }
    // Dev/test fallback — deterministic, obviously insecure
    keys.set(1, Buffer.alloc(32, 0xde));
  }

  _keyMap = keys;
  return keys;
}

/** Exposed for testing: reset key cache (useful when env changes in tests) */
export function _resetKeyCache(): void {
  _keyMap = null;
}

function getEncryptionKey(version: number): Buffer {
  const keys = loadKeys();
  const key = keys.get(version);
  if (!key) throw new Error(`Encryption key version ${version} not found`);
  return key;
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string.
 * Returns `v{version}:{base64(iv || ciphertext || authTag)}`
 */
export function encryptToken(plaintext: string): string {
  const version = CURRENT_KEY_VERSION;
  const key = getEncryptionKey(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) || ciphertext (N) || authTag (16)
  const payload = Buffer.concat([iv, encrypted, authTag]);
  return `v${version}:${payload.toString("base64")}`;
}

/**
 * Decrypt a ciphertext string produced by encryptToken.
 * Handles all stored key versions for rotation.
 *
 * Returns null if the input is null/undefined (pass-through).
 * Throws if decryption fails (tampered / wrong key).
 */
export function decryptToken(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null) return null;

  // If it doesn't look like our format, assume plaintext (migration period)
  const match = ciphertext.match(/^v(\d+):(.+)$/);
  if (!match) {
    // Legacy plaintext — return as-is so existing rows still work
    // The back-fill migration script will re-encrypt these.
    return ciphertext;
  }

  const version = parseInt(match[1], 10);
  const key = getEncryptionKey(version);
  const payload = Buffer.from(match[2], "base64");

  if (payload.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Encrypted token payload too short");
  }

  const iv = payload.subarray(0, IV_BYTES);
  const authTag = payload.subarray(payload.length - TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES, payload.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return (
    decipher.update(encrypted).toString("utf8") + decipher.final("utf8")
  );
}

// ─── Token Field Helpers ──────────────────────────────────────────────────────

const TOKEN_FIELDS = ["refresh_token", "access_token", "id_token"] as const;
type TokenField = (typeof TOKEN_FIELDS)[number];

type MaybeHasTokens = Partial<Record<TokenField, string | null | undefined>> &
  Record<string, unknown>;

function encryptAccountTokens<T extends MaybeHasTokens>(account: T): T {
  const result = { ...account } as T;
  for (const field of TOKEN_FIELDS) {
    if (result[field] != null) {
      (result as MaybeHasTokens)[field] = encryptToken(result[field] as string);
    }
  }
  return result;
}

function decryptAccountTokens<T extends MaybeHasTokens | null>(account: T): T {
  if (!account) return account;
  const result = { ...account } as T & MaybeHasTokens;
  for (const field of TOKEN_FIELDS) {
    if (result[field] != null) {
      (result as MaybeHasTokens)[field] = decryptToken(result[field] as string);
    }
  }
  return result as T;
}

// ─── Encrypted Adapter ───────────────────────────────────────────────────────

/**
 * Drop-in replacement for PrismaAdapter that transparently encrypts
 * OAuth tokens at rest.
 *
 * Usage:
 *   import { EncryptedPrismaAdapter } from "@/lib/encrypted-adapter";
 *   adapter: EncryptedPrismaAdapter(db),
 */
export function EncryptedPrismaAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(prisma);

  return {
    ...base,

    // ── Write path: encrypt before saving ──────────────────────────────────

    linkAccount: base.linkAccount
      ? async (data) => {
          const encrypted = encryptAccountTokens(data);
          return base.linkAccount!(encrypted);
        }
      : undefined,

    // ── Read path: decrypt after fetching ──────────────────────────────────

    getUserByAccount: base.getUserByAccount
      ? async (provider_providerAccountId) => {
          return base.getUserByAccount!(provider_providerAccountId);
          // Note: getUserByAccount returns the User, not the Account —
          // tokens are not exposed here. No decryption needed.
        }
      : undefined,

    getAccount: base.getAccount
      ? async (providerAccountId, provider) => {
          const account = await base.getAccount!(providerAccountId, provider);
          return decryptAccountTokens(account);
        }
      : undefined,
  };
}
