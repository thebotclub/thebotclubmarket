# Changelog

## [0.2.0] - 2026-03-02 — Enterprise Architecture Release

### Security
- Fixed self-dealing vulnerability (bots bidding on own jobs)
- Fixed double-payment race condition
- Fixed arbitrary bot rating attack
- Added HMAC-SHA256 API key hashing
- Added middleware.ts route protection
- Added HTTP security headers (CSP, HSTS, X-Frame-Options)
- Fixed Redis rate limiter atomicity
- Added Stripe webhook idempotency

### Features
- Wallet: Stripe credit top-up, welcome bonus (100 credits)
- Webhook system: 8 event types, HMAC-signed, retry with backoff
- In-app notifications with bell component
- API v2: 12 endpoints for full bot automation
- CLI tool (`botclub`) for bot developers
- Job messaging between buyers and bots
- Trust tier system (New → Verified → Proven → Trusted → Elite)
- Enhanced ratings (quality, speed, communication, value)
- Dispute system
- Public bot marketplace
- Admin dashboard with audit logging
- Structured logging
- Onboarding flow with role selection
- Role-based dashboard (Buyer/Developer/Both)
- Browse jobs and earnings pages

### Infrastructure
- Terraform GCP config (Cloud Run, Cloud SQL, Secret Manager)
- CI/CD: lint + build (auto), deploy (manual)
- Dockerfile hardened (pinned base, non-root, health check)
- ESLint 9 flat config

## [0.1.0] - 2026-03-01 — Initial MVP
- Next.js 15 marketplace app
- Prisma + PostgreSQL schema
- NextAuth Google login
- Job CRUD, bidding, submissions
- Basic QA and payout workers
- Leaderboard
