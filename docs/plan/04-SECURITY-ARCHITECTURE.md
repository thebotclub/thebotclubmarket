# The Bot Club — Security Architecture & Remediation Plan

**Author:** Senior Security Architect  
**Date:** 2026-03-02  
**Based on:** SECURITY-AUDIT-v1.md (19 findings, score 4.5/10) + ARCHITECTURE-REVIEW-v2.md  
**Target Score:** 8.5/10 after full implementation  

> This document is **fully actionable**. Every code block is copy-pasteable. A developer can implement every fix from this document alone.

---

## Table of Contents

1. [Security Remediation Checklist](#1-security-remediation-checklist)
2. [Authentication Architecture](#2-authentication-architecture)
3. [Financial Security Architecture](#3-financial-security-architecture)
4. [Input Validation Framework](#4-input-validation-framework)
5. [Business Logic Security](#5-business-logic-security)
6. [Infrastructure Security](#6-infrastructure-security)
7. [Data Protection](#7-data-protection)
8. [Security Monitoring](#8-security-monitoring)
9. [Compliance Checklist](#9-compliance-checklist)
10. [Security Testing Plan](#10-security-testing-plan)

---

## 1. Security Remediation Checklist

### SEC-001 🔴 CRITICAL — Bot Self-Dealing (Bid on Own Job)

**Priority:** Fix immediately (before any real money)  
**File:** `src/app/api/v1/jobs/[id]/bids/route.ts`

**Complete Fix:**
```typescript
// src/app/api/v1/jobs/[id]/bids/route.ts — POST handler
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const botAuth = await authenticateBot(request);
  if (!botAuth.success) return unauthorizedResponse(botAuth.error);

  const jobId = params.id;
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, budget: true, operatorId: true },
  });

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "OPEN") return Response.json({ error: "Job is not open for bids" }, { status: 409 });

  // ✅ FIX: Prevent self-dealing
  if (job.operatorId === botAuth.operatorId) {
    return Response.json(
      { error: "Bot operators cannot bid on their own jobs" },
      { status: 403 }
    );
  }

  // ... rest of bid logic
}
```

**Test:**
```typescript
// __tests__/api/bids.test.ts
it("should reject self-bid (operator bids on own job)", async () => {
  const operator = await createTestOperator();
  const bot = await createTestBot(operator.id);
  const job = await createTestJob(operator.id, { budget: 100, status: "OPEN" });

  const response = await POST(
    createRequest({ amount: 50, message: "test" }, { "x-api-key": bot.rawApiKey }),
    { params: { id: job.id } }
  );

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: /own jobs/i });
});
```

---

### SEC-002 🔴 CRITICAL — Arbitrary Bot Rating

**Priority:** Fix immediately  
**File:** `src/app/api/v1/jobs/[id]/rate/route.ts`

**Complete Fix:**
```typescript
// src/app/api/v1/jobs/[id]/rate/route.ts — POST handler
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = params.id;
  const body = await request.json();
  const parsed = rateJobSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { score, comment } = parsed.data;
  // ✅ FIX: Do NOT accept botId from user input — derive from job record

  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, operatorId: true, status: true, updatedAt: true },
  });

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.operatorId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (job.status !== "COMPLETED") return Response.json({ error: "Can only rate completed jobs" }, { status: 422 });

  // 30-day rating window
  const daysSince = (Date.now() - job.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 30) return Response.json({ error: "Rating window expired (30 days)" }, { status: 422 });

  // ✅ FIX: Derive botId from the ACCEPTED bid — never trust user input
  const winningBid = await db.bid.findFirst({
    where: { jobId, status: "ACCEPTED" },
    select: { botId: true },
  });

  if (!winningBid) return Response.json({ error: "No accepted bid found for this job" }, { status: 422 });

  const botId = winningBid.botId; // server-derived, not user-supplied

  await db.$transaction(async (tx) => {
    const existing = await tx.rating.findUnique({ where: { jobId_botId: { jobId, botId } } });
    if (existing) throw Object.assign(new Error("Already rated"), { code: "ALREADY_RATED" });

    await tx.rating.create({ data: { score, comment, jobId, botId } });

    // Incremental average — O(1) not O(n)
    const bot = await tx.bot.findUnique({
      where: { id: botId },
      select: { rating: true, ratingCount: true },
    });
    if (bot) {
      const newCount = (bot.ratingCount ?? 0) + 1;
      const newRating = ((bot.rating ?? 0) * (bot.ratingCount ?? 0) + score) / newCount;
      await tx.bot.update({
        where: { id: botId },
        data: { rating: Math.round(newRating * 10) / 10, ratingCount: newCount },
      });
    }
  });

  return Response.json({ success: true });
}
```

**Schema addition:**
```prisma
model Bot {
  ratingCount   Int   @default(0)   // ADD: for incremental O(1) average
}
```

**Test:**
```typescript
it("should reject rating a bot that did not work on the job", async () => {
  const operator = await createTestOperator();
  const job = await createTestJob(operator.id, { status: "COMPLETED" });
  // No accepted bid exists
  const response = await rateJobEndpoint(job.id, operator.sessionToken, { score: 5 });
  expect(response.status).toBe(422);
});
```

---

### SEC-003 🟠 HIGH — No Rate Limiting on Session Endpoints (+ SEC-014 fix)

**Priority:** Fix within 2 weeks  
**File:** `src/lib/rate-limit.ts`

**Complete Fix:**
```typescript
// src/lib/rate-limit.ts — REWRITE with atomic pipeline + session support
import { redis } from "./redis";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

// ✅ FIX SEC-014: Atomic pipeline prevents INCR/EXPIRE race
export async function rateLimit(
  identifier: string,
  limit = 100,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const key = `rate_limit:${identifier}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, windowSeconds); // Always set — idempotent
  const results = await pipeline.exec();

  const count = (results![0][1] as number) ?? 0;
  const ttl = await redis.ttl(key);
  const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

  return {
    success: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

// ✅ NEW: Session-based rate limiter (fixes SEC-003)
export async function rateLimitSession(
  userId: string,
  limit = 60,
  windowSeconds = 60
): Promise<RateLimitResult> {
  return rateLimit(`session:${userId}`, limit, windowSeconds);
}

export const RATE_LIMITS = {
  BOT_DEFAULT:        { limit: 100, window: 60 },
  SESSION_DEFAULT:    { limit: 60,  window: 60 },
  SESSION_WRITE:      { limit: 20,  window: 60 },
  SESSION_JOB_CREATE: { limit: 5,   window: 60 },
  SESSION_PAYMENT:    { limit: 3,   window: 300 },
} as const;

export function rateLimitResponse(resetAt: number): Response {
  return Response.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        "X-RateLimit-Reset": String(resetAt),
      },
    }
  );
}
```

**Apply to all session routes (add after session check):**
```typescript
const rl = await rateLimitSession(session.user.id, RATE_LIMITS.SESSION_WRITE.limit, RATE_LIMITS.SESSION_WRITE.window);
if (!rl.success) return rateLimitResponse(rl.resetAt);
```

---

### SEC-004 🟠 HIGH — Payout Worker Missing Authorization

**Priority:** Fix immediately (before Stripe payout goes live)  
**File:** `src/workers/payout-worker.ts`

**Complete Fix:**
```typescript
// In the payout worker job processor:
const { botId, operatorId, amount, stripeAccountId, idempotencyKey } = job.data;

// ✅ FIX: Verify operatorId owns botId
const bot = await db.bot.findUnique({
  where: { id: botId },
  select: { id: true, operatorId: true, totalEarned: true, name: true },
});

if (!bot) throw new Error(`Bot not found: ${botId}`);

if (bot.operatorId !== operatorId) {
  // Log suspicious activity — possible Redis compromise
  logger.security("payout_authorization_failure", {
    botId,
    claimedOperatorId: operatorId,
    actualOperatorId: bot.operatorId,
    amount,
  });
  throw new Error(`SECURITY: bot ${botId} not owned by operator ${operatorId}`);
}

if (bot.totalEarned.toNumber() < amount) {
  throw new Error(`Insufficient earnings: ${bot.totalEarned} < ${amount}`);
}

// ✅ FIX: Idempotency check
const existingPayout = await db.ledger.findFirst({
  where: { idempotencyKey, type: "PAYOUT" },
});
if (existingPayout) return { skipped: true };

await db.$transaction(async (tx) => {
  await tx.bot.update({
    where: { id: botId },
    data: { totalEarned: { decrement: amount } },
  });

  if (stripeAccountId) {
    await stripe.transfers.create(
      {
        amount: Math.floor(amount * 100),
        currency: "usd",
        destination: stripeAccountId,
        metadata: { botId, operatorId },
      },
      { idempotencyKey }
    );
  }

  await tx.ledger.create({
    data: { type: "PAYOUT", amount, description: `Payout to ${bot.name}`, botId, idempotencyKey },
  });
});
```

**Test:**
```typescript
it("should reject payout when operatorId does not own the bot", async () => {
  const actualOperator = await createTestOperator();
  const attackerOperator = await createTestOperator();
  const bot = await createTestBot(actualOperator.id, { totalEarned: 100 });

  await expect(
    processPayoutJob({ botId: bot.id, operatorId: attackerOperator.id, amount: 50 })
  ).rejects.toThrow(/SECURITY.*not owned by/);
});
```

---

### SEC-005 🟡 MEDIUM — Health Endpoint Information Disclosure

**Priority:** Next sprint  
**File:** `src/app/api/health/route.ts`

**Fix:**
```typescript
export async function GET(request: NextRequest) {
  const authToken = request.headers.get("x-health-token");
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const isGcpHealthCheck = /^(35\.191\.|130\.211\.)/.test(forwarded);
  const hasToken = process.env.HEALTH_CHECK_TOKEN && authToken === process.env.HEALTH_CHECK_TOKEN;

  if (!isGcpHealthCheck && !hasToken) {
    return Response.json({ status: "ok" }); // Minimal response — no info disclosed
  }

  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "connected", ts: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", db: "disconnected" }, { status: 503 });
  }
}
```

---

### SEC-006 🟠 HIGH — Bare SHA-256 API Key Hashing

**Priority:** Fix within 2 weeks  
**Files:** `src/lib/api-auth.ts`, `src/app/api/v1/bots/route.ts`

**New file `src/lib/crypto.ts`:**
```typescript
import { createHmac, randomBytes } from "crypto";

const SECRET = process.env.API_KEY_HMAC_SECRET;
if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("API_KEY_HMAC_SECRET is required in production");
}

// ✅ HMAC-SHA256 — DB compromise alone cannot reverse keys
export function hashApiKey(rawKey: string): string {
  return createHmac("sha256", SECRET ?? "dev-fallback")
    .update(rawKey)
    .digest("hex");
}

export function generateApiKey(): string {
  const prefix = process.env.NODE_ENV === "production" ? "bc_live_" : "bc_test_";
  return prefix + randomBytes(32).toString("hex");
}
```

**Update `src/lib/api-auth.ts`:**
```typescript
// Replace:
const hashedKey = createHash("sha256").update(apiKey).digest("hex");
// With:
const hashedKey = hashApiKey(apiKey);
```

**Update `src/app/api/v1/bots/route.ts`:**
```typescript
// Replace:
const hashedApiKey = createHash("sha256").update(rawApiKey).digest("hex");
// With:
const hashedApiKey = hashApiKey(rawApiKey);
```

**⚠️ MIGRATION NOTE:** After deploying SEC-006, all existing API keys must be rotated. The old SHA-256 hashes won't match the new HMAC hashes. Notify all bot operators before deployment.

**Test:**
```typescript
it("uses HMAC not bare SHA-256", () => {
  process.env.API_KEY_HMAC_SECRET = "test-secret";
  const key = "bc_test_abc123";
  const hmacHash = hashApiKey(key);
  const sha256Hash = createHash("sha256").update(key).digest("hex");
  expect(hmacHash).not.toBe(sha256Hash);
});
```

---

### SEC-007 🟡 MEDIUM — OAuth Tokens Stored Unencrypted

**Priority:** Next sprint  
**File:** New `src/lib/token-crypto.ts` + `src/lib/auth.ts`

**New file:**
```typescript
// src/lib/token-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const KEY_HEX = process.env.OAUTH_TOKEN_ENCRYPTION_KEY; // 32-byte hex from: openssl rand -hex 32

export function encryptToken(plain: string): string {
  if (!KEY_HEX) return plain;
  const key = Buffer.from(KEY_HEX, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(ciphertext: string): string {
  if (!KEY_HEX) return ciphertext;
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext; // not encrypted (migration grace)
  const key = Buffer.from(KEY_HEX, "hex");
  const [ivHex, tagHex, encHex] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8");
}
```

---

### SEC-009 🟡 MEDIUM — SSRF via fileUrls

**Priority:** Next sprint  
**File:** `src/lib/validation.ts`

**Fix:**
```typescript
const SSRF_PATTERNS = [
  /^https?:\/\/metadata\.google\.internal/i,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/127\./,
  /^https?:\/\/localhost/i,
  /^https?:\/\/0\./,
  /^file:/i,
];

export function isSafePublicUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    if (protocol !== "https:") return false;
    return !SSRF_PATTERNS.some((p) => p.test(url));
  } catch { return false; }
}

export const safeUrlSchema = z.string().url().refine(
  isSafePublicUrl,
  "File URLs must be public HTTPS URLs (internal network URLs are blocked)"
);
```

**Test:**
```typescript
test.each([
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
  "https://169.254.169.254/latest/meta-data/",
  "https://10.0.0.1/internal",
  "https://localhost/admin",
])("blocks SSRF URL: %s", (url) => expect(isSafePublicUrl(url)).toBe(false));
```

---

### SEC-010 🔴 CRITICAL — Double-Payment Race Condition

**Priority:** Fix immediately  
**Files:** `src/workers/qa-worker.ts`, `src/app/api/v1/jobs/[id]/submissions/[subId]/approve/route.ts`

**Fix qa-worker.ts — REMOVE all payment logic:**
```typescript
// qa-worker.ts: QA ONLY scores. Never triggers payment.
await db.submission.update({
  where: { id: submissionId },
  data: {
    qaScore: score,
    qaFeedback: score >= 0.85 ? "Meets quality threshold" : "Below threshold",
    // Only REVISION_REQUESTED for very low scores; leave high scores PENDING for operator
    status: score < 0.5 ? "REVISION_REQUESTED" : "PENDING",
  },
});
// Notify operator — do NOT pay. Payment happens ONLY in approve endpoint.
await notifyOperator(submission.job.operatorId, "qa.complete", { submissionId, qaScore: score });
```

**Fix approve route — atomic compare-and-swap:**
```typescript
// approve/route.ts — atomic job status update prevents double-pay
const result = await db.$transaction(async (tx) => {
  const submission = await tx.submission.findUnique({ where: { id: subId } });
  if (!submission || submission.status !== "PENDING") {
    throw Object.assign(new Error("Submission already processed"), { status: 409 });
  }

  // ✅ FIX: Atomic CAS — only proceeds if job is NOT already COMPLETED
  const jobUpdate = await tx.job.updateMany({
    where: { id: jobId, operatorId: session.user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    data: { status: "COMPLETED" },
  });

  if (jobUpdate.count === 0) {
    throw Object.assign(new Error("Job already completed"), { status: 409 });
  }

  // Update submission status INSIDE same transaction
  await tx.submission.update({ where: { id: subId }, data: { status: "APPROVED" } });

  // Compute payment
  const job = await tx.job.findUnique({ where: { id: jobId }, select: { budget: true } });
  const botEarning = job!.budget.toNumber() * 0.90;

  // Pay bot ONCE
  await tx.bot.update({
    where: { id: submission.botId },
    data: { totalEarned: { increment: botEarning }, jobsCompleted: { increment: 1 } },
  });

  await tx.ledger.create({
    data: { type: "BOT_EARNING", amount: botEarning, description: "Job payment", botId: submission.botId, jobId, submissionId: subId },
  });

  return { botEarning };
}, { isolationLevel: "Serializable" });
```

**Test:**
```typescript
it("should not double-pay when approve fires concurrently with QA", async () => {
  const { job, submission, bot } = await createTestScenario();

  await Promise.allSettled([
    approveSubmission(job.id, submission.id, operator.sessionToken),
    approveSubmission(job.id, submission.id, operator.sessionToken), // second attempt
  ]);

  const botAfter = await db.bot.findUnique({ where: { id: bot.id } });
  expect(botAfter!.totalEarned.toNumber()).toBe(job.budget.toNumber() * 0.9); // exactly once
  expect(botAfter!.jobsCompleted).toBe(1);
});
```

---

### SEC-011 🟠 HIGH — Stripe Webhook Double-Credit

**Priority:** Fix immediately  
**Files:** `src/app/api/webhooks/stripe/route.ts`, `prisma/schema.prisma`

**Schema fix:**
```prisma
model CreditTransaction {
  stripePaymentId String? @unique  // ADD @unique
}
```

**Code fix:**
```typescript
// In checkout.session.completed handler:
const paymentIntentId = session.payment_intent as string;

// Validate credits from line items (don't trust metadata)
const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
const credits = lineItems.data.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
if (credits <= 0) break;

try {
  await db.$transaction([
    db.operator.update({ where: { id: operatorId }, data: { creditBalance: { increment: credits } } }),
    db.creditTransaction.create({
      data: { amount: credits, type: "PURCHASE", description: `${credits} credits via Stripe`,
              stripePaymentId: paymentIntentId, operatorId }, // @unique throws P2002 on replay
    }),
    db.ledger.create({ data: { type: "CREDIT_PURCHASE", amount: credits, description: "Stripe purchase", operatorId } }),
  ]);
} catch (err: any) {
  if (err.code === "P2002") return Response.json({ received: true }); // Already processed
  throw err;
}
```

**Test:**
```typescript
it("is idempotent on duplicate Stripe webhook delivery", async () => {
  const operator = await createTestOperator({ creditBalance: 0 });
  const payload = makeCheckoutPayload({ operatorId: operator.id, credits: 100 });

  await POST(makeWebhookRequest(payload));
  await POST(makeWebhookRequest(payload)); // second delivery

  const op = await db.operator.findUnique({ where: { id: operator.id } });
  expect(op!.creditBalance.toNumber()).toBe(100); // not 200
});
```

---

### SEC-012 🟡 MEDIUM — Submission on OPEN Job

**Priority:** Next sprint  
**File:** `src/app/api/v1/jobs/[id]/submissions/route.ts`

**Fix:**
```typescript
// Change:
if (job.status !== "OPEN" && job.status !== "IN_PROGRESS") {
// To:
if (job.status !== "IN_PROGRESS") {
  return Response.json({ error: "Can only submit work for jobs that are in progress" }, { status: 409 });
}
```

---

### SEC-013 🟠 HIGH — Missing Security Headers

**Priority:** Fix within 2 weeks. See Section 6.1 for complete `next.config.ts`.

---

### SEC-014 🟡 MEDIUM — Rate Limiter Atomicity Bug

**Priority:** Fix within 2 weeks. Fixed in SEC-003 above (pipeline approach).

---

### SEC-015 🟡 MEDIUM — Cloud Run --set-env-vars for Secrets

**Priority:** Next sprint  
**File:** `.github/workflows/gcp-deploy.yml`

**Fix:**
```yaml
- name: Deploy to Cloud Run
  run: |
    gcloud run deploy $SERVICE_NAME \
      --image $IMAGE_TAG \
      --region $GCP_REGION \
      --set-env-vars="NODE_ENV=production" \
      --set-secrets="\
        DATABASE_URL=DATABASE_URL:latest,\
        AUTH_SECRET=AUTH_SECRET:latest,\
        API_KEY_HMAC_SECRET=API_KEY_HMAC_SECRET:latest,\
        OAUTH_TOKEN_ENCRYPTION_KEY=OAUTH_TOKEN_ENCRYPTION_KEY:latest,\
        STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,\
        STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest"
```

---

### SEC-016 🟡 MEDIUM — Missing DB CHECK Constraint for Non-Negative Credits

**Priority:** Fix immediately via migration  
**File:** New migration SQL file

**Migration:**
```sql
-- prisma/migrations/20260302_financial_constraints/migration.sql

ALTER TABLE "Operator"
ADD CONSTRAINT "Operator_creditBalance_non_negative"
CHECK ("creditBalance" >= 0);

ALTER TABLE "Bot"
ADD CONSTRAINT "Bot_totalEarned_non_negative"
CHECK ("totalEarned" >= 0);

ALTER TABLE "Job"
ADD CONSTRAINT "Job_budget_positive"
CHECK ("budget" > 0);

ALTER TABLE "Bid"
ADD CONSTRAINT "Bid_amount_positive"
CHECK ("amount" > 0);

-- For SEC-011: unique stripePaymentId
CREATE UNIQUE INDEX "CreditTransaction_stripePaymentId_key"
ON "CreditTransaction"("stripePaymentId")
WHERE "stripePaymentId" IS NOT NULL;
```

**Test:**
```typescript
it("DB rejects negative credit balance", async () => {
  const op = await createTestOperator({ creditBalance: 0 });
  await expect(
    db.operator.update({ where: { id: op.id }, data: { creditBalance: { decrement: 1 } } })
  ).rejects.toThrow();
});
```

---

### SEC-017 🟡 MEDIUM — next-auth v5-beta

**Priority:** Monitor  
**Fix:** Pin exact version in `package.json`: `"next-auth": "5.0.0-beta.25"` (remove `^`). Subscribe to https://github.com/nextauthjs/next-auth/security/advisories.

---

### SEC-018 🔵 LOW — No Dependency Scanning in CI

**Priority:** Next sprint  
**File:** `.github/workflows/ci.yml`

**Fix:**
```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level=high

- name: Snyk scan
  uses: snyk/actions/node@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    args: --severity-threshold=high
```

---

### SEC-019 🟡 MEDIUM — 30-Day Sessions

**Priority:** Next sprint. See Section 2.1 for complete auth hardening. Reduce to 7 days.

---

### SEC-020 🔵 LOW — No Admin Role System

**Priority:** Month 2. Schema addition:
```prisma
model Operator {
  role     String  @default("operator") // operator | admin | moderator
  isBanned Boolean @default(false)
}
```

---

### SEC-021 🔵 LOW — No Structured Audit Logging

**Priority:** Next sprint. See Section 8 for complete implementation.

---

## 2. Authentication Architecture

### 2.1 NextAuth Hardening

```typescript
// src/lib/auth.ts — HARDENED
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [GitHub, Google],
  pages: { signIn: "/login", error: "/login?error=true" },
  session: {
    strategy: "database",
    maxAge: 7 * 24 * 60 * 60,      // ✅ 7 days (was 30)
    updateAge: 24 * 60 * 60,        // ✅ Rotate token every 24h
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Host-next-auth.csrf-token"
        : "next-auth.csrf-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = (user as any).role ?? "operator";
      return session;
    },
    async signIn({ user }) {
      if (user.id) {
        const dbUser = await db.operator.findUnique({
          where: { id: user.id },
          select: { isBanned: true },
        });
        if (dbUser?.isBanned) return false;
      }
      return true;
    },
  },
});
```

### 2.2 API Key System v2

```typescript
// src/lib/crypto.ts
import { createHmac, randomBytes } from "crypto";

export function hashApiKey(rawKey: string): string {
  return createHmac("sha256", process.env.API_KEY_HMAC_SECRET ?? "dev-fallback")
    .update(rawKey)
    .digest("hex");
}

export function generateApiKey(): string {
  const prefix = process.env.NODE_ENV === "production" ? "bc_live_" : "bc_test_";
  return prefix + randomBytes(32).toString("hex");
}

// src/lib/api-keys.ts
export type KeyScope = "read" | "write" | "admin";

export const SCOPE_RATE_LIMITS: Record<KeyScope, { limit: number; window: number }> = {
  read:  { limit: 200, window: 60 },
  write: { limit: 60,  window: 60 },
  admin: { limit: 30,  window: 60 },
};

export async function createApiKey(opts: {
  botId: string;
  operatorId: string;
  scopes: KeyScope[];
  expiresAt?: Date;
  allowedIps?: string[];
  name?: string;
}): Promise<{ rawKey: string; keyId: string; prefix: string }> {
  const rawKey = generateApiKey();
  const hashedKey = hashApiKey(rawKey);
  const prefix = rawKey.slice(0, 16);

  const key = await db.apiKey.create({
    data: {
      hashedKey,
      prefix,
      botId: opts.botId,
      operatorId: opts.operatorId,
      scopes: opts.scopes,
      expiresAt: opts.expiresAt,
      allowedIps: opts.allowedIps ?? [],
      name: opts.name ?? "default",
    },
  });

  return { rawKey, keyId: key.id, prefix };
}

export async function rotateApiKey(
  botId: string,
  operatorId: string,
  gracePeriodHours = 24
): Promise<{ rawKey: string; keyId: string; prefix: string }> {
  const newKey = await createApiKey({ botId, operatorId, scopes: ["read", "write"] });

  // Old keys expire after grace period — zero-downtime rotation
  await db.apiKey.updateMany({
    where: { botId, operatorId, id: { not: newKey.keyId }, isActive: true },
    data: { expiresAt: new Date(Date.now() + gracePeriodHours * 3600 * 1000), rotatedAt: new Date() },
  });

  return newKey;
}
```

**ApiKey model (`prisma/schema.prisma`):**
```prisma
model ApiKey {
  id          String    @id @default(cuid())
  hashedKey   String    @unique
  prefix      String                        // First 16 chars for display
  name        String    @default("default")
  scopes      String[]  @default(["read", "write"])
  allowedIps  String[]  @default([])
  isActive    Boolean   @default(true)
  expiresAt   DateTime?
  rotatedAt   DateTime?
  lastUsedAt  DateTime?
  lastUsedIp  String?
  botId       String
  bot         Bot       @relation(fields: [botId], references: [id])
  operatorId  String
  operator    Operator  @relation(fields: [operatorId], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([botId])
  @@index([operatorId])
}
```

**Updated `src/lib/api-auth.ts`:**
```typescript
import { NextRequest } from "next/server";
import { hashApiKey } from "./crypto";
import { db } from "./db";
import { rateLimit, rateLimitResponse } from "./rate-limit";

export type KeyScope = "read" | "write" | "admin";

export type BotAuthResult =
  | { success: true; botId: string; operatorId: string; scopes: KeyScope[] }
  | { success: false; error: string; rateLimitResponse?: Response };

export async function authenticateBot(request: NextRequest): Promise<BotAuthResult> {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) return { success: false, error: "Missing x-api-key header" };

  if (!apiKey.startsWith("bc_live_") && !apiKey.startsWith("bc_test_")) {
    return { success: false, error: "Invalid API key format" };
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const rl = await rateLimit(`bot:${apiKey.slice(0, 16)}:${ip}`, 100, 60);
  if (!rl.success) return { success: false, error: "Rate limit exceeded", rateLimitResponse: rateLimitResponse(rl.resetAt) };

  const hashedKey = hashApiKey(apiKey);

  // Support both old Bot.apiKey field and new ApiKey model during migration
  const bot = await db.bot.findUnique({
    where: { apiKey: hashedKey },
    select: { id: true, operatorId: true, isActive: true },
  });

  if (!bot) return { success: false, error: "Invalid API key" };
  if (!bot.isActive) return { success: false, error: "Bot is deactivated" };

  // Update last used tracking
  await db.bot.update({ where: { id: bot.id }, data: { lastApiKeyUsedAt: new Date() } });

  return { success: true, botId: bot.id, operatorId: bot.operatorId, scopes: ["read", "write"] };
}

export function requireScope(scopes: KeyScope[], required: KeyScope): Response | null {
  if (!scopes.includes(required)) {
    return Response.json({ error: `This operation requires '${required}' scope` }, { status: 403 });
  }
  return null;
}

export function unauthorizedResponse(error: string): Response {
  return Response.json({ error }, { status: 401 });
}

export function forbiddenResponse(error: string): Response {
  return Response.json({ error }, { status: 403 });
}
```

### 2.3 JWT for WebSocket Auth

```typescript
// src/lib/ws-auth.ts
import { SignJWT, jwtVerify } from "jose";

const WS_SECRET = new TextEncoder().encode(process.env.WS_JWT_SECRET!);

export async function issueWsToken(subject: string, type: "user" | "bot"): Promise<string> {
  return new SignJWT({ type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m") // Short-lived — re-auth required every 5 minutes
    .sign(WS_SECRET);
}

export async function verifyWsToken(token: string) {
  const { payload } = await jwtVerify(token, WS_SECRET, { algorithms: ["HS256"] });
  return payload;
}

// GET /api/v1/auth/ws-token — issue WS tokens
export async function GET(request: NextRequest) {
  const botAuth = await authenticateBot(request);
  if (botAuth.success) {
    const token = await issueWsToken(botAuth.botId, "bot");
    return Response.json({ token, expiresIn: 300 });
  }
  const session = await auth();
  if (session?.user) {
    const token = await issueWsToken(session.user.id, "user");
    return Response.json({ token, expiresIn: 300 });
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
```

### 2.4 middleware.ts — Route Protection

```typescript
// src/middleware.ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/bots", "/jobs", "/wallet", "/settings", "/leaderboard", "/admin"];

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !isAuthed) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && isAuthed) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
```

---

## 3. Financial Security Architecture

### 3.1 PostgreSQL Advisory Locks

```typescript
// src/lib/financial.ts
import { db } from "./db";
import type { Prisma } from "@prisma/client";

function operatorLockId(operatorId: string): bigint {
  let hash = 0n;
  for (let i = 0; i < operatorId.length; i++) {
    hash = (hash * 31n + BigInt(operatorId.charCodeAt(i))) % (2n ** 63n - 1n);
  }
  return hash;
}

export async function withOperatorLock<T>(
  tx: Prisma.TransactionClient,
  operatorId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockId = operatorLockId(operatorId);
  const [{ acquired }] = await tx.$queryRaw<[{ acquired: boolean }]>`
    SELECT pg_try_advisory_xact_lock(${lockId}::bigint) AS acquired
  `;
  if (!acquired) {
    throw Object.assign(
      new Error("Concurrent credit operation — please retry"),
      { code: "LOCK_ACQUISITION_FAILED", retryable: true }
    );
  }
  return fn();
}

// Usage in job creation (deduct credits atomically):
export async function deductCreditsForJob(
  operatorId: string,
  amount: number,
  jobId: string
): Promise<void> {
  await db.$transaction(async (tx) => {
    await withOperatorLock(tx, operatorId, async () => {
      const operator = await tx.operator.findUnique({
        where: { id: operatorId },
        select: { creditBalance: true },
      });

      if (!operator) throw new Error("Operator not found");
      if (operator.creditBalance.toNumber() < amount) {
        throw Object.assign(new Error("Insufficient credits"), { code: "INSUFFICIENT_CREDITS" });
      }

      await tx.operator.update({ where: { id: operatorId }, data: { creditBalance: { decrement: amount } } });
      await tx.ledger.create({ data: { type: "JOB_PAYMENT", amount, description: "Job escrow", operatorId, jobId } });
    });
  }, { timeout: 10000, isolationLevel: "Serializable" });
}
```

### 3.2 Idempotency Keys

```typescript
// src/lib/idempotency.ts
import { db } from "./db";
import { randomBytes } from "crypto";

export function generateIdempotencyKey(): string {
  return `idem_${randomBytes(16).toString("hex")}`;
}

export async function withIdempotency<T>(
  key: string,
  operation: string,
  fn: () => Promise<T>
): Promise<{ result: T; fromCache: boolean }> {
  const existing = await db.idempotencyRecord.findUnique({
    where: { key_operation: { key, operation } },
  });
  if (existing) return { result: JSON.parse(existing.result), fromCache: true };

  const result = await fn();
  await db.idempotencyRecord.create({
    data: { key, operation, result: JSON.stringify(result), expiresAt: new Date(Date.now() + 86400000) },
  });
  return { result, fromCache: false };
}
```

**Schema addition:**
```prisma
model IdempotencyRecord {
  id        String   @id @default(cuid())
  key       String
  operation String
  result    String   @db.Text
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@unique([key, operation])
  @@index([expiresAt])
}

// Also add to Ledger model:
model Ledger {
  idempotencyKey String?  // For deduplication
}
```

### 3.3 Escrow State Machine

```typescript
// src/lib/escrow.ts
export type EscrowState = "CREATED" | "FUNDED" | "RELEASED" | "SETTLED" | "CANCELLED";

const VALID_TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  CREATED:   ["FUNDED", "CANCELLED"],
  FUNDED:    ["RELEASED", "CANCELLED"],
  RELEASED:  ["SETTLED"],
  SETTLED:   [],
  CANCELLED: [],
};

export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export async function transitionEscrow(
  jobId: string,
  to: EscrowState,
  actorId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { escrowState: true } });
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const from = (job.escrowState ?? "CREATED") as EscrowState;
    if (!canTransition(from, to)) {
      throw Object.assign(new Error(`Invalid transition: ${from} → ${to}`), { code: "INVALID_TRANSITION" });
    }

    await tx.job.update({ where: { id: jobId }, data: { escrowState: to } });
    await tx.escrowEvent.create({ data: { jobId, fromState: from, toState: to, actorId, metadata: metadata ?? {} } });
  });
}
```

**Schema additions:**
```prisma
model Job {
  escrowState  String @default("CREATED")
  escrowEvents EscrowEvent[]
}

model EscrowEvent {
  id        String   @id @default(cuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id])
  fromState String
  toState   String
  actorId   String
  metadata  Json     @default("{}")
  createdAt DateTime @default(now())
  @@index([jobId])
}
```

### 3.4 Reconciliation Worker

```typescript
// src/workers/reconciliation-worker.ts
import { Worker } from "bullmq";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

export const reconciliationWorker = new Worker(
  "reconciliation",
  async () => {
    const operators = await db.operator.findMany({ select: { id: true, creditBalance: true } });
    const discrepancies = [];

    for (const op of operators) {
      const result = await db.ledger.groupBy({
        by: ["type"],
        where: { operatorId: op.id },
        _sum: { amount: true },
      });

      const credits = result
        .filter((r) => ["CREDIT_PURCHASE", "REFUND"].includes(r.type))
        .reduce((s, r) => s + (r._sum.amount?.toNumber() ?? 0), 0);
      const debits = result
        .filter((r) => ["JOB_PAYMENT"].includes(r.type))
        .reduce((s, r) => s + (r._sum.amount?.toNumber() ?? 0), 0);

      const computed = credits - debits;
      const stored = op.creditBalance.toNumber();
      if (Math.abs(stored - computed) > 0.01) {
        discrepancies.push({ id: op.id, stored, computed, delta: stored - computed });
      }
    }

    if (discrepancies.length > 0) {
      logger.security("reconciliation_discrepancy", { discrepancies, count: discrepancies.length });
    } else {
      logger.info("Reconciliation passed", { checked: operators.length });
    }
  },
  { connection: redis }
);
```

---

## 4. Input Validation Framework

### 4.1 Complete Zod Schemas

```typescript
// src/lib/schemas.ts

import { z } from "zod";
import { isSafePublicUrl } from "./validation";

const safeUrl = z.string().url().refine(isSafePublicUrl, "URL must be a public HTTPS URL");

export const JOB_CATEGORIES = ["coding", "writing", "research", "data-analysis",
  "translation", "design", "qa-testing", "other"] as const;

// ─── Bot ─────────────────────────────────────────────────────────────────────
export const createBotSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[\w\s-]+$/),
  description: z.string().min(10).max(500).optional(),
  category: z.array(z.string().min(1).max(30)).min(1).max(5),
  webhookUrl: safeUrl.optional(),
});

