# Review Fixes — Address ALL findings

## CRITICAL (Architecture)

### C1. API Key — hash with SHA256, use crypto.randomBytes(32)
- prisma/schema.prisma: remove @default(cuid()) from Bot.apiKey
- src/app/api/v1/bots/route.ts: generate with randomBytes, store hash
- src/lib/api-auth.ts: hash incoming key before lookup

### C2. Credit race condition — use $transaction with row lock
- src/app/api/v1/jobs/route.ts: move balance check inside transaction

### C3. Rate limiting — implement with Redis
- Create src/lib/rate-limit.ts
- Apply in api-auth.ts and all public API routes

### C4. Stripe webhook — remove non-null assertion, add guard
- src/app/api/webhooks/stripe/route.ts

### C5. CSRF — add allowedOrigins
- next.config.ts: add serverActions.allowedOrigins

## HIGH (Architecture)

### H1. Database indexes on all foreign keys
- prisma/schema.prisma: add @@index on Job, Bid, Submission, Ledger, CreditTransaction

### H2. Bot submission requires accepted bid only
- src/app/api/v1/jobs/[id]/submissions/route.ts: remove pendingBid fallback

### H3. Float → Decimal for money fields
- prisma/schema.prisma: change all money Float to Decimal @db.Decimal(12,2)

### H4. Workers entry point
- Create src/workers/index.ts
- Add "worker" script to package.json

### H5. API error handler wrapper
- Create src/lib/api-handler.ts with Prisma error handling
- Wrap all API routes

### H6. Payout worker — implement Stripe transfer or mark as manual
- src/workers/payout-worker.ts

### H7. Seed file — guard against production
- prisma/seed.ts: add NODE_ENV check

## MEDIUM (Architecture)

### M1. WebSocket — remove from API docs or add TODO note
### M2. Full-text search note in code
### M3. Add bid acceptance API endpoint: POST /api/v1/jobs/[id]/bids/[bidId]/accept
### M4. Database CHECK constraint for creditBalance >= 0
### M5. Pagination on dashboard queries
### M6. Add output: "standalone" to next.config.ts
### M7. Fix Cloud Run DATABASE_URL / Cloud SQL connector in terraform
### M8. Pass all secrets to Cloud Run in terraform
### M9. Add prisma migrate setup
### M10. Debounce search input
### M11. Fix min-instances conflict between terraform and deploy workflow

## LOW (Architecture)
### L1. Remove unused bcryptjs or use it
### L2. Add robots.txt and sitemap
### L3. Add loading/error states to all dashboard pages
### L4. Verify Badge variants
### L5. Fix BotWithStats type consistency
### L6. Add session expiry handling
### L7. Fix Next.js version reference
### L8. Add /api/health endpoint

## CRITICAL (UX)

### UX-C1. Add "Accept Bid" button on job detail page
- Extract bids into client component <BidList>
- Add accept bid API call

### UX-C2. Add "Approve/Reject Submission" actions
- Extract submissions into client component <SubmissionList>
- Add approve/reject buttons for job owners

### UX-C3. Add rating UI after job completion
- Create <RateBot> dialog component

### UX-C4. Mobile sidebar — add hamburger menu, collapsible sidebar
- src/app/(dashboard)/layout.tsx: hidden md:block sidebar + mobile nav

## HIGH (UX)

### UX-H1. Wallet buttons non-functional — add disabled state with tooltip
### UX-H2. Job detail page — extract interactive sections to client components
### UX-H3. Google login button contrast fix for dark mode
### UX-H4. Leaderboard grid responsive: grid-cols-1 sm:grid-cols-3
### UX-H5. Search debounce (same as M10)
### UX-H6. Badge component: div → span
### UX-H7. Star ratings aria-label
### UX-H8. Category buttons aria-pressed

## MEDIUM (UX)

### UX-M1. Settings/profile page
### UX-M2. 404 and error pages (branded)
### UX-M3. Consistent button patterns (use Button asChild)
### UX-M4. Dark mode toggle or document dark-only choice
### UX-M5. Job filters responsive widths
### UX-M6. Character count on forms
### UX-M7. Default deadline (7 days)
### UX-M8. Bot detail empty description state
### UX-M9. Wallet onboarding for new users
### UX-M10. Notification system placeholder
