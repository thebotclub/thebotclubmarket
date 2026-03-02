# The Bot Club — Security Audit Report v1.0

**Audited by:** Senior Security Engineer (automated audit)  
**Date:** 2026-03-02  
**Scope:** Full codebase — `/home/hani/github/thebotclub/`  
**Stack:** Next.js 15, Prisma/PostgreSQL, NextAuth v5-beta, BullMQ/Redis, Stripe, GCP Cloud Run  

---

## Executive Summary

The Bot Club marketplace handles real money (credits, Stripe payments, bot payouts) and exposes an API to AI agents via API keys. The overall architecture is reasonably sound — Prisma parameterisation prevents SQL injection, API keys are hashed, and the Dockerfile follows best practices. However, several **critical and high-severity vulnerabilities** exist that could result in financial loss, fraud, and data compromise.

### Risk Counts

| Severity | Count |
|----------|-------|
| 🔴 Critical | 3 |
| 🟠 High | 6 |
| 🟡 Medium | 7 |
| 🔵 Low / Informational | 3 |
| **Total** | **19** |

### Overall Security Posture Score: **4.5 / 10**

*The platform has good foundations (parameterised queries, key hashing, multi-stage Docker build) but critical financial logic flaws and missing infrastructure controls significantly reduce the score.*

---

## Table of Contents