// ─── Job ──────────────────────────────────────────────────────────────────────
export const createJobSchema = z.object({
  title: z.string().min(5).max(100).trim(),
  description: z.string().min(20).max(5000).trim(),
  category: z.enum(JOB_CATEGORIES),
  budget: z.number().positive().max(1_000_000),
  deadline: z.string().datetime().refine((d) => new Date(d) > new Date(), "Must be in the future"),
});

export const listJobsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  category: z.enum(JOB_CATEGORIES).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  minBudget: z.coerce.number().positive().optional(),
  maxBudget: z.coerce.number().positive().optional(),
  search: z.string().max(100).trim().optional(),
});

// ─── Bid ─────────────────────────────────────────────────────────────────────
export const createBidSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  message: z.string().min(10).max(1000).optional(),
});

// ─── Submission ───────────────────────────────────────────────────────────────
export const createSubmissionSchema = z.object({
  content: z.string().min(1).max(50000),
  fileUrls: z.array(safeUrl).max(10).default([]),
});

// ─── Rating ───────────────────────────────────────────────────────────────────
// NOTE: botId intentionally absent — derived server-side
export const rateJobSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(500).optional(),
});

// ─── Credits ─────────────────────────────────────────────────────────────────
const CREDIT_PACKAGES = [10, 50, 100, 500, 1000] as const;
export const purchaseCreditsSchema = z.object({
  credits: z.number().int().refine(
    (v) => (CREDIT_PACKAGES as readonly number[]).includes(v),
    `Must be one of: ${CREDIT_PACKAGES.join(", ")}`
  ),
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────
export const WEBHOOK_EVENTS = [
  "bid.accepted", "bid.rejected",
  "submission.approved", "submission.rejected", "submission.revision_requested",
  "job.cancelled", "rating.received",
] as const;

export const createWebhookSchema = z.object({
  url: safeUrl,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(10),
  name: z.string().max(50).optional(),
});
```

### 4.2 Request Validation Helper

```typescript
// src/lib/validate-request.ts
import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";

export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: Response }> {
  let body: unknown;
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return { error: Response.json({ error: "Content-Type must be application/json" }, { status: 415 }) };
    }
    body = await req.json();
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: Response.json({ error: "Validation failed", details: result.error.flatten() }, { status: 422 }) };
  }
  return { data: result.data };
}

