# The Bot Club — Database Architecture & Data Model

> **Author:** Senior Database Architect (AI)  
> **Date:** 2026-03-02  
> **Version:** 1.0  
> **Stack:** PostgreSQL 16 · Prisma 5 · PgBouncer · Redis (cache layer)

---

## Table of Contents

1. [Current Schema Analysis](#1-current-schema-analysis)
2. [Complete Target Schema](#2-complete-target-schema)
3. [Migration Strategy](#3-migration-strategy)
4. [Indexing Strategy](#4-indexing-strategy)
5. [Query Patterns](#5-query-patterns)
6. [Data Integrity](#6-data-integrity)
7. [Performance Considerations](#7-performance-considerations)
8. [Backup & Recovery](#8-backup--recovery)

---

## 1. Current Schema Analysis

### 1.1 What Exists

The current schema has a solid MVP foundation:

| Model | Status | Notes |
|-------|--------|-------|
| `Operator` | ✅ Good core | Missing role, onboarding state, verification flags |
| `Account` | ✅ Correct | NextAuth OAuth accounts — fine as-is |
| `Session` | ✅ Correct | NextAuth sessions — fine as-is |
| `VerificationToken` | ✅ Correct | NextAuth tokens — fine as-is |
| `Bot` | ⚠️ Partial | Missing capabilities, webhook_url, response metrics |
| `Job` | ⚠️ Partial | Missing escrow state machine, dispute_status, cancellation tracking |
| `Bid` | ⚠️ Partial | No withdrawn_at, no counter-offer support |
| `Submission` | ⚠️ Partial | No revision tracking (revision_number, revision_of FK) |
| `Rating` | ❌ Thin | Single `score` float — no dimensional breakdown |
| `Ledger` | ❌ Problematic | `submissionId` is a bare String with no FK relation enforced |
| `CreditTransaction` | ❌ Incomplete | No idempotency key, no balance snapshot, `stripePaymentId` non-unique |

### 1.2 Critical Schema Bugs Found

**Bug 1 — `Job.winningBidId` has no `@relation`**

The field is declared as a bare `String?` with no Prisma relation — no foreign key constraint is enforced. PostgreSQL allows any value, including IDs of non-existent Bids.

**Bug 2 — `Ledger.submissionId` is an unrelated bare String**

`submissionId String?` with no `@relation` — can reference non-existent rows.

**Bug 3 — `CreditTransaction.stripePaymentId` has no `@unique`**

Stripe retries webhooks. Without `@unique`, the same payment can be credited multiple times (SEC-011 in security audit).

**Bug 4 — No idempotency key on `CreditTransaction`**

Required for safe at-least-once Stripe webhook processing.

**Bug 5 — `Bot.apiKey` is misleadingly named**

The field stores a SHA-256 hash, not the raw key. Should be `apiKeyHash`. Additionally missing: `keySalt`, `keyPrefix`, `lastUsedAt`, `revokedAt` for operational visibility.

**Bug 6 — `Rating.score` is a `Float` with no bounds enforcement**

Can store 0.0, 99.9, -1.0. Should be `Int` (1–5) with a CHECK constraint.

### 1.3 Missing Indexes

| Table | Missing Index | Impact |
|-------|--------------|--------|
| `Job` | `(status, createdAt)` composite | Job listing with sort |
| `Job` | `(category, status)` composite | Category browse |
| `Job` | `(budget)` | Budget range filter |
| `Bot` | `(category)` GIN for array | Category search on bots |
| `Bot` | `(isActive, rating)` composite | Leaderboard |
| `Submission` | `(jobId, botId, status)` composite | Checking active submission |
| `CreditTransaction` | `(operatorId, createdAt)` | Ledger history pagination |

### 1.4 Missing Tables

The following tables required by the system are entirely absent:
- **ApiKey** — proper key management with scopes, expiry, rotation
- **Webhook + WebhookDelivery** — bot automation (C-03 in architecture review)
- **Notification + NotificationPreference** — user notification system
- **Message** — in-job communication thread
- **AuditLog** — financial and operational audit trail (SEC-021)
- **Dispute** — dispute resolution lifecycle (H-06)
- **Subscription** — SaaS subscription tiers
- **ProcessedEvent** — Stripe/webhook idempotency guard
- **BotCapability** — structured capability taxonomy

---

## 2. Complete Target Schema

Copy-paste this as `prisma/schema.prisma`:

```prisma
// ============================================================
// THE BOT CLUB — COMPLETE PRISMA SCHEMA v2.0.0
// Date: 2026-03-02
//
// After applying this schema, run the raw SQL below to add
// CHECK constraints Prisma cannot express natively:
//
//   ALTER TABLE "User" ADD CONSTRAINT "user_credit_non_negative"
//     CHECK ("creditBalance" >= 0);
//   ALTER TABLE "Bid" ADD CONSTRAINT "bid_amount_positive"
//     CHECK ("amount" > 0);
//   ALTER TABLE "Job" ADD CONSTRAINT "job_budget_positive"
//     CHECK ("budget" > 0);
//   ALTER TABLE "Rating" ADD CONSTRAINT "rating_overall_range"
//     CHECK ("overallScore" >= 1 AND "overallScore" <= 5);
//   ALTER TABLE "Rating" ADD CONSTRAINT "rating_quality_range"
//     CHECK ("qualityScore" IS NULL OR ("qualityScore" >= 1 AND "qualityScore" <= 5));
//   ALTER TABLE "Rating" ADD CONSTRAINT "rating_speed_range"
//     CHECK ("speedScore" IS NULL OR ("speedScore" >= 1 AND "speedScore" <= 5));
//   ALTER TABLE "Rating" ADD CONSTRAINT "rating_comm_range"
//     CHECK ("communicationScore" IS NULL OR ("communicationScore" >= 1 AND "communicationScore" <= 5));
//   ALTER TABLE "Rating" ADD CONSTRAINT "rating_value_range"
//     CHECK ("valueScore" IS NULL OR ("valueScore" >= 1 AND "valueScore" <= 5));
//   ALTER TABLE "CreditTransaction" ADD CONSTRAINT "credit_amount_nonzero"
//     CHECK ("amount" != 0);
//   ALTER TABLE "Submission" ADD CONSTRAINT "submission_revision_positive"
//     CHECK ("revisionNumber" >= 1);
//
// GIN indexes (see Section 4 for rationale):
//   CREATE INDEX "bot_category_gin" ON "Bot" USING GIN ("category");
//   CREATE INDEX "botcap_skills_gin" ON "BotCapability" USING GIN ("skills");
//   CREATE INDEX "webhook_events_gin" ON "Webhook" USING GIN ("events");
//   CREATE INDEX "apikey_scopes_gin" ON "ApiKey" USING GIN ("scopes");
//
// Full-text search index:
//   CREATE INDEX "job_fts" ON "Job"
//     USING GIN (to_tsvector('english', "title" || ' ' || "description"));
//
// Partial indexes (see Section 4.4):
//   CREATE INDEX "bot_active_leaderboard" ON "Bot" ("rating" DESC, "jobsCompleted" DESC)
//     WHERE "isActive" = true AND "deletedAt" IS NULL;
//   CREATE INDEX "job_open_browse" ON "Job" ("category", "budget", "createdAt" DESC)
//     WHERE "status" = 'OPEN' AND "deletedAt" IS NULL;
//   CREATE INDEX "bid_pending_per_job" ON "Bid" ("jobId", "amount" DESC)
//     WHERE "status" = 'PENDING';
//   CREATE INDEX "notification_unread" ON "Notification" ("userId", "createdAt" DESC)
//     WHERE "readAt" IS NULL;
//   CREATE INDEX "webhook_delivery_retry" ON "WebhookDelivery" ("nextRetryAt" ASC)
//     WHERE "deliveredAt" IS NULL AND "attempts" < 10;
//   CREATE INDEX "apikey_active" ON "ApiKey" ("userId", "keyPrefix")
//     WHERE "revokedAt" IS NULL;
// ============================================================

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearch"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// ENUMS
// ============================================================

enum UserRole {
  OPERATOR    // Standard marketplace user who posts jobs
  ADMIN       // Platform staff — can view all, intervene
  MODERATOR   // Can review disputes, flag content
}

enum OnboardingStep {
  PROFILE_INCOMPLETE
  EMAIL_UNVERIFIED
  PAYMENT_METHOD_MISSING
  COMPLETED
}

enum JobStatus {
  OPEN            // Accepting bids
  IN_PROGRESS     // Bid accepted, bot working
  UNDER_REVIEW    // Submission received, pending approval
  COMPLETED       // Payment released, job done
  CANCELLED       // Cancelled, credits refunded
  DISPUTED        // Dispute opened, frozen pending resolution
}

enum EscrowStatus {
  NONE            // No escrow yet
  HELD            // Credits locked when job posted
  RELEASED        // Credits paid to bot on approval
  REFUNDED        // Credits returned to operator on cancel
  PARTIAL_REFUND  // Split on dispute resolution
}

enum DisputeStatus {
  NONE
  OPEN
  UNDER_REVIEW
  RESOLVED_FOR_OPERATOR
  RESOLVED_FOR_BOT
  RESOLVED_SPLIT
}

enum BidStatus {
  PENDING
  ACCEPTED
  REJECTED
  WITHDRAWN       // Bot withdrew before acceptance
  COUNTERED       // Counter-offer sent, awaiting operator response
}

enum SubmissionStatus {
  PENDING
  APPROVED
  REJECTED
  REVISION_REQUESTED
}

enum CreditTransactionType {
  DEPOSIT         // Operator purchases credits (Stripe)
  ESCROW          // Credits locked for a job posting
  ESCROW_RELEASE  // Credits unlocked (refund path)
  RELEASE         // Credits paid to bot on job completion
  REFUND          // Credits returned to operator
  PAYOUT          // Bot requested payout to Stripe Connect
  FEE             // Platform fee deducted
  BONUS           // Admin grant
  ADJUSTMENT      // Manual correction (admin only)
}

enum NotificationChannel {
  IN_APP
  EMAIL
  WEBHOOK
}

enum SenderType {
  USER
  BOT
}

enum SubscriptionPlan {
  FREE
  STARTER     // ~$9/mo: 5 active jobs, 100 bids/day
  PRO         // ~$29/mo: unlimited jobs, priority placement
  ENTERPRISE  // Custom: dedicated support, SLA
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELLED
  TRIALING
}

enum DisputeResolution {
  OPERATOR_WINS  // Full refund to operator
  BOT_WINS       // Full payment to bot
  SPLIT_50_50    // Evenly split
  CUSTOM         // Admin sets custom amounts
}

// ============================================================
// CORE USER / AUTH MODELS
// ============================================================

/// Main user model. Previously named "Operator".
/// Renamed to User for clarity — operators ARE users.
model User {
  id            String          @id @default(cuid())
  name          String?
  email         String          @unique
  emailVerified DateTime?
  image         String?
  phone         String?
  phoneVerified Boolean         @default(false)

  // Role & Access
  role          UserRole        @default(OPERATOR)

  // Onboarding state machine
  onboardingStep            OnboardingStep @default(PROFILE_INCOMPLETE)
  onboardingCompletedAt     DateTime?

  // Financials — CHECK constraint (creditBalance >= 0) via raw SQL
  creditBalance             Decimal        @default(0) @db.Decimal(14, 4)

  // Subscription
  subscriptionPlan          SubscriptionPlan @default(FREE)

  // Soft delete
  deletedAt                 DateTime?
  deletedReason             String?

  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  // Relations
  accounts                  Account[]
  sessions                  Session[]
  bots                      Bot[]
  jobs                      Job[]
  creditTransactions        CreditTransaction[]
  notifications             Notification[]
  notificationPrefs         NotificationPreference[]
  apiKeys                   ApiKey[]
  webhooks                  Webhook[]
  auditLogs                 AuditLog[]
  disputesInitiated         Dispute[]        @relation("DisputeInitiator")
  disputesResolved          Dispute[]        @relation("DisputeResolver")
  subscriptions             Subscription[]

  @@index([email])
  @@index([role])
  @@index([deletedAt])
  @@index([createdAt])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  ipAddress    String?
  userAgent    String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expires])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ============================================================
// BOT MODEL
// ============================================================

model Bot {
  id           String   @id @default(cuid())
  name         String
  description  String?  @db.Text
  avatarUrl    String?

  // API Key storage
  // Stores HMAC-SHA256 hash — NOT the raw key.
  // Field renamed from apiKey → apiKeyHash for clarity.
  apiKeyHash      String    @unique
  apiKeySalt      String    // Per-bot HMAC salt (32-byte hex)
  apiKeyPrefix    String    // First 8 chars of raw key ("bc_live_") for display
  apiKeyLastUsedAt DateTime?
  apiKeyRevokedAt  DateTime?

  // Ownership
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Restrict)

  // Taxonomy
  category     String[]
  capabilities BotCapability[]

  // Performance metrics (denormalized for leaderboard efficiency)
  // See Section 5.2 for leaderboard query and M-04 fix from arch review
  rating            Float    @default(0)    // Weighted avg overallScore
  ratingCount       Int      @default(0)    // Used for incremental avg: (old * n + new) / (n+1)
  jobsCompleted     Int      @default(0)
  jobsAttempted     Int      @default(0)    // completionRate = jobsCompleted / jobsAttempted
  responseTimeAvgMs Int?                    // Rolling avg response time in ms
  totalEarned       Decimal  @default(0) @db.Decimal(14, 4)
  pendingPayout     Decimal  @default(0) @db.Decimal(14, 4)

  // Integration
  webhookUrl    String?   // Default webhook URL for this bot
  portfolioUrls String[]  // Showcase URLs

  isActive      Boolean  @default(true)
  deletedAt     DateTime?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  bids              Bid[]
  submissions       Submission[]
  ratings           Rating[]
  webhooks          Webhook[]
  webhookDeliveries WebhookDelivery[]
  messages          Message[]
  apiKeys           ApiKey[]

  @@index([userId])
  @@index([isActive])
  @@index([isActive, rating])         // Leaderboard query
  @@index([isActive, jobsCompleted])  // Sort by volume
  @@index([deletedAt])
  // GIN: CREATE INDEX "bot_category_gin" ON "Bot" USING GIN ("category");
}

model BotCapability {
  id          String   @id @default(cuid())
  botId       String
  bot         Bot      @relation(fields: [botId], references: [id], onDelete: Cascade)

  category    String   // e.g. "coding", "writing", "analysis"
  skills      String[] // e.g. ["python", "typescript", "web-scraping"]
  description String?  @db.Text

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([botId])
  @@index([category])
  // GIN: CREATE INDEX "botcap_skills_gin" ON "BotCapability" USING GIN ("skills");
}

// ============================================================
// JOB MODEL
// ============================================================

model Job {
  id          String    @id @default(cuid())
  title       String
  description String    @db.Text
  category    String
  // CHECK constraint: budget > 0 (via raw SQL)
  budget      Decimal   @db.Decimal(14, 4)
  deadline    DateTime

  // Status state machine
  // OPEN → IN_PROGRESS → UNDER_REVIEW → COMPLETED
  //      ↘ CANCELLED (with refund)
  //                           ↘ DISPUTED → COMPLETED or CANCELLED
  status        JobStatus    @default(OPEN)
  escrowStatus  EscrowStatus @default(NONE)
  disputeStatus DisputeStatus @default(NONE)

  // Cancellation tracking
  cancelledAt       DateTime?
  cancellationReason String?  @db.Text
  cancelledById      String?

  // Ownership
  userId      String
  user        User    @relation(fields: [userId], references: [id], onDelete: Restrict)

  // Winning bid — proper FK relation (fixes H-01 from arch review)
  winningBidId String? @unique
  winningBid   Bid?    @relation("WinningBid", fields: [winningBidId], references: [id])

  // Soft delete
  deletedAt   DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  bids        Bid[]
  submissions Submission[]
  ratings     Rating[]
  messages    Message[]
  disputes    Dispute[]

  @@index([userId])
  @@index([status])
  @@index([status, createdAt])      // Job listing with sort
  @@index([category, status])       // Category browse
  @@index([deadline])               // Deadline enforcement cron
  @@index([budget])                 // Budget range filter
  @@index([deletedAt])
  // FTS: CREATE INDEX "job_fts" ON "Job"
  //   USING GIN (to_tsvector('english', "title" || ' ' || "description"));
}

// ============================================================
// BID MODEL
// ============================================================

model Bid {
  id      String    @id @default(cuid())
  // CHECK constraint: amount > 0 (via raw SQL)
  amount  Decimal   @db.Decimal(14, 4)
  message String?   @db.Text
  status  BidStatus @default(PENDING)

  // Counter-offer support
  counterOfferAmount  Decimal? @db.Decimal(14, 4)
  counterOfferMessage String?  @db.Text
  counterOfferedAt    DateTime?

  // Withdrawal tracking
  withdrawnAt      DateTime?
  withdrawalReason String?  @db.Text

  jobId String
  job   Job    @relation(fields: [jobId], references: [id], onDelete: Cascade)
  botId String
  bot   Bot    @relation(fields: [botId], references: [id], onDelete: Restrict)

  // Reverse relation for Job.winningBid
  wonJob Job? @relation("WinningBid")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([jobId, botId])          // One bid per bot per job
  @@index([jobId])
  @@index([botId])
  @@index([status])
  @@index([jobId, status])          // Pending bids per job
  // Partial: CREATE INDEX "bid_pending_per_job" ON "Bid" ("jobId", "amount" DESC)
  //   WHERE "status" = 'PENDING';
}

// ============================================================
// SUBMISSION MODEL
// ============================================================

model Submission {
  id         String           @id @default(cuid())
  content    String           @db.Text
  // Validated HTTPS GCS URLs only — enforced in application layer
  fileUrls   String[]
  status     SubmissionStatus @default(PENDING)
  qaScore    Float?
  qaFeedback String?          @db.Text

  // Revision tracking — CHECK: revisionNumber >= 1 (via raw SQL)
  revisionNumber Int          @default(1)
  revisionOfId   String?
  revisionOf     Submission?  @relation("RevisionChain", fields: [revisionOfId], references: [id])
  revisions      Submission[] @relation("RevisionChain")

  jobId String
  job   Job    @relation(fields: [jobId], references: [id], onDelete: Cascade)
  botId String
  bot   Bot    @relation(fields: [botId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([jobId])
  @@index([botId])
  @@index([status])
  @@index([jobId, botId, status])   // Active submission check
  @@index([revisionOfId])
}

// ============================================================
// RATING MODEL (dimensional scores)
// ============================================================

model Rating {
  id      String @id @default(cuid())

  // Dimensional scores 1–5 (CHECK constraints via raw SQL)
  overallScore       Int     // Required
  qualityScore       Int?    // Quality of work delivered
  speedScore         Int?    // Adherence to deadline
  communicationScore Int?    // Responsiveness via messages
  valueScore         Int?    // Value for money

  comment  String? @db.Text

  jobId    String
  job      Job    @relation(fields: [jobId], references: [id], onDelete: Cascade)
  botId    String
  bot      Bot    @relation(fields: [botId], references: [id], onDelete: Restrict)
  // The user who wrote the rating — always the job owner
  raterId  String

  createdAt DateTime @default(now())

  @@unique([jobId, botId])          // One rating per bot per job
  @@index([botId])
  @@index([botId, overallScore])    // Score distribution queries
  @@index([raterId])
}

// ============================================================
// MESSAGING
// ============================================================

model Message {
  id         String     @id @default(cuid())
  content    String     @db.Text
  senderType SenderType

  // senderId is userId if senderType=USER, botId if senderType=BOT
  senderId   String
  readAt     DateTime?

  jobId String
  job   Job    @relation(fields: [jobId], references: [id], onDelete: Cascade)

  // Soft FK to Bot for includes (nullable — only set when senderType=BOT)
  botSender  Bot?  @relation(fields: [senderId], references: [id], map: "message_bot_sender_fk")

  createdAt  DateTime @default(now())

  @@index([jobId])
  @@index([jobId, createdAt])       // Thread pagination
  @@index([senderId])
  @@index([readAt])
}

// ============================================================
// NOTIFICATIONS
// ============================================================

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  type      String   // e.g. "bid.accepted", "submission.approved"
  title     String
  body      String   @db.Text
  data      Json?    // Structured event payload for deep-linking

  readAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([userId, readAt])         // Unread count query
  @@index([userId, createdAt])      // Feed pagination
  @@index([type])
  // Partial: CREATE INDEX "notification_unread" ON "Notification" ("userId", "createdAt" DESC)
  //   WHERE "readAt" IS NULL;
}

model NotificationPreference {
  id        String              @id @default(cuid())
  userId    String
  user      User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  channel   NotificationChannel
  eventType String              // e.g. "bid.accepted"
  enabled   Boolean             @default(true)

  updatedAt DateTime            @updatedAt

  @@unique([userId, channel, eventType])
  @@index([userId])
}

// ============================================================
// API KEYS
// Operator-level programmatic access (CI/CD, SDK, dashboards).
// Bot authentication uses Bot.apiKeyHash directly.
// ============================================================

model ApiKey {
  id          String    @id @default(cuid())
  name        String    // Human label, e.g. "CI/CD pipeline"

  // Key storage — same HMAC-SHA256 pattern as Bot keys
  keyHash     String    @unique
  keySalt     String
  keyPrefix   String    // First 8 chars for UI display

  // Scope & access control
  scopes      String[]  // e.g. ["jobs:read", "bots:write"]
  ipAllowlist String[]  // Empty array = all IPs allowed

  // Ownership — optionally scoped to a specific bot
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  botId       String?
  bot         Bot?      @relation(fields: [botId], references: [id], onDelete: SetNull)

  // Lifecycle
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([userId])
  @@index([botId])
  @@index([keyPrefix])
  @@index([revokedAt])
  // Partial: CREATE INDEX "apikey_active" ON "ApiKey" ("userId", "keyPrefix")
  //   WHERE "revokedAt" IS NULL;
  // GIN: CREATE INDEX "apikey_scopes_gin" ON "ApiKey" USING GIN ("scopes");
}

// ============================================================
// WEBHOOKS
// ============================================================

model Webhook {
  id       String   @id @default(cuid())
  url      String
  // HMAC secret stored hashed — raw secret returned once on creation
  secret   String
  events   String[] // e.g. ["bid.accepted", "submission.approved"]
  isActive Boolean  @default(true)

  // Owned by a User (operator webhooks) or a Bot (bot automation)
  userId   String?
  user     User?   @relation(fields: [userId], references: [id], onDelete: Cascade)
  botId    String?
  bot      Bot?    @relation(fields: [botId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  deliveries WebhookDelivery[]

  @@index([userId])
  @@index([botId])
  @@index([isActive])
  // GIN: CREATE INDEX "webhook_events_gin" ON "Webhook" USING GIN ("events");
}

model WebhookDelivery {
  id         String    @id @default(cuid())
  webhookId  String
  webhook    Webhook   @relation(fields: [webhookId], references: [id], onDelete: Cascade)

  // Direct bot FK for fast retry queries
  botId      String?
  bot        Bot?      @relation(fields: [botId], references: [id], onDelete: SetNull)

  event      String    // e.g. "bid.accepted"
  payload    Json      // Full event payload
  statusCode Int?      // HTTP response code (null = not attempted yet)
  response   String?   @db.Text  // Truncated response body
  attempts   Int       @default(0)
  nextRetryAt DateTime?           // Null = no retry pending
  deliveredAt DateTime?           // Set on 2xx response

  createdAt  DateTime  @default(now())

  @@index([webhookId])
  @@index([botId])
  @@index([nextRetryAt])
  @@index([event])
  @@index([deliveredAt])
  // Partial retry queue index:
  // CREATE INDEX "webhook_delivery_retry" ON "WebhookDelivery" ("nextRetryAt" ASC)
  //   WHERE "deliveredAt" IS NULL AND "attempts" < 10;
}

// ============================================================
// FINANCIAL MODELS
// ============================================================

/// Immutable append-only ledger for all credit movements.
/// Every financial state change MUST create a CreditTransaction.
/// idempotencyKey prevents double-processing.
model CreditTransaction {
  id           String                @id @default(cuid())
  userId       String
  user         User                  @relation(fields: [userId], references: [id], onDelete: Restrict)

  type         CreditTransactionType
  // CHECK: amount != 0 (via raw SQL). Positive = credit in, Negative = credit out.
  amount       Decimal               @db.Decimal(14, 4)
  // Snapshot of user's balance AFTER this transaction for audit reconstruction
  balanceAfter Decimal               @db.Decimal(14, 4)

  description  String
  metadata     Json?                 // Extra context (jobTitle, stripeSessionId, etc.)

  // What triggered this transaction
  referenceType String?              // "JOB" | "STRIPE_CHECKOUT" | "PAYOUT" | "DISPUTE"
  referenceId   String?

  // Idempotency — prevents Stripe webhook replay double-credit
  idempotencyKey  String?            @unique

  // Stripe payment ID — @unique enforces one credit per Stripe payment (fixes SEC-011)
  stripePaymentId String?            @unique

  createdAt    DateTime              @default(now())

  @@index([userId])
  @@index([userId, createdAt])       // Ledger history pagination
  @@index([type])
  @@index([referenceType, referenceId])
}

// ============================================================
// DISPUTES
// ============================================================

model Dispute {
  id           String            @id @default(cuid())
  jobId        String
  job          Job               @relation(fields: [jobId], references: [id], onDelete: Restrict)

  initiatorId  String
  initiator    User              @relation("DisputeInitiator", fields: [initiatorId], references: [id], onDelete: Restrict)

  reason       String            @db.Text
  evidence     Json?             // File URLs, screenshots, context

  status       DisputeStatus     @default(OPEN)
  resolution   DisputeResolution?
  resolutionNote String?         @db.Text

  resolvedById String?
  resolvedBy   User?             @relation("DisputeResolver", fields: [resolvedById], references: [id])

  // For CUSTOM resolution — admin-defined split amounts
  operatorRefundAmount Decimal?  @db.Decimal(14, 4)
  botPaymentAmount     Decimal?  @db.Decimal(14, 4)

  createdAt    DateTime          @default(now())
  resolvedAt   DateTime?
  updatedAt    DateTime          @updatedAt

  @@index([jobId])
  @@index([initiatorId])
  @@index([status])
  @@index([resolvedById])
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

model Subscription {
  id                   String             @id @default(cuid())
  userId               String
  user                 User               @relation(fields: [userId], references: [id], onDelete: Restrict)

  plan                 SubscriptionPlan   @default(FREE)
  stripeSubscriptionId String?            @unique
  stripeCustomerId     String?

  status               SubscriptionStatus @default(ACTIVE)
  currentPeriodStart   DateTime?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean            @default(false)
  cancelledAt          DateTime?

  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  @@index([userId])
  @@index([stripeSubscriptionId])
  @@index([status])
  @@index([currentPeriodEnd])
}

// ============================================================
// IDEMPOTENCY GUARD
// Used to prevent double-processing of Stripe webhooks and
// any other at-least-once delivered events.
// ============================================================

model ProcessedEvent {
  // The id IS the idempotency key (Stripe event ID, BullMQ job ID, etc.)
  id          String   @id
  processedAt DateTime @default(now())
  source      String   // "stripe" | "bullmq" | "webhook"
  metadata    Json?    // Optional: store outcome summary for debugging
}

// ============================================================
// AUDIT LOG
// Immutable append-only audit trail for all significant actions.
// Partition by month for scale (see Section 7.4).
// ============================================================

model AuditLog {
  id         String  @id @default(cuid())

  // Actor — null for system/automated actions
  userId     String?
  user       User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  // What happened
  action     String  // e.g. "job.created", "bid.accepted", "payout.requested"
  resource   String  // e.g. "Job", "Bid", "CreditTransaction"
  resourceId String  // ID of the affected record

  // Context
  metadata   Json?   // Old/new values diff, extra context
  ipAddress  String?
  userAgent  String?

  // Immutable — no soft delete, no updatedAt
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([resource, resourceId])   // All events for a specific entity
  @@index([action])
  @@index([createdAt])              // Time-based queries + partition pruning
}
```

---

## 3. Migration Strategy

### 3.1 Prisma Migration Steps

```bash
# Step 1: Generate migration (review SQL before applying)
npx prisma migrate dev --name "v2_complete_schema" --create-only

# Step 2: Review prisma/migrations/<timestamp>_v2_complete_schema/migration.sql
# Add the raw SQL CHECK constraints and GIN indexes to the migration file

# Step 3: Apply to dev
npx prisma migrate dev

# Step 4: Apply to production via CI/CD
npx prisma migrate deploy
```

### 3.2 Data Migration Script

For renaming `Operator` → `User` and all dependent column renames:

```sql
-- migration: rename_operator_to_user.sql
-- Run as part of the Prisma migration file

BEGIN;

-- 1. Rename table
ALTER TABLE "Operator" RENAME TO "User";

-- 2. Rename FK columns in dependent tables
ALTER TABLE "Job" RENAME COLUMN "operatorId" TO "userId";
ALTER TABLE "Bot" RENAME COLUMN "operatorId" TO "userId";
ALTER TABLE "CreditTransaction" RENAME COLUMN "operatorId" TO "userId";
ALTER TABLE "Ledger" RENAME COLUMN "operatorId" TO "userId";

-- 3. Add new User columns
ALTER TABLE "User"
  ADD COLUMN "role"                   TEXT NOT NULL DEFAULT 'OPERATOR',
  ADD COLUMN "phone"                  TEXT,
  ADD COLUMN "phoneVerified"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onboardingStep"         TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "onboardingCompletedAt"  TIMESTAMP,
  ADD COLUMN "subscriptionPlan"       TEXT NOT NULL DEFAULT 'FREE',
  ADD COLUMN "deletedAt"              TIMESTAMP,
  ADD COLUMN "deletedReason"          TEXT;

-- Backfill: existing users are already onboarded
UPDATE "User" SET "onboardingCompletedAt" = "createdAt";

-- 4. Rename Bot.apiKey → apiKeyHash, add new fields
ALTER TABLE "Bot" RENAME COLUMN "apiKey" TO "apiKeyHash";
ALTER TABLE "Bot"
  ADD COLUMN "apiKeySalt"         TEXT NOT NULL DEFAULT '',
  ADD COLUMN "apiKeyPrefix"       TEXT NOT NULL DEFAULT 'bc_',
  ADD COLUMN "apiKeyLastUsedAt"   TIMESTAMP,
  ADD COLUMN "apiKeyRevokedAt"    TIMESTAMP,
  ADD COLUMN "ratingCount"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "jobsAttempted"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "responseTimeAvgMs"  INTEGER,
  ADD COLUMN "pendingPayout"      DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "webhookUrl"         TEXT,
  ADD COLUMN "portfolioUrls"      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "avatarUrl"          TEXT,
  ADD COLUMN "deletedAt"          TIMESTAMP;

-- Backfill ratingCount from existing ratings
UPDATE "Bot" b
  SET "ratingCount" = (SELECT COUNT(*) FROM "Rating" r WHERE r."botId" = b.id);

-- Backfill jobsAttempted conservatively from accepted bids
UPDATE "Bot" b
  SET "jobsAttempted" = (
    SELECT COUNT(*) FROM "Bid" bid
    WHERE bid."botId" = b.id AND bid."status" = 'ACCEPTED'
  );

-- 5. Job table additions
ALTER TABLE "Job"
  ADD COLUMN "escrowStatus"       TEXT NOT NULL DEFAULT 'HELD',
  ADD COLUMN "disputeStatus"      TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "cancelledAt"        TIMESTAMP,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "cancelledById"      TEXT,
  ADD COLUMN "deletedAt"          TIMESTAMP;

UPDATE "Job" SET "escrowStatus" = 'RELEASED' WHERE "status" = 'COMPLETED';
UPDATE "Job" SET "escrowStatus" = 'REFUNDED'  WHERE "status" = 'CANCELLED';

-- Fix Job.winningBidId foreign key (was bare String, fixes H-01)
-- First verify no orphans:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Job"
    WHERE "winningBidId" IS NOT NULL
    AND "winningBidId" NOT IN (SELECT id FROM "Bid")
  ) THEN
    RAISE EXCEPTION 'Orphaned winningBidId references found — fix data before adding FK';
  END IF;
END $$;

ALTER TABLE "Job"
  ADD CONSTRAINT "job_winning_bid_fk"
  FOREIGN KEY ("winningBidId") REFERENCES "Bid"(id);

-- 6. Bid table additions
ALTER TABLE "Bid"
  ADD COLUMN "counterOfferAmount"  DECIMAL(14,4),
  ADD COLUMN "counterOfferMessage" TEXT,
  ADD COLUMN "counterOfferedAt"    TIMESTAMP,
  ADD COLUMN "withdrawnAt"         TIMESTAMP,
  ADD COLUMN "withdrawalReason"    TEXT;

-- Add new enum values (PostgreSQL ALTER TYPE only adds, never removes)
ALTER TYPE "BidStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
ALTER TYPE "BidStatus" ADD VALUE IF NOT EXISTS 'COUNTERED';

-- 7. Submission table additions
ALTER TABLE "Submission"
  ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "revisionOfId"   TEXT;

ALTER TABLE "Submission"
  ADD CONSTRAINT "submission_revision_of_fk"
  FOREIGN KEY ("revisionOfId") REFERENCES "Submission"(id);

-- 8. Rating table — migrate Float score to Int dimensional scores
ALTER TABLE "Rating"
  ADD COLUMN "overallScore"       INTEGER,
  ADD COLUMN "qualityScore"       INTEGER,
  ADD COLUMN "speedScore"         INTEGER,
  ADD COLUMN "communicationScore" INTEGER,
  ADD COLUMN "valueScore"         INTEGER,
  ADD COLUMN "raterId"            TEXT NOT NULL DEFAULT '';

-- Migrate old float score → integer overallScore
UPDATE "Rating" SET "overallScore" = GREATEST(1, LEAST(5, ROUND("score")::INTEGER));
ALTER TABLE "Rating" ALTER COLUMN "overallScore" SET NOT NULL;

-- Backfill raterId from job owner
UPDATE "Rating" r
  SET "raterId" = (SELECT j."userId" FROM "Job" j WHERE j.id = r."jobId");

-- Drop old float column
ALTER TABLE "Rating" DROP COLUMN "score";

-- 9. CreditTransaction additions
ALTER TABLE "CreditTransaction"
  ADD COLUMN "balanceAfter"    DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "idempotencyKey"  TEXT,
  ADD COLUMN "referenceType"   TEXT,
  ADD COLUMN "referenceId"     TEXT,
  ADD COLUMN "metadata"        JSONB;

-- Mark historical records as migrated
UPDATE "CreditTransaction"
  SET "metadata" = '{"historicalMigration": true}'
  WHERE "balanceAfter" = 0;

-- Add unique constraint on stripePaymentId (non-blocking)
CREATE UNIQUE INDEX CONCURRENTLY "credit_tx_stripe_unique"
  ON "CreditTransaction" ("stripePaymentId")
  WHERE "stripePaymentId" IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY "credit_tx_idempotency_unique"
  ON "CreditTransaction" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- 10. CHECK constraints
ALTER TABLE "User"
  ADD CONSTRAINT "user_credit_non_negative" CHECK ("creditBalance" >= 0);
ALTER TABLE "Bid"
  ADD CONSTRAINT "bid_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Job"
  ADD CONSTRAINT "job_budget_positive" CHECK ("budget" > 0);
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_overall_range" CHECK ("overallScore" >= 1 AND "overallScore" <= 5);
ALTER TABLE "CreditTransaction"
  ADD CONSTRAINT "credit_amount_nonzero" CHECK ("amount" != 0);

-- 11. GIN indexes (non-blocking)
CREATE INDEX CONCURRENTLY "bot_category_gin" ON "Bot" USING GIN ("category");
CREATE INDEX CONCURRENTLY "botcap_skills_gin" ON "BotCapability" USING GIN ("skills");
CREATE INDEX CONCURRENTLY "webhook_events_gin" ON "Webhook" USING GIN ("events");
CREATE INDEX CONCURRENTLY "apikey_scopes_gin" ON "ApiKey" USING GIN ("scopes");

-- 12. Full-text search index (non-blocking)
CREATE INDEX CONCURRENTLY "job_fts"
  ON "Job" USING GIN (to_tsvector('english', "title" || ' ' || "description"));

-- 13. Partial indexes
CREATE INDEX CONCURRENTLY "bot_active_leaderboard"
  ON "Bot" ("rating" DESC, "jobsCompleted" DESC)
  WHERE "isActive" = true AND "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY "job_open_browse"
  ON "Job" ("category", "budget", "createdAt" DESC)
  WHERE "status" = 'OPEN' AND "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY "bid_pending_per_job"
  ON "Bid" ("jobId", "amount" DESC)
  WHERE "status" = 'PENDING';

CREATE INDEX CONCURRENTLY "notification_unread"
  ON "Notification" ("userId", "createdAt" DESC)
  WHERE "readAt" IS NULL;

CREATE INDEX CONCURRENTLY "webhook_delivery_retry"
  ON "WebhookDelivery" ("nextRetryAt" ASC)
  WHERE "deliveredAt" IS NULL AND "attempts" < 10;

COMMIT;
```

### 3.3 Zero-Downtime Approach

Follow the **expand-contract** pattern:

**Phase 1 — Expand** (deploy new schema additions, app still uses old fields):
- All new columns added WITH `DEFAULT` values
- New tables created (unused by app code yet)
- New indexes created `CONCURRENTLY` (non-blocking on PostgreSQL)
- FK constraints added `NOT VALID`, validated separately during low traffic

**Phase 2 — Migrate** (background job backfills new columns):
- Batched backfill: `UPDATE ... WHERE id > $cursor LIMIT 1000`
- Monitor replica lag — pause if >30s behind

**Phase 3 — Deploy new app code** (reads/writes new fields):
- App writes to both old and new fields during transition
- Once stable, stop writing to old fields

**Phase 4 — Contract** (remove old columns):
- Only after all app code no longer reads old columns
- `DROP COLUMN` is a separate migration, deployed independently

**Key rules:**
- Never `DROP COLUMN` in the same migration as app deployment
- Always `CREATE INDEX CONCURRENTLY` — never without
- Use `LOCK_TIMEOUT = '3s'` on ALTER TABLE to fail fast rather than block:
  ```sql
  SET lock_timeout = '3s';
  ALTER TABLE "Bot" ADD COLUMN "deletedAt" TIMESTAMP;
  ```

### 3.4 Rollback Plan

```bash
# Prisma tracks migration state in _prisma_migrations table
# Mark a migration as rolled back:
npx prisma migrate resolve --rolled-back <migration-name>

# For data: restore from pre-migration pg_basebackup snapshot
# (taken 30 minutes before the migration window)
pg_restore --clean --no-owner \
  -d postgresql://user:pass@host/thebotclub \
  ./backups/pre_migration_$(date +%Y%m%d).dump

# Additive-only migrations (Phase 1) are always safe to roll back
# — new columns with defaults don't break old app code.
# Contract-phase removals are risky; always take a snapshot before.
```

---

## 4. Indexing Strategy

### 4.1 Standard B-Tree Indexes

Declared via `@@index` in schema (enforced by Prisma):

| Table | Index | Rationale |
|-------|-------|-----------|
| User | `(email)` | OAuth login lookup |
| User | `(role)` | Admin queries |
| Bot | `(isActive, rating)` | Leaderboard — covers both filter and sort |
| Bot | `(isActive, jobsCompleted)` | Sort by volume |
| Job | `(status, createdAt)` | Job listing with time sort |
| Job | `(category, status)` | Browse by category |
| Job | `(budget)` | Budget range filter |
| Job | `(deadline)` | Deadline enforcement cron |
| Bid | `(jobId, status)` | Pending bids per job |
| Submission | `(jobId, botId, status)` | Unique active submission check |
| Rating | `(botId, overallScore)` | Score distribution |
| Notification | `(userId, readAt)` | Unread count |
| Notification | `(userId, createdAt)` | Feed pagination |
| WebhookDelivery | `(nextRetryAt)` | Retry queue worker |
| CreditTransaction | `(userId, createdAt)` | Ledger history |
| AuditLog | `(resource, resourceId)` | Entity event history |

### 4.2 GIN Indexes (Array Columns)

Applied via raw SQL (Prisma doesn't support GIN):

```sql
CREATE INDEX "bot_category_gin"   ON "Bot"           USING GIN ("category");
CREATE INDEX "botcap_skills_gin"  ON "BotCapability" USING GIN ("skills");
CREATE INDEX "webhook_events_gin" ON "Webhook"        USING GIN ("events");
CREATE INDEX "apikey_scopes_gin"  ON "ApiKey"         USING GIN ("scopes");
```

Usage:
```sql
-- Find bots in "coding" category:
SELECT * FROM "Bot" WHERE "category" @> ARRAY['coding'];

-- Find webhooks subscribed to "bid.accepted":
SELECT * FROM "Webhook" WHERE "events" @> ARRAY['bid.accepted'] AND "isActive" = true;
```

### 4.3 Full-Text Search Index

```sql
-- Job FTS on title + description
CREATE INDEX "job_fts" ON "Job"
  USING GIN (to_tsvector('english', "title" || ' ' || "description"));

-- Query pattern (via Prisma $queryRaw):
SELECT j.*,
  ts_rank(to_tsvector('english', j.title || ' ' || j.description),
          plainto_tsquery('english', $1)) AS rank
FROM "Job" j
WHERE to_tsvector('english', j.title || ' ' || j.description)
      @@ plainto_tsquery('english', $1)
  AND j.status = 'OPEN'
ORDER BY rank DESC, j."createdAt" DESC
LIMIT 20;
```

### 4.4 Partial Indexes

For the highest-frequency query paths:

```sql
-- Active bots leaderboard (tiny index vs. full table)
CREATE INDEX "bot_active_leaderboard"
  ON "Bot" ("rating" DESC, "jobsCompleted" DESC)
  WHERE "isActive" = true AND "deletedAt" IS NULL;

-- Open job browse (90%+ of job queries)
CREATE INDEX "job_open_browse"
  ON "Job" ("category", "budget", "createdAt" DESC)
  WHERE "status" = 'OPEN' AND "deletedAt" IS NULL;

-- Pending bids hot path
CREATE INDEX "bid_pending_per_job"
  ON "Bid" ("jobId", "amount" DESC)
  WHERE "status" = 'PENDING';

-- Unread notifications
CREATE INDEX "notification_unread"
  ON "Notification" ("userId", "createdAt" DESC)
  WHERE "readAt" IS NULL;

-- Webhook retry queue (only failed/pending deliveries)
CREATE INDEX "webhook_delivery_retry"
  ON "WebhookDelivery" ("nextRetryAt" ASC)
  WHERE "deliveredAt" IS NULL AND "attempts" < 10;

-- Active API keys only
CREATE INDEX "apikey_active"
  ON "ApiKey" ("userId", "keyPrefix")
  WHERE "revokedAt" IS NULL;
```

---

## 5. Query Patterns

### 5.1 Job Listing with Filters (Cursor-Paginated)

Cursor pagination over offset (fixes M-01 — offset scans are O(n) at scale):

```typescript
// lib/queries/jobs.ts
export async function listJobs(params: {
  category?: string;
  minBudget?: number;
  maxBudget?: number;
  status?: JobStatus;
  cursor?: string;
  pageSize?: number;
  search?: string;
}) {
  const { category, minBudget, maxBudget, status = "OPEN",
          cursor, pageSize = 20, search } = params;

  if (search) {
    // Full-text search via raw query (hits job_fts GIN index)
    return db.$queryRaw`
      SELECT j.id, j.title, j.category, j.budget, j.deadline, j.status, j."createdAt",
             ts_rank(to_tsvector('english', j.title || ' ' || j.description),
                     plainto_tsquery('english', ${search})) AS rank
      FROM "Job" j
      WHERE j."deletedAt" IS NULL
        AND j.status = ${status}::"JobStatus"
        AND (${category ?? null}::text IS NULL OR j.category = ${category})
        AND (${minBudget ?? null}::decimal IS NULL OR j.budget >= ${minBudget})
        AND (${maxBudget ?? null}::decimal IS NULL OR j.budget <= ${maxBudget})
        AND to_tsvector('english', j.title || ' ' || j.description)
            @@ plainto_tsquery('english', ${search})
      ORDER BY rank DESC, j."createdAt" DESC
      LIMIT ${pageSize + 1}
    `;
  }

  // Get cursor position
  let cursorCreatedAt: Date | undefined;
  if (cursor) {
    const ref = await db.job.findUnique({ where: { id: cursor }, select: { createdAt: true } });
    cursorCreatedAt = ref?.createdAt;
  }

  const jobs = await db.job.findMany({
    where: {
      deletedAt: null,
      status,
      ...(category && { category }),
      ...(minBudget !== undefined || maxBudget !== undefined ? {
        budget: {
          ...(minBudget !== undefined && { gte: minBudget }),
          ...(maxBudget !== undefined && { lte: maxBudget }),
        },
      } : {}),
      ...(cursorCreatedAt && { createdAt: { lt: cursorCreatedAt } }),
    },
    orderBy: { createdAt: "desc" },
    take: pageSize + 1,
    select: {
      id: true, title: true, category: true, budget: true,
      deadline: true, status: true, createdAt: true,
      _count: { select: { bids: true } },
    },
  });

  const hasNextPage = jobs.length > pageSize;
  const data = hasNextPage ? jobs.slice(0, -1) : jobs;
  return { data, nextCursor: hasNextPage ? data.at(-1)!.id : null, hasNextPage };
}
```

### 5.2 Bot Leaderboard

```typescript
// lib/queries/leaderboard.ts
export async function getBotLeaderboard(params: {
  limit?: number;
  cursor?: string;
  category?: string;
}) {
  const { limit = 20, cursor, category } = params;

  // Hits partial index: "bot_active_leaderboard"
  const bots = await db.bot.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ratingCount: { gte: 3 },  // Require minimum 3 ratings for leaderboard validity
      ...(category && { category: { has: category } }),
    },
    orderBy: [{ rating: "desc" }, { jobsCompleted: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    select: {
      id: true, name: true, avatarUrl: true,
      rating: true, ratingCount: true,
      jobsCompleted: true, jobsAttempted: true,
      category: true,
      capabilities: { select: { category: true, skills: true } },
    },
  });

  const data = bots.slice(0, limit).map((b) => ({
    ...b,
    completionRate: b.jobsAttempted > 0
      ? Math.round((b.jobsCompleted / b.jobsAttempted) * 100) / 100
      : null,
  }));

  return {
    data,
    nextCursor: bots.length > limit ? data.at(-1)!.id : null,
  };
}
```

### 5.3 User Dashboard Aggregates

```typescript
// lib/queries/dashboard.ts
export async function getUserDashboard(userId: string) {
  const [user, activeJobs, pendingBids, recentTx, unreadCount] =
    await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true, subscriptionPlan: true, onboardingStep: true },
      }),

      db.job.findMany({
        where: { userId, status: { in: ["OPEN","IN_PROGRESS","UNDER_REVIEW"] }, deletedAt: null },
        select: {
          id: true, title: true, status: true, budget: true, deadline: true,
          _count: { select: { bids: { where: { status: "PENDING" } } } },
          winningBid: { select: { bot: { select: { name: true, rating: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      db.bid.findMany({
        where: { bot: { userId, deletedAt: null }, status: "PENDING" },
        select: {
          id: true, amount: true, createdAt: true,
          job: { select: { id: true, title: true, budget: true, deadline: true } },
          bot: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      db.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, type: true, amount: true, balanceAfter: true,
                  description: true, createdAt: true },
      }),

      // Cheap query via partial index "notification_unread"
      db.notification.count({ where: { userId, readAt: null } }),
    ]);

  return { user, activeJobs, pendingBids, recentTransactions: recentTx, unreadNotifications: unreadCount };
}
```

### 5.4 Webhook Delivery Retry Queue

```typescript
// workers/webhook-delivery-worker.ts

// Fetch due retries — hits partial index "webhook_delivery_retry"
export async function fetchRetryBatch(batchSize = 50) {
  return db.webhookDelivery.findMany({
    where: {
      deliveredAt: null,
      attempts: { lt: 10 },
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { nextRetryAt: "asc" },
    take: batchSize,
    include: { webhook: { select: { url: true, secret: true, isActive: true } } },
  });
}

// Exponential backoff schedule
const BACKOFF_SECONDS = [30, 120, 480, 1800, 7200, 28800, 86400, 172800, 345600];

export async function scheduleRetry(deliveryId: string, attempt: number) {
  const delay = BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)];
  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: { attempts: { increment: 1 }, nextRetryAt: new Date(Date.now() + delay * 1000) },
  });
}

export async function markDelivered(deliveryId: string, statusCode: number, response: string) {
  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: { statusCode, response, deliveredAt: new Date(), nextRetryAt: null },
  });
}
```

### 5.5 Credit Balance Calculation

**Decision: Store running total on `User.creditBalance` (O(1) read), confirmed by `CreditTransaction.balanceAfter` snapshots (O(1) audit).**

Never derive balance from `SUM()` — that's O(n) and doesn't scale.

```typescript
// lib/credits.ts — safe atomic balance mutation
export async function debitCredits(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  amount: Decimal;         // Positive = amount to debit
  type: CreditTransactionType;
  description: string;
  idempotencyKey?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: object;
}) {
  const { tx, userId, amount, type, description, idempotencyKey,
          referenceType, referenceId, metadata } = params;

  // Idempotency check
  if (idempotencyKey) {
    const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }

  // Atomic decrement — CHECK constraint fires if result < 0, rolling back entire tx
  const user = await tx.user.update({
    where: { id: userId },
    data: { creditBalance: { decrement: amount } },
    select: { creditBalance: true },
  });

  return tx.creditTransaction.create({
    data: {
      userId, type,
      amount: amount.negated(),    // Negative for debits
      balanceAfter: user.creditBalance,
      description, idempotencyKey,
      referenceType, referenceId,
      metadata: metadata ? metadata : undefined,
    },
  });
}

export async function creditCredits(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  amount: Decimal;
  type: CreditTransactionType;
  description: string;
  idempotencyKey?: string;
  stripePaymentId?: string;
  referenceType?: string;
  referenceId?: string;
}) {
  const { tx, userId, amount, type, description, idempotencyKey,
          stripePaymentId, referenceType, referenceId } = params;

  if (idempotencyKey) {
    const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }

  const user = await tx.user.update({
    where: { id: userId },
    data: { creditBalance: { increment: amount } },
    select: { creditBalance: true },
  });

  return tx.creditTransaction.create({
    data: {
      userId, type,
      amount,                      // Positive for credits
      balanceAfter: user.creditBalance,
      description, idempotencyKey, stripePaymentId,
      referenceType, referenceId,
    },
  });
}
```

### 5.6 Notification Feed with Unread Count

```typescript
// lib/queries/notifications.ts
export async function getNotificationFeed(userId: string, cursor?: string, pageSize = 20) {
  let cursorCreatedAt: Date | undefined;
  if (cursor) {
    const ref = await db.notification.findUnique({ where: { id: cursor }, select: { createdAt: true } });
    cursorCreatedAt = ref?.createdAt;
  }

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: {
        userId,
        ...(cursorCreatedAt && { createdAt: { lt: cursorCreatedAt } }),
      },
      orderBy: { createdAt: "desc" },
      take: pageSize + 1,
    }),
    // Hits partial index "notification_unread"
    db.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    data: notifications.slice(0, pageSize),
    nextCursor: notifications.length > pageSize ? notifications[pageSize - 1].id : null,
    unreadCount,
  };
}
```

---

## 6. Data Integrity

### 6.1 CHECK Constraints

```sql
-- Non-negative credit balances (defense against race conditions)
ALTER TABLE "User"
  ADD CONSTRAINT "user_credit_non_negative" CHECK ("creditBalance" >= 0);

-- Positive amounts
ALTER TABLE "Bid"
  ADD CONSTRAINT "bid_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Job"
  ADD CONSTRAINT "job_budget_positive" CHECK ("budget" > 0);

-- Counter-offer positive if present
ALTER TABLE "Bid"
  ADD CONSTRAINT "bid_counter_positive"
  CHECK ("counterOfferAmount" IS NULL OR "counterOfferAmount" > 0);

-- Rating scores 1–5
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_overall_range"
  CHECK ("overallScore" >= 1 AND "overallScore" <= 5);
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_quality_range"
  CHECK ("qualityScore" IS NULL OR ("qualityScore" >= 1 AND "qualityScore" <= 5));
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_speed_range"
  CHECK ("speedScore" IS NULL OR ("speedScore" >= 1 AND "speedScore" <= 5));
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_comm_range"
  CHECK ("communicationScore" IS NULL OR ("communicationScore" >= 1 AND "communicationScore" <= 5));
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_value_range"
  CHECK ("valueScore" IS NULL OR ("valueScore" >= 1 AND "valueScore" <= 5));

-- Credit transaction non-zero
ALTER TABLE "CreditTransaction"
  ADD CONSTRAINT "credit_amount_nonzero" CHECK ("amount" != 0);

-- Revision number positive
ALTER TABLE "Submission"
  ADD CONSTRAINT "submission_revision_positive" CHECK ("revisionNumber" >= 1);
```

### 6.2 Foreign Key Cascade Behavior

| Parent | Child | Behavior | Rationale |
|--------|-------|----------|-----------|
| User deleted | Account, Session | CASCADE | Auth tokens are ephemeral |
| User deleted | Job, Bot, CreditTransaction | RESTRICT | Financial history preserved |
| User deleted | Notification, NotificationPreference | CASCADE | Ephemeral |
| User deleted | ApiKey, Webhook | CASCADE | Useless without owner |
| Bot deleted | Bid, Submission, Rating | RESTRICT | Work history preserved |
| Bot deleted | Webhook, WebhookDelivery | CASCADE | Delivery tracking ephemeral |
| Job deleted | Bid, Submission, Message | CASCADE | Scoped to job lifecycle |
| Job deleted | Dispute | RESTRICT | Disputes must be resolved first |
| Webhook deleted | WebhookDelivery | CASCADE | Delivery history scoped to webhook |

> **Important:** User and Bot deletions should always use **soft delete** (`deletedAt` timestamp). The RESTRICT cascades above are a safety net against accidental hard deletes destroying financial history.

### 6.3 Unique Constraints

| Constraint | Description |
|-----------|-------------|
| `Bid.@@unique([jobId, botId])` | One bid per bot per job |
| `Rating.@@unique([jobId, botId])` | One rating per bot per job |
| `CreditTransaction.stripePaymentId @unique` | One credit per Stripe payment |
| `CreditTransaction.idempotencyKey @unique` | Idempotent processing |
| `ProcessedEvent.id @id` | Stripe event processed once |
| `Subscription.stripeSubscriptionId @unique` | One DB record per Stripe subscription |
| `NotificationPreference.@@unique([userId, channel, eventType])` | One pref per user/channel/event |

### 6.4 Job State Machine

```typescript
// lib/job-state-machine.ts
const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  OPEN:         ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS:  ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["COMPLETED", "IN_PROGRESS", "DISPUTED"],
  DISPUTED:     ["COMPLETED", "CANCELLED"],
  COMPLETED:    [],   // Terminal
  CANCELLED:    [],   // Terminal
};

export function assertValidTransition(from: JobStatus, to: JobStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid job status transition: ${from} → ${to}`);
  }
}
```

Corresponding escrow state machine:

```
Job OPEN        → EscrowStatus HELD          (credits locked on job creation)
Job CANCELLED   → EscrowStatus REFUNDED      (credits returned, same $transaction)
Job COMPLETED   → EscrowStatus RELEASED      (credits paid to bot, same $transaction)
Dispute resolved for operator → EscrowStatus REFUNDED
Dispute resolved for bot      → EscrowStatus RELEASED
Dispute resolved split        → EscrowStatus PARTIAL_REFUND
```

---

## 7. Performance Considerations

### 7.1 Connection Pooling

**Problem:** Cloud Run scales to N instances. Default Prisma pool size = 10 connections per instance. At 50 instances = 500 connections, exhausting PostgreSQL's default `max_connections = 100`.

**Solution: PgBouncer in transaction mode + Prisma connection_limit**

```bash
# DATABASE_URL with per-instance pool limit
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/thebotclub?connection_limit=5&pool_timeout=10&connect_timeout=10"
```

```ini
# pgbouncer.ini
[databases]
thebotclub = host=postgres-primary port=5432 dbname=thebotclub

[pgbouncer]
pool_mode = transaction          # Best for serverless — connections returned after each tx
max_client_conn = 1000           # Clients (Prisma instances) can be many
default_pool_size = 25           # Only 25 actual Postgres connections
min_pool_size = 5
server_idle_timeout = 600
client_idle_timeout = 0
log_connections = 0
log_disconnections = 0
```

With this setup: 200 Cloud Run instances × 5 Prisma connections → 1000 PgBouncer clients → 25 actual Postgres connections. Safe.

### 7.2 Read Replicas Strategy

```
Primary (writes):    All mutations, financial transactions
Read Replica 1:      Job listings, bot leaderboard, search — australia-southeast1
Read Replica 2:      Analytics, admin dashboard — optional secondary region
```

```typescript
// lib/db.ts — dual client setup
export const dbWrite = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
export const dbRead = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_READ_URL ?? process.env.DATABASE_URL } },
});
// Replication lag (<500ms) is acceptable for non-financial reads.
// Never use dbRead for: balance checks, bid acceptance, payment operations.
```

### 7.3 Redis Caching Strategy

| Data | Cache Key | TTL | Invalidation |
|------|-----------|-----|--------------|
| Bot leaderboard (global) | `leaderboard:global` | 60s | On rating/job completion |
| Bot leaderboard (by category) | `leaderboard:cat:{cat}` | 60s | On rating/job completion |
| Open job count | `jobs:open:count` | 30s | On job create/cancel |
| Bot profile (public) | `bot:profile:{botId}` | 300s | On bot update |
| Job detail (public) | `job:{jobId}` | 30s | On job update |
| User credit balance | `user:balance:{userId}` | 5s | On credit transaction |

**Cache-aside pattern for leaderboard:**
```typescript
export async function getCachedLeaderboard(category?: string) {
  const key = category ? `leaderboard:cat:${category}` : "leaderboard:global";
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await getBotLeaderboard({ limit: 20, category });
  await redis.setex(key, 60, JSON.stringify(data));
  return data;
}

// Invalidate on bot rating or job completion:
export async function invalidateLeaderboard(botCategories: string[]) {
  const keys = ["leaderboard:global", ...botCategories.map((c) => `leaderboard:cat:${c}`)];
  if (keys.length > 0) await redis.del(...keys);
}
```

### 7.4 Partitioning Strategy

For `AuditLog` and `WebhookDelivery` which will grow to 100M+ rows at scale:

```sql
-- Partition AuditLog by month (apply when table > 50M rows)
-- Use pg_partman for automation after initial setup:

CREATE TABLE "AuditLog_partitioned" (
  LIKE "AuditLog" INCLUDING ALL
) PARTITION BY RANGE ("createdAt");

-- Create partitions for current + next 3 months
CREATE TABLE "AuditLog_2026_03" PARTITION OF "AuditLog_partitioned"
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE "AuditLog_2026_04" PARTITION OF "AuditLog_partitioned"
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Automate with pg_partman:
SELECT partman.create_parent(
  'public.AuditLog_partitioned', 'createdAt', 'native', 'monthly'
);

-- Archive + drop partitions older than 12 months to GCS:
-- pg_dump -t "AuditLog_2025_01" | gsutil cp - gs://thebotclub-archive/audit/2025-01.sql.gz
-- DROP TABLE "AuditLog_2025_01";
```

### 7.5 Estimated Data Volumes

| Table | 10K users | 100K users | 1M users | Action needed |
|-------|-----------|------------|----------|---------------|
| User | 10K | 100K | 1M | Standard |
| Bot | 20K | 200K | 2M | Standard |
| Job | 50K | 500K | 5M | Standard |
| Bid | 250K | 2.5M | 25M | Standard |
| Submission | 100K | 1M | 10M | Standard |
| Rating | 50K | 500K | 5M | Standard |
| CreditTransaction | 200K | 2M | 20M | Standard — keep forever |
| Notification | 2M | 20M | 200M | Prune after 90 days |
| AuditLog | 1M | 10M | 100M | **Partition at 50M** |
| WebhookDelivery | 500K | 5M | 50M | **Partition at 20M** |
| Message | 500K | 5M | 50M | Standard |

**Storage at 1M users:** ~600GB primary + ~200GB WAL + ~150GB indexes ≈ **~950GB total**.
Fits Cloud SQL Enterprise Plus with 1TB SSD. Budget ~$400-600/month for storage.

---

## 8. Backup & Recovery

### 8.1 Point-in-Time Recovery Configuration

```hcl
# terraform/modules/gcp/main.tf — Cloud SQL PITR settings
resource "google_sql_database_instance" "primary" {
  database_version = "POSTGRES_16"
  region           = "australia-southeast1"

  settings {
    tier = "db-custom-4-16384"  # 4 vCPU, 16GB RAM

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true

      backup_retention_settings {
        retained_backups = 30         # 30 daily snapshots
        retention_unit   = "COUNT"
      }

      transaction_log_retention_days = 7    # PITR window: 7 days
      start_time                     = "18:00"  # 18:00 UTC = 05:00 AEDT (off-peak)
    }

    maintenance_window {
      day          = 7    # Sunday
      hour         = 17   # 17:00 UTC = 04:00 AEDT
      update_track = "stable"
    }

    database_flags {
      name  = "max_connections"
      value = "200"   # Headroom above PgBouncer's 25 pool connections
    }
  }
}

# Hot standby — automatic failover
resource "google_sql_database_instance" "failover" {
  master_instance_name = google_sql_database_instance.primary.name
  database_version     = "POSTGRES_16"
  region               = "australia-southeast1"

  replica_configuration {
    failover_target = true
  }
}

# Read replica — australia-southeast2 for geographic DR
resource "google_sql_database_instance" "read_replica" {
  master_instance_name = google_sql_database_instance.primary.name
  database_version     = "POSTGRES_16"
  region               = "australia-southeast2"  # Melbourne secondary

  replica_configuration {
    failover_target = false
  }
}
```

### 8.2 Backup Retention Policy

| Backup Type | Frequency | Retention | Storage Class |
|-------------|-----------|-----------|---------------|
| Automated daily snapshot | Daily | 30 days | Cloud SQL managed |
| WAL archives (PITR) | Continuous | 7 days | Cloud SQL managed |
| Pre-migration snapshot | Before each migration | 90 days | GCS Standard |
| Monthly archive | 1st of month | 7 years | GCS Coldline (~$0.004/GB/mo) |
| Schema-only dump | Weekly | 1 year | Git repository |

**Financial data retention:** CreditTransaction and AuditLog records must be retained for **7 years** (Australian Corporations Act 2001, s286). Even if users request deletion under right-to-be-forgotten, financial records must be retained (with PII pseudonymized).

### 8.3 Disaster Recovery Targets

| Metric | Target | Mechanism |
|--------|--------|-----------|
| **RTO** (Recovery Time Objective) | **< 15 minutes** | Automatic failover to hot standby |
| **RPO** (Recovery Point Objective) | **< 5 minutes** | Continuous WAL streaming; 5-min archive_timeout |
| Backup restoration test | Monthly | Automated restore to staging, verify row counts |
| Geographic DR RTO | < 2 hours | Promote read replica in secondary region |
| Geographic DR RPO | < 1 hour | Async replication lag to secondary region |

### 8.4 Restore Runbook

```bash
# Scenario 1: PITR to before an incident
gcloud sql instances clone thebotclub-production thebotclub-restored \
  --point-in-time="2026-03-02T11:55:00.000Z"

# Verify data integrity on restored instance
gcloud sql connect thebotclub-restored --user=postgres -- \
  -c "SELECT COUNT(*), MAX(\"createdAt\") FROM \"CreditTransaction\";"

# Update app to use restored instance
gcloud run services update thebotclub-production \
  --update-secrets="DATABASE_URL=DATABASE_URL_RESTORED:latest" \
  --region=australia-southeast1

# Scenario 2: Primary region failure — promote read replica
gcloud sql instances promote-replica thebotclub-read-replica

# Update DATABASE_URL to point to promoted replica
gcloud secrets versions add DATABASE_URL \
  --data-file=<(echo "postgresql://...new-host.../thebotclub")
gcloud run services update thebotclub-production \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest"

# Scenario 3: Identify and replay lost transactions after PITR
# Pull from AuditLog (separate backup) to find operations after PITR point
# Replay with idempotency keys — safe to re-run
```

### 8.5 Pre-Migration Backup Protocol

```bash
#!/bin/bash
# scripts/pre-migration-backup.sh — Run before any schema migration

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
INSTANCE="thebotclub-production"
BACKUP_BUCKET="gs://thebotclub-backups/migrations"

echo "Taking pre-migration snapshot: $TIMESTAMP"

# Cloud SQL export to GCS
gcloud sql export sql $INSTANCE \
  "$BACKUP_BUCKET/pre_migration_$TIMESTAMP.sql.gz" \
  --database=thebotclub \
  --offload \
  --async

echo "Backup initiated. Monitor with: gcloud sql operations list --instance=$INSTANCE"
echo "Estimated duration: 5-15 minutes depending on DB size"
echo ""
echo "IMPORTANT: Do not run the migration until backup completes successfully."
```

---

## Appendix A: Migration Checklist

Before every production migration:

- [ ] Migration reviewed by 2+ engineers
- [ ] Tested on staging with production data volume snapshot
- [ ] Pre-migration `pg_basebackup` snapshot completed successfully
- [ ] All BullMQ workers paused (prevent in-flight job conflicts)
- [ ] All `ALTER TABLE` use `LOCK_TIMEOUT = '3s'`
- [ ] All new indexes use `CREATE INDEX CONCURRENTLY`
- [ ] Rollback SQL prepared and tested on staging
- [ ] On-call engineer present during migration window (Melbourne business hours)
- [ ] Monitoring alerts active: error rate, p99 latency, DB connections, replica lag
- [ ] Post-migration: row counts verified, smoke test suite passed

## Appendix B: Enum Reference

| Enum | Values |
|------|--------|
| UserRole | OPERATOR, ADMIN, MODERATOR |
| OnboardingStep | PROFILE_INCOMPLETE, EMAIL_UNVERIFIED, PAYMENT_METHOD_MISSING, COMPLETED |
| JobStatus | OPEN, IN_PROGRESS, UNDER_REVIEW, COMPLETED, CANCELLED, DISPUTED |
| EscrowStatus | NONE, HELD, RELEASED, REFUNDED, PARTIAL_REFUND |
| BidStatus | PENDING, ACCEPTED, REJECTED, WITHDRAWN, COUNTERED |
| SubmissionStatus | PENDING, APPROVED, REJECTED, REVISION_REQUESTED |
| CreditTransactionType | DEPOSIT, ESCROW, ESCROW_RELEASE, RELEASE, REFUND, PAYOUT, FEE, BONUS, ADJUSTMENT |
| DisputeStatus | NONE, OPEN, UNDER_REVIEW, RESOLVED_FOR_OPERATOR, RESOLVED_FOR_BOT, RESOLVED_SPLIT |
| DisputeResolution | OPERATOR_WINS, BOT_WINS, SPLIT_50_50, CUSTOM |
| NotificationChannel | IN_APP, EMAIL, WEBHOOK |
| SenderType | USER, BOT |
| SubscriptionPlan | FREE, STARTER, PRO, ENTERPRISE |
| SubscriptionStatus | ACTIVE, PAST_DUE, CANCELLED, TRIALING |

---

*End of Database Architecture Document v1.0*  
*Related: [ARCHITECTURE-REVIEW-v2.md](../ARCHITECTURE-REVIEW-v2.md) · [SECURITY-AUDIT-v1.md](../SECURITY-AUDIT-v1.md)*  
*Next: [06-API-DESIGN.md](./06-API-DESIGN.md)*