1. [OWASP A01 — Broken Access Control](#owasp-a01--broken-access-control)
2. [OWASP A02 — Cryptographic Failures](#owasp-a02--cryptographic-failures)
3. [OWASP A03 — Injection](#owasp-a03--injection)
4. [OWASP A04 — Insecure Design](#owasp-a04--insecure-design)
5. [OWASP A05 — Security Misconfiguration](#owasp-a05--security-misconfiguration)
6. [OWASP A06 — Vulnerable Components](#owasp-a06--vulnerable-components)
7. [OWASP A07 — Identification and Authentication Failures](#owasp-a07--identification--authentication-failures)
8. [OWASP A09 — Logging and Monitoring Failures](#owasp-a09--logging--monitoring-failures)
9. [Dedicated: API Key Security](#dedicated-api-key-security)
10. [Dedicated: Financial and Credit Security](#dedicated-financial--credit-security)
11. [Compliance Checklist](#compliance-checklist)
12. [Remediation Roadmap](#remediation-roadmap)

---

## OWASP A01 — Broken Access Control

### SEC-001 🔴 Critical — Bot Can Bid on Its Own Operator's Job (Self-Dealing)

**CVSS-like Score:** 9.1 (Critical)  
**File:** `src/app/api/v1/jobs/[id]/bids/route.ts`

**Description:**  
When a bot places a bid, the system does not check whether the bot's operator is the same as the job's operator. This allows an operator to post a job, escrow their own credits, then bid with their own bot, accept their own bid, and approve their own submission — effectively gaming the platform, earning fake ratings, and laundering credits.

**Proof of Concept — Vulnerable Code:**
```typescript
// src/app/api/v1/jobs/[id]/bids/route.ts
const job = await db.job.findUnique({
  where: { id: jobId },
  select: { id: true, status: true, budget: true, operatorId: true },
});
// MISSING CHECK: if (job.operatorId === botAuth.operatorId) return 403
// botAuth.operatorId is available from authenticateBot()
// job.operatorId is fetched above
// The gap allows a bot to bid on its own operator's job
```

Attack flow:
1. Operator registers bot → gets API key
2. Operator creates job for 100 credits (credits escrowed)
3. Operator's bot bids via API key → no rejection
4. Operator accepts their own bot's bid
5. Bot submits work, operator approves
6. Bot gains `totalEarned += 90`, `jobsCompleted++`
7. Operator rates their own bot 5 stars

**Remediation:**
```typescript
// After fetching the job, add:
if (job.operatorId === botAuth.operatorId) {
  return Response.json(
    { error: "Bot operators cannot bid on their own jobs" },
    { status: 403 }
  );
}
```

---

### SEC-002 🔴 Critical — Arbitrary Bot Rating: botId Not Validated Against Job Work

**CVSS-like Score:** 8.2 (High)  
**File:** `src/app/api/v1/jobs/[id]/rate/route.ts`

**Description:**  
The rating endpoint accepts a `botId` in the request body without verifying that bot actually worked on the job (had an accepted bid or approved submission). Any job owner can rate ANY bot — including bots that never participated — inflating or tanking competitor ratings.

**Proof of Concept — Vulnerable Code:**
```typescript
// src/app/api/v1/jobs/[id]/rate/route.ts
const { botId, score, comment } = parsed.data; // botId is user-supplied, not derived from job

const existing = await db.rating.findUnique({
  where: { jobId_botId: { jobId, botId } },
});
// NO CHECK: did this botId have an accepted bid on jobId?
// NO CHECK: did this botId have an approved submission on jobId?

await db.$transaction(async (tx) => {
  await tx.rating.create({ data: { score, comment, jobId, botId } });
  // Updates bot.rating for ANY botId the attacker specifies
  const ratings = await tx.rating.findMany({ where: { botId }, select: { score: true } });
  const avgRating = ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;
  await tx.bot.update({ where: { id: botId }, data: { rating: Math.round(avgRating * 10) / 10 } });
});
```

**Remediation:**
```typescript
// Verify the bot actually performed work on this job
const winningBid = await db.bid.findFirst({
  where: { jobId, botId, status: "ACCEPTED" },
});
if (!winningBid) {
  return Response.json(
    { error: "Can only rate the bot that performed work on this job" },
    { status: 422 }
  );
}
```

---

### SEC-003 🟠 High — No Rate Limiting on Session-Authenticated Endpoints

**CVSS-like Score:** 7.5 (High)  
**Files:** All `src/app/api/v1/` session routes

**Description:**  
Rate limiting is only applied to bot API key requests via `authenticateBot()`. All session-authenticated endpoints (job creation, bid acceptance, submission approval, rating) have zero rate limiting. An authenticated operator can make unlimited requests, enabling:
- Automated abuse of the credit/job system
- Enumeration attacks on job/bid/submission IDs
- Denial of service via expensive DB queries

**Remediation:**
```typescript
// Add to src/lib/rate-limit.ts:
export async function rateLimitSession(userId: string, limit = 60, windowSeconds = 60) {
  return rateLimit(`session:${userId}`, limit, windowSeconds);
}

// Apply in each session route:
const session = await auth();
if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
const rl = await rateLimitSession(session.user.id);
if (!rl.success) return rateLimitResponse(rl.resetAt);
```

---

### SEC-004 🟠 High — Payout Worker Has No Authorization Verification

**CVSS-like Score:** 7.8 (High)  
**File:** `src/workers/payout-worker.ts`

**Description:**  
The payout worker processes BullMQ jobs with arbitrary `botId`, `operatorId`, and `amount` data. It does not verify that `operatorId` actually owns `botId`. If an attacker can enqueue payout jobs (compromised Redis, missing queue auth), they can drain any bot's earnings.

**Proof of Concept — Vulnerable Code:**
```typescript
// payout-worker.ts
const { botId, operatorId, amount, stripeAccountId } = job.data;

const bot = await db.bot.findUnique({
  where: { id: botId },
  select: { id: true, name: true, totalEarned: true },
  // NO SELECT of operatorId for verification
});

// Only checks totalEarned >= amount — does NOT verify operatorId owns botId
if (bot.totalEarned.toNumber() < amount) {
  throw new Error(`Insufficient earnings`);
}

// If Redis is compromised, attacker enqueues: { botId: "victim-bot", operatorId: "attacker", amount: 999 }
// This passes all checks and drains the victim bot's earnings
```

**Remediation:**
```typescript
const bot = await db.bot.findUnique({
  where: { id: botId },
  select: { id: true, operatorId: true, totalEarned: true },
});
if (!bot || bot.operatorId !== operatorId) {
  throw new Error(`Unauthorized: bot ${botId} not owned by operator ${operatorId}`);
}
```

---

### SEC-005 🟡 Medium — GET /api/health Unauthenticated Information Disclosure

**CVSS-like Score:** 4.3 (Medium)  
**File:** `src/app/api/health/route.ts`

**Description:**  
The health endpoint is public and reveals database connectivity status. This confirms the attack surface during incidents.

**Remediation:** Restrict access to GCP health check IP ranges or add a shared secret header.

---

## OWASP A02 — Cryptographic Failures

### SEC-006 🟠 High — SHA-256 Without HMAC Salt for API Key Storage

**CVSS-like Score:** 7.0 (High)  
**Files:** `src/lib/api-auth.ts`, `src/app/api/v1/bots/route.ts`

**Description:**  
API keys are hashed with bare SHA-256 (no HMAC, no KDF). While 32 random bytes provide adequate entropy against rainbow tables, using HMAC-SHA256 with a server secret adds defence in depth: a compromised database alone cannot crack the keys without also knowing the HMAC secret.

Additionally, there are two key generation code paths:
- `bots/route.ts`: uses Node `randomBytes(32)` — correct
- `utils.ts` `generateApiKey()`: uses Web Crypto `getRandomValues` — inconsistency

**Proof of Concept:**
```typescript
// api-auth.ts — bare SHA-256, no salt
const hashedKey = createHash("sha256").update(apiKey).digest("hex");

// bots/route.ts — same pattern on write
const hashedApiKey = createHash("sha256").update(rawApiKey).digest("hex");
```

**Remediation:**
```typescript
// Use HMAC-SHA256 with server secret:
import { createHmac } from "crypto";

function hashApiKey(rawKey: string): string {
  return createHmac("sha256", process.env.API_KEY_HMAC_SECRET!)
    .update(rawKey)
    .digest("hex");
}
```

---

### SEC-007 🟡 Medium — OAuth Tokens Stored Unencrypted

**CVSS-like Score:** 5.5 (Medium)  
**File:** `prisma/schema.prisma`

**Description:**  
OAuth tokens are stored in plaintext:
```prisma
refresh_token String? @db.Text   // allows account takeover if DB breached
access_token  String? @db.Text
id_token      String? @db.Text
```

**Remediation:** Apply application-level encryption (e.g., `@prisma/extension-accelerate` or a custom encryption middleware) or ensure Cloud SQL column-level encryption.

---

## OWASP A03 — Injection

### SEC-008 🟢 Pass — No SQL Injection Found

All Prisma queries use parameterised inputs. The single raw query (`db.$queryRaw\`SELECT 1\``) has no user input. **No SQL injection vulnerabilities.**

### SEC-009 🟡 Medium — Unvalidated fileUrls — SSRF Risk

**CVSS-like Score:** 5.8 (Medium)  
**File:** `src/lib/validation.ts`

**Description:**  
`fileUrls` only validates URL format, not destination. Bots can submit GCP metadata URLs or internal network endpoints.

**Proof of Concept:**
```typescript
// validation.ts
fileUrls: z.array(z.string().url()).max(10).optional().default([]),
// Accepts: http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
```

**Remediation:**
```typescript
fileUrls: z.array(
  z.string().url().refine((url) => {
    try {
      const { hostname, protocol } = new URL(url);
      return protocol === "https:" && 
             !hostname.includes("metadata") && 
             !hostname.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/);
    } catch { return false; }
  }, "File URLs must be HTTPS public URLs")
).max(10).optional().default([]),
```

---

## OWASP A04 — Insecure Design

### SEC-010 🔴 Critical — Double-Payment Race Condition (QA Worker + Manual Approval)

**CVSS-like Score:** 9.3 (Critical)  
**Files:** `src/workers/qa-worker.ts`, `src/app/api/v1/jobs/[id]/submissions/[subId]/approve/route.ts`

**Description:**  
This is the most severe financial vulnerability. Two independent payment paths can both trigger for the same submission:

- **Path 1 (QA Worker):** Auto-approves and pays when `qaScore >= 0.85`
- **Path 2 (Manual):** Operator clicks Approve via API

The approve endpoint checks `submission.status !== "PENDING"` but does NOT check if the job is already `COMPLETED`. The QA worker checks `job.status !== "COMPLETED"` but these are separate non-atomic checks.

**Proof of Concept — Race Window:**
```typescript
// qa-worker.ts — fires asynchronously
if (score >= 0.85) {
  const jobData = await db.job.findUnique({ ... });
  // --- RACE WINDOW OPENS HERE ---
  if (jobData && jobData.status !== "COMPLETED") {
    await db.$transaction([
      db.job.update({ data: { status: "COMPLETED" } }),
      db.bot.update({ data: { totalEarned: { increment: botPayment } } }), // PAYMENT 1
    ]);
  }
}

// approve/route.ts — can execute concurrently
const submission = await db.submission.findUnique({ where: { id: subId } });
if (submission.status !== "PENDING") { // ONLY checks submission, not job
  return 409; // but if QA hasn't updated submission.status yet...
}
await db.$transaction([
  db.submission.update({ data: { status: "APPROVED" } }),
  db.job.update({ data: { status: "COMPLETED" } }),
  db.bot.update({ data: { totalEarned: { increment: botEarning } } }), // PAYMENT 2 ← DOUBLE PAY
]);
```

**Remediation:**
```typescript
// Option 1: Remove payment logic from qa-worker.ts entirely
// QA worker should only set qaScore/qaFeedback, never trigger payments

// Option 2: Use atomic compare-and-swap in approve endpoint
const result = await db.$transaction(async (tx) => {
  // Atomically check AND update job status
  const updated = await tx.job.updateMany({
    where: { id: jobId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    data: { status: "COMPLETED" },
  });
  if (updated.count === 0) {
    throw Object.assign(new Error("Already completed"), { code: "ALREADY_COMPLETED" });
  }
  // Safe to proceed with payment
  await tx.bot.update({ data: { totalEarned: { increment: botEarning } } });
  // ...
});
```

---

### SEC-011 🟠 High — Stripe Webhook Missing Idempotency (Double-Credit Risk)

**CVSS-like Score:** 8.0 (High)  
**File:** `src/app/api/webhooks/stripe/route.ts`

**Description:**  
Stripe guarantees at-least-once webhook delivery — the same event can be delivered multiple times. The handler does not check if a `payment_intent` was already processed. Each replay adds credits.

**Proof of Concept:**
```typescript
// webhooks/stripe/route.ts
case "checkout.session.completed": {
  const operatorId = session.metadata?.operatorId;
  const credits = Number(session.metadata?.credits ?? 0);

  // NO idempotency check for session.payment_intent
  await db.$transaction([
    db.operator.update({ data: { creditBalance: { increment: credits } } }), // replayed = double credits
    db.creditTransaction.create({ data: { stripePaymentId: session.payment_intent as string } }),
    // stripePaymentId has no @unique constraint in schema.prisma — duplicates allowed
  ]);
}
```

**Remediation:**
```typescript
// 1. Add @unique to CreditTransaction.stripePaymentId in schema.prisma
// 2. Check before processing:
const existing = await db.creditTransaction.findFirst({
  where: { stripePaymentId: session.payment_intent as string },
});
if (existing) {
  console.log(`Webhook already processed: ${session.payment_intent}`);
  return Response.json({ received: true });
}
```

---

### SEC-012 🟡 Medium — Submission Accepted on OPEN Status Jobs

**CVSS-like Score:** 5.5 (Medium)  
**File:** `src/app/api/v1/jobs/[id]/submissions/route.ts`

**Description:**  
Submissions are allowed when `job.status === "OPEN"`, which is before bid acceptance. While the `acceptedBid` check provides protection, allowing `OPEN` status is a design inconsistency that creates edge case attack vectors.

**Remediation:** Change to `job.status !== "IN_PROGRESS"`.

---

## OWASP A05 — Security Misconfiguration

### SEC-013 🟠 High — No HTTP Security Headers / Content Security Policy

**CVSS-like Score:** 6.8 (High)  
**File:** `next.config.ts`

**Description:**  
No security headers are configured:
- No `Content-Security-Policy` — XSS attacks can load arbitrary scripts
- No `X-Frame-Options` — clickjacking possible
- No `X-Content-Type-Options` — MIME sniffing attacks
- No `Strict-Transport-Security` — SSL stripping attacks
- No `Referrer-Policy` — URL leakage

**Remediation:**
```typescript
// next.config.ts
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "frame-src https://js.stripe.com",
      "connect-src 'self' https://api.stripe.com",
      "img-src 'self' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

---

### SEC-014 🟡 Medium — Rate Limiter Race Condition (INCR/EXPIRE Atomicity)

**CVSS-like Score:** 5.0 (Medium)  
**File:** `src/lib/rate-limit.ts`

**Description:**  
The rate limiter uses separate `INCR` then `EXPIRE`. If the connection drops between them, the key never expires, permanently blocking the identifier.

```typescript
const count = await redis.incr(key);
if (count === 1) {
  await redis.expire(key, windowSeconds); // separate call — crash window
}
```

**Remediation:**
```typescript
const pipeline = redis.pipeline();
pipeline.incr(key);
pipeline.expire(key, windowSeconds); // always set — idempotent
const results = await pipeline.exec();
const count = results![0][1] as number;
```

---

### SEC-015 🟡 Medium — Cloud Run Deploy Should Use --set-secrets

**CVSS-like Score:** 5.0 (Medium)  
**File:** `.github/workflows/gcp-deploy.yml`

**Description:**  
Secrets are managed in GCP Secret Manager (per Terraform), but the deploy command only sets `NODE_ENV` via `--set-env-vars`. If a developer ever adds secrets via `--set-env-vars` (a common mistake), they'd be visible in Cloud Run console and logs in plaintext.

**Remediation:**
```bash
gcloud run deploy thebotclub-production \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest"
```

---

### SEC-016 🟡 Medium — Missing DB CHECK Constraint for Non-Negative Credits

**CVSS-like Score:** 5.5 (Medium)  
**File:** `prisma/schema.prisma`

**Description:**  
The schema has this explicit TODO:
```prisma
// TODO: Add CHECK constraint (creditBalance >= 0) via a migration after
// Prisma adds native CHECK support, or via raw SQL
```

This constraint is NOT applied. A concurrent bug could drive `creditBalance` negative, enabling free job posting.

**Remediation — Apply immediately via raw migration:**
```sql
ALTER TABLE "Operator" 
ADD CONSTRAINT "Operator_creditBalance_non_negative" 
CHECK ("creditBalance" >= 0);
```

---

## OWASP A06 — Vulnerable Components

### SEC-017 🟡 Medium — next-auth v5-beta in Production Financial Platform

**CVSS-like Score:** 5.5 (Medium)

```json
"next-auth": "^5.0.0-beta.25"
```

Beta software for authentication in a financial platform. Beta software may have unpatched security issues that bypass responsible disclosure.

**Recommendation:** Monitor NextAuth security advisories. Pin to specific beta version. Upgrade to stable when released.

---

### SEC-018 🔵 Low — No Dependency Vulnerability Scanning in CI

**CVSS-like Score:** 3.0 (Low)

The CI pipeline has no `pnpm audit` step. Known CVEs go undetected.

**Remediation:**
```yaml
- name: Security audit
  run: pnpm audit --audit-level=high
```

---

## OWASP A07 — Identification & Authentication Failures

### SEC-019 🟡 Medium — 30-Day Sessions Without Revocation

**CVSS-like Score:** 5.5 (Medium)  
**File:** `src/lib/auth.ts`

```typescript
session: { maxAge: 30 * 24 * 60 * 60 }, // 30 days — too long for financial platform
```

No session revocation mechanism. Stolen session token valid for up to 30 days.

**Remediation:** Reduce to 7 days. Add user-facing session management (view and revoke active sessions).

---

### SEC-020 🔵 Low — No Admin/Staff Role System

No RBAC. All authenticated users have identical operator privileges. No ability to suspend accounts, investigate fraud, or override financial transactions. Must be addressed before production scale.

---

## OWASP A09 — Logging & Monitoring Failures

### SEC-021 🔵 Low — No Structured Audit Logging for Financial Operations

Financial state changes use only `console.log`. No structured audit trail records who triggered what financial operation, when, and with what result. The `Ledger` table provides partial history but lacks actor attribution for manual operations.

**Remediation:** Implement structured logging middleware logging `{ actor, action, resource, outcome, timestamp }` for all financial state changes.

---

## Dedicated: API Key Security

| Control | Status |
|---------|--------|
| Random key generation (32 bytes) | ✅ Implemented |
| SHA-256 hashing before storage | ✅ Implemented |
| Raw key never stored in DB | ✅ Implemented |
| Raw key returned once at registration | ✅ Correct |
| Key not logged anywhere | ✅ No logs found |
| HMAC salt on hash | ❌ Missing — SEC-006 |
| Key rotation mechanism | ❌ Not implemented |
| Key scope/permissions | ❌ No scope system |
| Key expiry | ❌ No expiry support |
| Rate limiting on key auth | ✅ 100 req/min per key+IP |
| Timing-safe comparison | ⚠️ DB lookup — not constant-time |

**Missing: Key Rotation**

No endpoint to rotate a compromised API key without deactivating the bot entirely.

```typescript
// Recommended addition: POST /api/v1/bots/[id]/rotate-key
// Requires session auth (owner only)
// Returns new rawApiKey, invalidates old hash
```

**Missing: Key Scopes**

All API keys grant full permissions (bid + submit). Consider read-only keys or operation-specific scopes for high-value integrations.

---

## Dedicated: Financial & Credit Security

| Control | Status |
|---------|--------|
| Credit deduction in atomic transaction | ✅ |
| Insufficient credit check before job creation | ✅ |
| Budget must be positive (Zod) | ✅ |
| Negative bid amounts blocked | ✅ `z.number().positive()` |
| DB-level non-negative balance constraint | ❌ TODO not applied — SEC-016 |
| Double-payment prevention (QA+manual) | ❌ CRITICAL — SEC-010 |
| Stripe webhook idempotency | ❌ HIGH — SEC-011 |
| Stripe payment_intent uniqueness in DB | ❌ No @unique on stripePaymentId |
| Payout authorization | ❌ HIGH — SEC-004 |
| Payout Stripe integration | ⚠️ TODO stub |

**Stripe Webhook Credits Metadata Trust**

The webhook trusts `session.metadata.credits` without re-validating against Stripe line items. Metadata can be set during session creation (server-side) so this is lower risk, but should be validated:

```typescript
// Re-validate credits from Stripe line items instead of metadata:
const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
const actualCredits = lineItems.data.reduce((sum, item) => {
  return sum + (item.quantity ?? 0);
}, 0);
```

**Payout Stripe Integration is a TODO Stub**

```typescript
if (stripeAccountId) {
  // TODO: Implement Stripe transfer via stripe.transfers.create()
}
```

When implemented, **must** include:
- Idempotency keys on `stripe.transfers.create()`
- Stripe Connect onboarding verification
- KYC/AML compliance for payout thresholds

---

## Compliance Checklist

### OWASP Top 10 2021

| Category | Status | Findings |
|----------|--------|----------|
| A01 Broken Access Control | ❌ FAIL | SEC-001, 002, 003, 004, 005 |
| A02 Cryptographic Failures | ⚠️ PARTIAL | SEC-006, 007 |
| A03 Injection | ✅ PASS | SEC-008 (none), SEC-009 partial |
| A04 Insecure Design | ❌ FAIL | SEC-010, 011, 012 |
| A05 Security Misconfiguration | ❌ FAIL | SEC-013, 014, 015, 016 |
| A06 Vulnerable Components | ⚠️ PARTIAL | SEC-017, 018 |
| A07 Auth & Identity Failures | ⚠️ PARTIAL | SEC-019, 020 |
| A08 Software/Data Integrity | ✅ PASS | Stripe signature verified |
| A09 Logging & Monitoring | ❌ FAIL | SEC-021 |
| A10 SSRF | ⚠️ PARTIAL | SEC-009 |

### PCI-DSS Basics (Stripe)

| Requirement | Status | Notes |
|-------------|--------|-------|
| No PAN/card data stored | ✅ | Stripe handles all card data |
| Webhook signature verification | ✅ | `constructEvent()` implemented |
| TLS for payment transmissions | ✅ | Cloud Run HTTPS enforced |
| Idempotent payment processing | ❌ | SEC-011 — webhook replay risk |
| Financial audit trail | ⚠️ | Ledger exists but incomplete |
| Least privilege for Stripe API | ✅ | Secret key via GCP Secret Manager |
| Separate test/live API keys | ✅ | `sk_test_` in example env |

### GDPR Basics

| Requirement | Status |
|-------------|--------|
| Account deletion / right to be forgotten | ❌ Not implemented |
| Data export / portability | ❌ Not implemented |
| Consent tracking | ❌ OAuth implicit only |
| Privacy policy | ❌ Not observed |
| Data minimisation | ⚠️ Avatar URL stored |

---

## Remediation Roadmap

### Immediate — Before Production Launch

| ID | Finding | Effort |
|----|---------|--------|
| SEC-010 | Fix double-payment race (QA + manual approval) | Medium |
| SEC-011 | Add Stripe webhook idempotency | Small |
| SEC-001 | Prevent self-dealing (bot bids on own job) | Small |
| SEC-016 | Apply DB CHECK constraint creditBalance >= 0 | Small |
| SEC-002 | Validate botId in rating against job work | Small |

### Short-Term — Within 2 Weeks

| ID | Finding | Effort |
|----|---------|--------|
| SEC-004 | Payout worker authorization check | Small |
| SEC-003 | Rate limit session endpoints | Small |
| SEC-013 | Add security headers + CSP | Small |
| SEC-006 | HMAC-SHA256 for API key hashing | Small |
| SEC-011 | Add @unique to stripePaymentId | Small |

### Medium-Term — Within 1 Month

| ID | Finding | Effort |
|----|---------|--------|
| SEC-009 | fileUrls domain allowlist | Small |
| SEC-014 | Fix rate limiter atomicity | Small |
| SEC-018 | Add pnpm audit to CI | Trivial |
| SEC-019 | Reduce session maxAge, add revocation | Medium |
| SEC-020 | Implement admin role system | Large |
| SEC-007 | Encrypt OAuth tokens at rest | Medium |

### Long-Term — Compliance & Hardening

- Implement structured audit logging
- GDPR: account deletion and data export
- API key rotation endpoint
- API key scope system
- Complete Stripe Connect payout with idempotency
- Penetration test by external firm before scale

---

## Appendix: Files Audited

```
src/lib/auth.ts                                        Reviewed
src/lib/api-auth.ts                                    Reviewed
src/lib/rate-limit.ts                                  Reviewed
src/lib/validation.ts                                  Reviewed
src/lib/stripe.ts                                      Reviewed
src/lib/redis.ts                                       Reviewed
src/lib/db.ts                                          Reviewed
src/lib/utils.ts                                       Reviewed
src/lib/api-handler.ts                                 Reviewed
src/app/api/health/route.ts                            Reviewed
src/app/api/v1/jobs/route.ts                           Reviewed
src/app/api/v1/jobs/[id]/route.ts                      Reviewed
src/app/api/v1/jobs/[id]/bids/route.ts                 Reviewed
src/app/api/v1/jobs/[id]/bids/[bidId]/accept/route.ts  Reviewed
src/app/api/v1/jobs/[id]/submissions/route.ts          Reviewed
src/app/api/v1/jobs/[id]/submissions/[subId]/approve   Reviewed
src/app/api/v1/jobs/[id]/submissions/[subId]/reject    Reviewed
src/app/api/v1/jobs/[id]/rate/route.ts                 Reviewed
src/app/api/v1/bots/route.ts                           Reviewed
src/app/api/webhooks/stripe/route.ts                   Reviewed
src/workers/payout-worker.ts                           Reviewed
src/workers/qa-worker.ts                               Reviewed
prisma/schema.prisma                                   Reviewed
Dockerfile                                             Reviewed
next.config.ts                                         Reviewed
package.json                                           Reviewed
terraform/modules/gcp/main.tf                          Reviewed
.github/workflows/ci.yml                               Reviewed
.github/workflows/gcp-deploy.yml                       Reviewed
```

---

*End of Security Audit Report v1.0 — The Bot Club*  
*Generated: 2026-03-02*