export function parseQuery<T>(req: NextRequest, schema: ZodSchema<T>): { data: T } | { error: Response } {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    return { error: Response.json({ error: "Invalid query params", details: result.error.flatten() }, { status: 422 }) };
  }
  return { data: result.data };
}
```

### 4.3 File Upload Validation

```typescript
// src/lib/upload-validation.ts
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf", "text/plain", "text/markdown", "application/json",
  "text/csv", "image/png", "image/jpeg", "image/gif", "image/webp",
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(filename: string, mime: string, size: number) {
  if (size > MAX_SIZE) return { valid: false, error: "File too large (max 10MB)" };
  if (!ALLOWED_MIME_TYPES.has(mime)) return { valid: false, error: `File type '${mime}' not allowed` };
  if (/[^a-zA-Z0-9._-]/.test(filename)) return { valid: false, error: "Invalid filename characters" };
  if (filename.split(".").length > 3) return { valid: false, error: "Too many file extensions" };
  return { valid: true };
}

// Malware scanning concept (implement as Cloud Function trigger on GCS upload):
// 1. Client uploads to gs://thebotclub-quarantine/ via signed URL
// 2. Cloud Function triggers → runs ClamAV/DLP scan
// 3. Clean files → move to gs://thebotclub-uploads/
// 4. Infected files → delete + alert
// 5. Only gs://thebotclub-uploads/ URLs accepted in fileUrls validation
```

---

## 5. Business Logic Security

### 5.1 Self-Bidding Prevention (see SEC-001)

### 5.2 Rating Manipulation Prevention (see SEC-002)

### 5.3 Sybil Attack Mitigation

```typescript
// src/lib/trust.ts
export type TrustLevel = "UNVERIFIED" | "EMAIL_VERIFIED" | "PHONE_VERIFIED" | "KYC_VERIFIED";

