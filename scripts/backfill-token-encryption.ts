#!/usr/bin/env tsx
/**
 * SEC-007: Back-fill encryption for existing plaintext OAuth tokens
 *
 * Usage:
 *   DB_TOKEN_ENCRYPTION_KEY=<hex> tsx scripts/backfill-token-encryption.ts
 *   DB_TOKEN_ENCRYPTION_KEY=<hex> tsx scripts/backfill-token-encryption.ts --dry-run
 *
 * What it does:
 *   1. Iterates all Account rows in pages of 100
 *   2. For each row where access_token / refresh_token / id_token does NOT
 *      start with "v{N}:" (i.e. still plaintext), encrypts the value
 *   3. Updates the row in place (atomic per-row UPDATE)
 *   4. Reports counts: skipped (already encrypted), updated, failed
 *
 * Safety:
 *   - --dry-run flag prints what WOULD change without writing anything
 *   - Idempotent: already-encrypted tokens are skipped (version prefix check)
 *   - Wrap in a DB transaction per batch if you want rollback on partial failure
 *
 * Run once after deploying SEC-007. Safe to re-run (idempotent).
 */

import { PrismaClient } from "@prisma/client";
import { encryptToken, _resetKeyCache } from "../src/lib/encrypted-adapter";

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE_SIZE = 100;

const VERSION_PATTERN = /^v\d+:/;

const db = new PrismaClient();

type TokenFields = "access_token" | "refresh_token" | "id_token";
const FIELDS: TokenFields[] = ["access_token", "refresh_token", "id_token"];

async function main() {
  console.log(`SEC-007 token back-fill — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // Force key reload from env
  _resetKeyCache();

  let cursor: string | undefined;
  let totalSkipped = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let page = 0;

  while (true) {
    page++;
    const accounts = await db.account.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        access_token: true,
        refresh_token: true,
        id_token: true,
      },
      orderBy: { id: "asc" },
    });

    if (accounts.length === 0) break;
    cursor = accounts[accounts.length - 1].id;

    for (const account of accounts) {
      const updates: Partial<Record<TokenFields, string>> = {};

      for (const field of FIELDS) {
        const value = account[field];
        if (!value) continue; // null/empty — skip
        if (VERSION_PATTERN.test(value)) continue; // already encrypted — skip
        // Plaintext detected — encrypt
        updates[field] = encryptToken(value);
      }

      if (Object.keys(updates).length === 0) {
        totalSkipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `[dry-run] Would encrypt ${Object.keys(updates).join(", ")} for account ${account.id} (${account.provider}/${account.providerAccountId})`
        );
        totalUpdated++;
        continue;
      }

      try {
        await db.account.update({
          where: { id: account.id },
          data: updates,
        });
        totalUpdated++;
        console.log(
          `  ✓ Encrypted ${Object.keys(updates).join(", ")} for account ${account.id}`
        );
      } catch (err) {
        totalFailed++;
        console.error(`  ✗ Failed account ${account.id}:`, err);
      }
    }

    console.log(`Page ${page}: processed ${accounts.length} rows`);
  }

  console.log("\n─── Back-fill complete ───");
  console.log(`  Skipped (already encrypted): ${totalSkipped}`);
  console.log(`  Updated:                     ${totalUpdated}`);
  console.log(`  Failed:                      ${totalFailed}`);

  if (totalFailed > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