export const TRUST_LIMITS = {
  UNVERIFIED:      { maxJobsPerDay: 0,  maxBots: 0,  maxCreditPurchase: 0     },
  EMAIL_VERIFIED:  { maxJobsPerDay: 3,  maxBots: 2,  maxCreditPurchase: 100   },
  PHONE_VERIFIED:  { maxJobsPerDay: 20, maxBots: 10, maxCreditPurchase: 1000  },
  KYC_VERIFIED:    { maxJobsPerDay: -1, maxBots: -1, maxCreditPurchase: -1    },
} as const;

export async function getTrustLevel(operatorId: string): Promise<TrustLevel> {
  const op = await db.operator.findUnique({
    where: { id: operatorId },
    select: { emailVerified: true, phoneVerified: true, kycVerified: true },
  });
  if (!op) throw new Error("Not found");
  if (op.kycVerified)    return "KYC_VERIFIED";
  if (op.phoneVerified)  return "PHONE_VERIFIED";
  if (op.emailVerified)  return "EMAIL_VERIFIED";
  return "UNVERIFIED";
}

// Apply at job creation route:
// const trust = await getTrustLevel(session.user.id);
// const limits = TRUST_LIMITS[trust];
// if (limits.maxJobsPerDay === 0) return 403 "Email verification required"
```

**Schema additions:**
```prisma
model Operator {
  phoneVerified Boolean  @default(false)
  kycVerified   Boolean  @default(false)
  trustScore    Int      @default(0)
  lastActivityAt DateTime?
  isBanned      Boolean  @default(false)
  bannedAt      DateTime?
  deletedAt     DateTime?
  lastLoginIp   String?
}
```

### 5.4 Trust Score — Anti-Gaming

```typescript
// src/lib/trust-score.ts
// Trust score is computed — never user-controlled
export async function computeTrustScore(operatorId: string): Promise<number> {
  const op = await db.operator.findUnique({
    where: { id: operatorId },
    select: { createdAt: true, emailVerified: true, phoneVerified: true },
  });
  if (!op) return 0;

  let score = 0;
  const ageWeeks = (Date.now() - op.createdAt.getTime()) / (7 * 24 * 3600 * 1000);
  score += Math.min(20, Math.floor(ageWeeks));          // Max 20 from age
  if (op.emailVerified) score += 20;                    // +20 email
  if (op.phoneVerified) score += 30;                    // +30 phone
  const completedJobs = await db.job.count({ where: { operatorId, status: "COMPLETED" } });
  if (completedJobs >= 5) score += Math.min(30, completedJobs * 2); // +30 from history
  return Math.min(100, score);
}
```

### 5.5 Job Cancellation with Refund

```typescript
// src/app/api/v1/jobs/[id]/cancel/route.ts
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitSession(session.user.id, 5, 60);
  if (!rl.success) return rateLimitResponse(rl.resetAt);

  try {
    const result = await db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({
        where: { id: params.id },
        select: { id: true, status: true, operatorId: true, budget: true,
                  _count: { select: { bids: { where: { status: "ACCEPTED" } } } } },
      });

      if (!job) throw Object.assign(new Error("Not found"), { status: 404 });
      if (job.operatorId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
      if (!["OPEN", "IN_PROGRESS"].includes(job.status)) {
        throw Object.assign(new Error(`Cannot cancel job with status '${job.status}'`), { status: 409 });
      }

      const hasAcceptedBid = job._count.bids > 0;
      const cancellationFee = hasAcceptedBid ? job.budget.toNumber() * 0.10 : 0;
      const refundAmount = job.budget.toNumber() - cancellationFee;

      await tx.job.update({ where: { id: params.id }, data: { status: "CANCELLED" } });
      await tx.bid.updateMany({ where: { jobId: params.id, status: "PENDING" }, data: { status: "REJECTED" } });

      if (refundAmount > 0) {
        await tx.operator.update({
          where: { id: job.operatorId },
          data: { creditBalance: { increment: refundAmount } },
        });
        await tx.ledger.create({
          data: { type: "REFUND", amount: refundAmount,
                  description: `Job cancelled${hasAcceptedBid ? " (10% fee)" : ""}`,
                  operatorId: job.operatorId, jobId: params.id },
        });
      }

      return { refundAmount, cancellationFee };
    });

    return Response.json({ success: true, ...result });
  } catch (err: any) {
    if (err.status) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
```

---

## 6. Infrastructure Security

### 6.1 HTTP Security Headers (next.config.ts)

```typescript
// next.config.ts — HARDENED
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://storage.googleapis.com`,
  "font-src 'self' data:",
  "frame-src https://js.stripe.com https://checkout.stripe.com",
  `connect-src 'self' https://api.stripe.com ${isDev ? "ws://localhost:3000" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security",  value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options",            value: "DENY" },
  { key: "X-Content-Type-Options",     value: "nosniff" },
  { key: "X-XSS-Protection",           value: "1; mode=block" },
  { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=(), payment=(self https://js.stripe.com)" },
  { key: "Content-Security-Policy",    value: ContentSecurityPolicy },
  { key: "X-DNS-Prefetch-Control",     value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, x-api-key, Authorization" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### 6.2 Dockerfile Hardening

```dockerfile
# Dockerfile — HARDENED

# Stage 1: Builder
FROM node:22.14.0-alpine3.21 AS builder
RUN apk update && apk upgrade --no-cache && apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@10.6.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm run build

# Stage 2: Runner (minimal)
FROM node:22.14.0-alpine3.21 AS runner
# Security updates in production image
RUN apk update && apk upgrade --no-cache && apk add --no-cache openssl
# Remove package managers from production image
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1))"

CMD ["node", "server.js"]
```

### 6.3 Terraform IAM Least Privilege

```hcl
# terraform/modules/gcp/iam-least-privilege.tf

# Cloud Run SA: Only what it needs
resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"        # NOT cloudsql.admin
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_log_writer" {
  project = var.gcp_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_metrics_writer" {
  project = var.gcp_project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_trace_agent" {
  project = var.gcp_project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# GitHub Actions: Deploy only (not full run.admin)
resource "google_cloud_run_v2_service_iam_member" "github_run_developer" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.developer"         # NOT run.admin
  member   = "serviceAccount:${google_service_account.github_actions.email}"
}

# New secrets for SEC-006, SEC-007
resource "google_secret_manager_secret" "api_key_hmac_secret" {
  secret_id = "API_KEY_HMAC_SECRET"
  project   = var.gcp_project_id
  replication { auto {} }
}

resource "google_secret_manager_secret" "oauth_token_encryption_key" {
  secret_id = "OAUTH_TOKEN_ENCRYPTION_KEY"
  project   = var.gcp_project_id
  replication { auto {} }
}

resource "google_secret_manager_secret_iam_member" "run_api_key_hmac" {
  secret_id = google_secret_manager_secret.api_key_hmac_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "run_oauth_encryption" {
  secret_id = google_secret_manager_secret.oauth_token_encryption_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Worker: separate SA with same secrets but no public invoker role
resource "google_service_account" "worker" {
  account_id   = "${local.app_name}-worker-sa"
  display_name = "Worker service account"
  project      = var.gcp_project_id
}

resource "google_project_iam_member" "worker_sql_client" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker.email}"
}
```

### 6.4 Secret Rotation Strategy

```
# Secret Rotation Schedule

| Secret                      | Period   | Method                          | Impact                              |
|-----------------------------|----------|---------------------------------|-------------------------------------|
| AUTH_SECRET                 | 90 days  | New GCP Secret version          | All sessions invalidated on rotation|
| API_KEY_HMAC_SECRET         | 90 days  | Dual-version migration script   | All bots must rotate API keys       |
| OAUTH_TOKEN_ENCRYPTION_KEY  | 180 days | Background re-encryption job    | Zero user impact if done in background |
| STRIPE_SECRET_KEY           | On breach| Stripe dashboard + SecMgr update| Immediate re-deploy required        |
| STRIPE_WEBHOOK_SECRET       | Per event| Stripe dashboard + SecMgr update| Must sync with Stripe exactly       |
| DATABASE_URL password       | 90 days  | Cloud SQL + SecMgr              | Pool auto-reconnects                |
| WS_JWT_SECRET               | 30 days  | GCP Secret Manager              | Tokens are 5min — no user impact    |

# API_KEY_HMAC_SECRET Rotation Procedure:
# 1. Generate: openssl rand -hex 32
# 2. Store as new Secret Manager version (keep old version)
# 3. Deploy with dual-hash support (try new hash first, fall back to old)
# 4. Run migration: UPDATE "Bot" SET "apiKey" = hmac_new(raw_key) -- requires raw keys!
# NOTE: Since raw keys aren't stored, rotation requires ALL bot operators to regenerate keys.
# Communicate this in advance. Use /api/v1/bots/me/api-key/rotate endpoint.
```

---

## 7. Data Protection

### 7.1 PII Inventory

```
# PII Data Classification

## Class 1 — HIGH SENSITIVITY
| Field               | Model    | Encrypt at Rest | Retention     |
|---------------------|----------|-----------------|---------------|
| email               | Operator | Cloud SQL TDE   | Account life  |
| access_token        | Account  | AES-256-GCM app | Token expiry  |
| refresh_token       | Account  | AES-256-GCM app | Token expiry  |
| stripePaymentId     | CreditTx | Cloud SQL TDE   | 7 years (tax) |
| lastLoginIp         | Operator | Cloud SQL TDE   | 90 days       |

## Class 2 — MEDIUM SENSITIVITY
| Field               | Model      | Encrypt at Rest | Retention     |
|---------------------|------------|-----------------|---------------|
| name                | Operator   | Cloud SQL TDE   | Account life  |
| image (avatar URL)  | Operator   | Cloud SQL TDE   | Account life  |
| submission content  | Submission | Cloud SQL TDE   | Job life+1yr  |
| bid messages        | Bid        | Cloud SQL TDE   | Job life      |

## Class 3 — LOW SENSITIVITY (operational data)
| Field               | Model  |
|---------------------|--------|
| Bot names           | Bot    |
| Job titles/budgets  | Job    |
| Ratings/comments    | Rating |
| Ledger entries      | Ledger |
```

### 7.2 API Response Filtering

```typescript
// src/lib/response-filters.ts — Never expose sensitive fields

// ✅ Safe to return to ANY caller
export const BOT_PUBLIC_SELECT = {
  id: true, name: true, description: true, category: true,
  rating: true, ratingCount: true, jobsCompleted: true, isActive: true, createdAt: true,
  // ❌ NEVER: apiKey (hash), operatorId, totalEarned, allowedIps
} as const;

// ✅ Safe to return to BOT OWNER only
export const BOT_OWNER_SELECT = {
  ...BOT_PUBLIC_SELECT,
  operatorId: true,
  totalEarned: true,
} as const;

// ✅ API key info for owner — NEVER return hashedKey
export const API_KEY_SAFE_SELECT = {
  id: true, prefix: true, name: true, scopes: true,
  allowedIps: true, isActive: true, expiresAt: true,
  lastUsedAt: true, createdAt: true,
  // ❌ NEVER: hashedKey
} as const;

// ✅ Sealed-bid integrity: bots only see their OWN bids
export function filterJobBidsForBot(job: any, botId: string) {
  return { ...job, bids: (job.bids ?? []).filter((b: any) => b.botId === botId) };
}
```

### 7.3 GDPR Compliance

```typescript
// src/app/api/v1/operators/me/export/route.ts — GDPR Art. 20 data portability
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = session.user.id;
  const [profile, jobs, bots, transactions, ledger] = await Promise.all([
    db.operator.findUnique({ where: { id }, select: { id: true, name: true, email: true, createdAt: true } }),
    db.job.findMany({ where: { operatorId: id } }),
    db.bot.findMany({ where: { operatorId: id }, select: BOT_OWNER_SELECT }),
    db.creditTransaction.findMany({ where: { operatorId: id } }),
    db.ledger.findMany({ where: { operatorId: id } }),
  ]);

  const data = { exportedAt: new Date().toISOString(), profile, jobs, bots, transactions, ledger };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="botclub-export-${id}.json"`,
    },
  });
}

// src/app/api/v1/operators/me/route.ts — DELETE: GDPR Art. 17 right to erasure
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = session.user.id;
  const activeJobs = await db.job.count({ where: { operatorId: id, status: { in: ["OPEN", "IN_PROGRESS"] } } });
  if (activeJobs > 0) {
    return Response.json({ error: "Cancel all active jobs before deleting account" }, { status: 409 });
  }

  // Anonymize (preserve financial audit trail per tax law)
  await db.$transaction([
    db.operator.update({
      where: { id },
      data: {
        name: `[Deleted ${id.slice(-8)}]`,
        email: `deleted-${id}@deleted.invalid`,
        image: null,
        emailVerified: null,
        deletedAt: new Date(),
      },
    }),
    db.session.deleteMany({ where: { userId: id } }),
    db.account.deleteMany({ where: { userId: id } }),
    db.bot.updateMany({ where: { operatorId: id }, data: { isActive: false } }),
  ]);

  return Response.json({ success: true });
}
```

---

## 8. Security Monitoring

### 8.1 Structured Logging (Pino)

```typescript
// src/lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "thebotclub", env: process.env.NODE_ENV },
  // GCP-compatible severity mapping
  formatters: {
    level: (label) => ({
      severity: ({ trace: "DEBUG", debug: "DEBUG", info: "INFO", warn: "WARNING",
                   error: "ERROR", fatal: "CRITICAL" } as any)[label] ?? "INFO",
    }),
  },
  // Redact sensitive fields — never log API keys, tokens, or passwords
  redact: {
    paths: ["*.apiKey", "*.hashedKey", "*.rawKey", "*.access_token",
            "*.refresh_token", 'req.headers["x-api-key"]', "req.headers.authorization"],
    censor: "[REDACTED]",
  },
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

// Convenience methods
export const securityLog = (event: string, data: object) =>
  logger.warn({ channel: "security", event, ...data, ts: new Date().toISOString() });

export const auditLog = (action: string, data: {
  actorId?: string; actorType?: string; resourceId?: string;
  outcome?: "success" | "failure"; [k: string]: unknown;
}) => logger.info({ channel: "audit", action, ...data, ts: new Date().toISOString() });

export const financialLog = (operation: string, data: object) =>
  logger.info({ channel: "financial", operation, ...data, ts: new Date().toISOString() });
```

### 8.2 Security Event Definitions

```typescript
// src/lib/security-events.ts
export const SEC_EVENTS = {
  AUTH_LOGIN_SUCCESS:          "auth.login.success",
  AUTH_LOGIN_FAILURE:          "auth.login.failure",
  AUTH_ACCOUNT_BANNED:         "auth.account.banned",
  API_KEY_INVALID:             "apikey.invalid",
  API_KEY_ROTATED:             "apikey.rotated",
  API_KEY_IP_BLOCKED:          "apikey.ip_blocked",
  RATE_LIMIT_BOT:              "ratelimit.exceeded.bot",
  RATE_LIMIT_SESSION:          "ratelimit.exceeded.session",
  PAYMENT_DOUBLE_CREDIT:       "payment.double_credit_prevented",
  PAYMENT_WEBHOOK_REPLAY:      "payment.webhook_replay",
  PAYMENT_UNAUTHORIZED_PAYOUT: "payment.unauthorized_payout",
  BALANCE_NEGATIVE_PREVENTED:  "balance.negative_prevented",
  RECONCILIATION_DISCREPANCY:  "reconciliation.discrepancy",
  SELF_BID_BLOCKED:            "bid.self_dealing_blocked",
  INVALID_RATING_BLOCKED:      "rating.invalid_blocked",
  SSRF_ATTEMPT_BLOCKED:        "ssrf.attempt_blocked",
  UNAUTHORIZED_ACCESS:         "access.unauthorized",
  SUSPICIOUS_IP_PATTERN:       "ip.multiple_accounts",
} as const;
```

### 8.3 Alerting Rules

```yaml
# GCP Monitoring alert policies (create via Terraform or console)

alerts:
  - name: "Failed Auth Spike"
    filter: 'jsonPayload.channel="security" AND jsonPayload.event="apikey.invalid"'
    threshold: 100 per 5 minutes
    action: PagerDuty + Slack #security-alerts

  - name: "Rate Limit Flood"
    filter: 'jsonPayload.channel="security" AND jsonPayload.event=~"ratelimit.*"'
    threshold: 500 per 5 minutes
    action: Slack #security-alerts

  - name: "Financial Discrepancy"
    filter: 'jsonPayload.channel="security" AND jsonPayload.event="reconciliation.discrepancy"'
    threshold: 1 (any occurrence)
    action: PagerDuty P1 + Slack #security-critical

  - name: "Unauthorized Payout Attempt"
    filter: 'jsonPayload.event="payment.unauthorized_payout"'
    threshold: 1 (any occurrence)
    action: PagerDuty P1 + Slack #security-critical

  - name: "Webhook Replay Detected"
    filter: 'jsonPayload.event="payment.webhook_replay"'
    threshold: 5 per 1 minute
    action: Slack #security-alerts

  - name: "Self-Dealing Attempts"
    filter: 'jsonPayload.event="bid.self_dealing_blocked"'
    threshold: 10 per 1 hour
    action: Slack #security-alerts (possible coordinated abuse)

  - name: "SSRF Attempts"
    filter: 'jsonPayload.event="ssrf.attempt_blocked"'
    threshold: 5 per 5 minutes
    action: Slack #security-alerts
```

### 8.4 Incident Response Playbook

```markdown
## Incident Response Playbook

### P1 — Financial Data Breach / Credit Manipulation
1. **Contain**: Immediately disable affected operator account(s) via admin API
2. **Preserve**: Export all relevant logs from Cloud Logging before any changes
3. **Assess**: Run reconciliation worker to identify all affected balances
4. **Notify**: Alert engineering lead + legal within 1 hour
5. **Remediate**: Correct balances in database with audit trail entries
6. **Report**: If >500 users affected, GDPR 72-hour notification obligation

### P1 — API Key Compromise
1. **Revoke**: Immediately deactivate the compromised ApiKey record
2. **Investigate**: Check audit logs for all operations with that key prefix
3. **Notify**: Email operator to rotate key
4. **Monitor**: Watch for further suspicious activity from operator's bots

### P2 — Stripe Webhook Anomaly
1. Check Cloud Logging for replay pattern (payment.webhook_replay events)
2. Cross-reference CreditTransaction table against Stripe dashboard
3. If duplicates found: refund manually, add to ops log
4. Contact Stripe support if webhook delivery issues persist

### P2 — DDoS / Rate Limit Flood
1. Identify source IPs from Cloud Armor logs
2. Add temporary IP blocks in Cloud Armor security policy
3. Scale up Cloud Run instances if needed
4. Review rate limit thresholds post-incident

### P3 — Dependency Vulnerability
1. pnpm audit output appears in CI
2. Assess severity (HIGH = 1 sprint, CRITICAL = same day)
3. Update dependency, run tests, deploy
4. Document in security changelog
```

---

## 9. Compliance Checklist

### 9.1 OWASP Top 10 — Status After Remediation

| Category | Before | After Fixes | Key Fixes |
|----------|--------|-------------|-----------|
| A01 Broken Access Control | ❌ FAIL | ✅ PASS | SEC-001, 002, 004, middleware.ts |
| A02 Cryptographic Failures | ⚠️ PARTIAL | ✅ PASS | SEC-006 (HMAC), SEC-007 (token encryption) |
| A03 Injection | ✅ PASS | ✅ PASS | Prisma parameterisation unchanged |
| A04 Insecure Design | ❌ FAIL | ✅ PASS | SEC-010 (atomic payments), SEC-011 (idempotency) |
| A05 Security Misconfiguration | ❌ FAIL | ✅ PASS | SEC-013 (CSP/HSTS), SEC-014 (rate limit), SEC-016 (DB constraints) |
| A06 Vulnerable Components | ⚠️ PARTIAL | ✅ PASS | SEC-018 (pnpm audit in CI), SEC-017 (pin beta) |
| A07 Auth Failures | ⚠️ PARTIAL | ✅ PASS | SEC-019 (7-day sessions), middleware.ts, API Key v2 |
| A08 Software Integrity | ✅ PASS | ✅ PASS | Stripe signature verification |
| A09 Logging & Monitoring | ❌ FAIL | ✅ PASS | Pino structured logging, audit trail, alerting |
| A10 SSRF | ⚠️ PARTIAL | ✅ PASS | SEC-009 (URL validation) |

### 9.2 PCI-DSS SAQ-A Checklist (Stripe as payment processor)

| Requirement | Status | Notes |
|-------------|--------|-------|
| No cardholder data stored | ✅ | Stripe handles all card data |
| Webhook signature verification | ✅ | `constructEvent()` implemented |
| TLS 1.2+ for all transmissions | ✅ | Cloud Run enforces HTTPS |
| Idempotent payment processing | ✅ FIXED | SEC-011: @unique + P2002 guard |
| Financial audit trail | ✅ IMPROVED | Ledger + structured logs |
| Least privilege for Stripe API | ✅ | GCP Secret Manager with IAM |
| Separate test/live API keys | ✅ | `bc_test_` / `bc_live_` prefixes |
| Access to Stripe dashboard logged | ⚠️ | Use Stripe audit log + 2FA on account |
| Regular security reviews | ✅ | This document + quarterly review |

### 9.3 SOC 2 Readiness

| Trust Service Criteria | Status | Gap |
|------------------------|--------|-----|
| CC6.1 Logical access | ⚠️ IN PROGRESS | API Key v2 + RBAC needed |
| CC6.2 User authentication | ✅ | NextAuth + API Keys |
| CC6.3 Authorization | ✅ IMPROVED | Ownership checks + scopes |
| CC6.6 Malicious software | ⚠️ IN PROGRESS | File scanning, pnpm audit |
| CC7.1 System monitoring | ⚠️ IN PROGRESS | Pino + Cloud Monitoring |
| CC7.2 Anomaly detection | ⚠️ IN PROGRESS | Alert policies needed |
| CC8.1 Change management | ✅ | GitHub PR + CI |
| A1.2 Availability | ⚠️ | Need SLO targets |

### 9.4 Privacy Policy Requirements

The following must be documented in your Privacy Policy:
- **Data collected:** Email, name, avatar, OAuth tokens, IP addresses, job content
- **Purpose:** Platform operation, fraud prevention, tax compliance
- **Retention:** Account data (account life), financial records (7 years), IP logs (90 days)
- **Third parties:** Stripe (payment processing), GCP (hosting), GitHub/Google (OAuth)
- **GDPR rights:** Access (data export endpoint), deletion (anonymization endpoint), portability
- **Cookie policy:** Session cookies (httpOnly, sameSite=lax), CSRF tokens
- **Contact:** DPO email address

---

## 10. Security Testing Plan

### 10.1 Unit Tests — Auth & Authorization

```typescript
// __tests__/unit/auth.test.ts
import { hashApiKey, generateApiKey } from "@/lib/crypto";
import { isSafePublicUrl } from "@/lib/validation";

describe("hashApiKey", () => {
  it("produces consistent HMAC output", () => {
    process.env.API_KEY_HMAC_SECRET = "test-secret-32-bytes-minimum-len";
    const h1 = hashApiKey("bc_test_abc");
    const h2 = hashApiKey("bc_test_abc");
    expect(h1).toBe(h2);
  });

  it("is different from bare SHA-256", () => {
    const key = "bc_test_abc";
    const hmac = hashApiKey(key);
    const sha256 = require("crypto").createHash("sha256").update(key).digest("hex");
    expect(hmac).not.toBe(sha256);
  });

  it("different secret → different hash", () => {
    process.env.API_KEY_HMAC_SECRET = "secret-a";
    const h1 = hashApiKey("bc_test_abc");
    process.env.API_KEY_HMAC_SECRET = "secret-b";
    const h2 = hashApiKey("bc_test_abc");
    expect(h1).not.toBe(h2);
  });
});

describe("isSafePublicUrl", () => {
  const blocked = [
    "http://metadata.google.internal/",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/internal",
    "https://192.168.1.1/",
    "https://127.0.0.1/",
    "https://localhost/",
    "file:///etc/passwd",
    "http://public.example.com/",  // http not https
  ];
  const allowed = [
    "https://storage.googleapis.com/bucket/file.pdf",
    "https://github.com/user/repo",
    "https://example.com/api/webhook",
  ];
  test.each(blocked)("blocks: %s", (url) => expect(isSafePublicUrl(url)).toBe(false));
  test.each(allowed)("allows: %s", (url) => expect(isSafePublicUrl(url)).toBe(true));
});

// __tests__/unit/escrow.test.ts
import { canTransition } from "@/lib/escrow";

describe("canTransition", () => {
  it("allows valid transitions", () => {
    expect(canTransition("CREATED", "FUNDED")).toBe(true);
    expect(canTransition("FUNDED", "RELEASED")).toBe(true);
    expect(canTransition("RELEASED", "SETTLED")).toBe(true);
  });

  it("blocks invalid transitions (no skipping)", () => {
    expect(canTransition("CREATED", "RELEASED")).toBe(false);
    expect(canTransition("CREATED", "SETTLED")).toBe(false);
    expect(canTransition("SETTLED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "FUNDED")).toBe(false);
  });
});
```

### 10.2 Integration Tests — Financial Flows

```typescript
// __tests__/integration/financial.test.ts

describe("Credit System", () => {
  it("prevents negative balance via DB constraint", async () => {
    const op = await createTestOperator({ creditBalance: 0 });
    await expect(
      db.operator.update({ where: { id: op.id }, data: { creditBalance: { decrement: 1 } } })
    ).rejects.toThrow(); // P2502 CHECK constraint
  });

  it("Stripe webhook is idempotent", async () => {
    const op = await createTestOperator({ creditBalance: 0 });
    const event = makeCheckoutEvent({ operatorId: op.id, credits: 100, paymentIntentId: "pi_test_123" });
    await processStripeWebhook(event);
    await processStripeWebhook(event); // second delivery
    const updated = await db.operator.findUnique({ where: { id: op.id } });
    expect(updated!.creditBalance.toNumber()).toBe(100);
  });
});

describe("Job Payment", () => {
  it("does not double-pay when approve races with concurrent approval attempt", async () => {
    const { job, submission, bot, operator } = await setupJobScenario();
    const [r1, r2] = await Promise.allSettled([
      approveSubmission(job.id, submission.id, operator.sessionToken),
      approveSubmission(job.id, submission.id, operator.sessionToken),
    ]);
    const successes = [r1, r2].filter((r) => r.status === "fulfilled");
    const failures = [r1, r2].filter((r) => r.status === "rejected");
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    const botAfter = await db.bot.findUnique({ where: { id: bot.id } });
    expect(botAfter!.jobsCompleted).toBe(1);
    expect(botAfter!.totalEarned.toNumber()).toBeCloseTo(job.budget * 0.9, 2);
  });

  it("payout worker rejects unauthorized payout", async () => {
    const owner = await createTestOperator();
    const attacker = await createTestOperator();
    const bot = await createTestBot(owner.id, { totalEarned: 100 });
    await expect(processPayoutJob({ botId: bot.id, operatorId: attacker.id, amount: 50 }))
      .rejects.toThrow(/SECURITY/);
  });
});

describe("Access Control", () => {
  it("prevents self-bidding", async () => {
    const op = await createTestOperator();
    const bot = await createTestBot(op.id);
    const job = await createTestJob(op.id, { budget: 100 });
    const res = await placeBid(job.id, bot.apiKey, { amount: 50 });
    expect(res.status).toBe(403);
  });

  it("prevents rating bots that did not work on a job", async () => {
    const op = await createTestOperator();
    const job = await createTestJob(op.id, { status: "COMPLETED" }); // no accepted bid
    const res = await rateJob(job.id, op.sessionToken, { score: 5 });
    expect(res.status).toBe(422);
  });
});
```

### 10.3 Penetration Testing Checklist

```
# Pre-launch Penetration Test Checklist

## Authentication & Session
[ ] Test expired session token rejection
[ ] Test session fixation attack (pre-auth session token)
[ ] Test CSRF on state-changing endpoints
[ ] Test cookie attributes (httpOnly, sameSite, secure)
[ ] Test that API keys fail after rotation/deactivation

## Authorization
[ ] Test cross-operator job access (access another operator's job)
[ ] Test cross-operator bot access
[ ] Test self-bidding via direct API call
[ ] Test rating arbitrary bots by manipulating botId
[ ] Test accessing admin endpoints without admin role

## Financial
[ ] Fuzz credit purchase amounts (negative, zero, float overflow)
[ ] Test concurrent job creation to race the credit deduction
[ ] Test Stripe webhook replay
[ ] Test payout with unauthorized operatorId
[ ] Test job cancellation refund amounts

## Injection & SSRF
[ ] Test fileUrls with all private IP ranges
[ ] Test fileUrls with URL encoding bypass (e.g. https://169%2e254%2e169%2e254/)
[ ] Test webhook URLs with redirect to internal addresses
[ ] Fuzz all text inputs for XSS payloads
[ ] Test Content-Security-Policy blocks injected scripts

## Rate Limiting
[ ] Verify rate limits apply per-user (not just per-IP)
[ ] Test rate limit bypass via different IPs
[ ] Test that rate limits reset correctly after window

## Infrastructure
[ ] Test for information disclosure in error messages
[ ] Verify no server-side stack traces in production
[ ] Test HTTP → HTTPS redirect
[ ] Verify HSTS header is set
[ ] Test CSP blocks external script loading
```

### 10.4 Dependency Scanning

```yaml
# .github/workflows/security.yml — Full security scan workflow

name: Security Scan
on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    - cron: "0 6 * * 1"  # Weekly Monday 6AM

jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile

      # npm audit
      - name: pnpm audit
        run: pnpm audit --audit-level=high
        continue-on-error: false

      # Snyk (requires SNYK_TOKEN secret)
      - name: Snyk vulnerability scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --fail-on=upgradable

  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # CodeQL static analysis
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          queries: security-and-quality

      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3

      # Semgrep SAST
      - uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/owasp-top-ten
            p/typescript
        env:
          SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}

  secrets-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      # Detect accidentally committed secrets
      - uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified

  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image for scanning
        run: docker build -t thebotclub:scan .
      - name: Trivy container scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: thebotclub:scan
          severity: HIGH,CRITICAL
          exit-code: "1"
```

---

## Implementation Priority Summary

### 🔴 Fix Before ANY Real Money (This Week)

| ID | Fix | File(s) | Effort |
|----|-----|---------|--------|
| SEC-010 | Remove payment from QA worker; atomic approve | qa-worker.ts, approve/route.ts | 2h |
| SEC-011 | Stripe webhook idempotency + @unique constraint | webhooks/stripe/route.ts, schema.prisma | 1h |
| SEC-001 | Self-bid prevention | bids/route.ts | 30min |
| SEC-016 | DB CHECK constraints migration | New migration SQL | 30min |
| SEC-002 | Rating: derive botId server-side | rate/route.ts | 1h |
| SEC-004 | Payout worker authorization check | payout-worker.ts | 1h |

### 🟠 Fix Within 2 Weeks

| ID | Fix | File(s) | Effort |
|----|-----|---------|--------|
| SEC-006 | HMAC-SHA256 for API keys + key rotation endpoint | api-auth.ts, crypto.ts | 3h |
| SEC-003/014 | Atomic rate limiter + session rate limits | rate-limit.ts + all routes | 2h |
| SEC-013 | Security headers + CSP | next.config.ts | 1h |
| middleware | Route protection | src/middleware.ts | 1h |
| SEC-015 | Cloud Run --set-secrets | gcp-deploy.yml | 30min |

### 🟡 Fix Within 1 Month

| ID | Fix | File(s) | Effort |
|----|-----|---------|--------|
| SEC-007 | OAuth token encryption | token-crypto.ts, auth.ts | 2h |
| SEC-009 | SSRF URL validation | validation.ts | 1h |
| SEC-012 | Submission status check | submissions/route.ts | 30min |
| SEC-019 | 7-day sessions | auth.ts | 30min |
| SEC-018 | CI dependency scanning | security.yml | 1h |
| SEC-021 | Pino structured logging | logger.ts + all files | 4h |
| Cancel | Job cancellation endpoint | cancel/route.ts | 2h |
| GDPR | Data export + deletion endpoints | operators/me/export + DELETE | 3h |

### 🔵 Long Term (Month 2+)

- Full API Key v2 system (scopes, IP allowlist, rotation endpoint)
- Admin/RBAC system
- Reconciliation worker + alerting
- Sybil mitigation (email → phone verification flow)
- External penetration test
- SOC 2 audit preparation
- Complete webhook delivery system

---

*Document version 1.0 — 2026-03-02*  
*Next review: After all 🔴 and 🟠 items are resolved*
