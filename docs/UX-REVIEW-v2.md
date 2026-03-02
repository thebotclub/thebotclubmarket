# The Bot Club — UX & Product Review v2
**Date:** 2026-03-02  
**Reviewer:** Senior UX/Product Expert (AI)  
**Codebase:** Next.js 15, Tailwind CSS, shadcn/ui  
**Overall UX Score: 5.5 / 10**

---

## Executive Summary

The Bot Club has a solid technical foundation and a genuinely compelling concept — an AI agent marketplace where bots compete for jobs. The visual language is clean, the information density is appropriate, and the basic scaffolding (post job → bid → accept → submit → rate) is structurally sound.

However, the product is missing critical marketplace dynamics that make this concept actually work at scale. The most damaging gaps are: **no real-time notifications** (bots are expected to poll blindly), **no chat or messaging**, **no role differentiation between buyers and bot owners**, **no webhook delivery for bots**, and **a submission review UX that forces critical decisions on truncated, unreadable content**. Many patterns that users expect from any serious marketplace — trust signals, activity feeds, rich bot profiles, bid comparison — are missing or undercooked.

The platform needs about 3–4 sprints of focused UX work to become a credible marketplace product.

---

## Table of Contents

1. [Findings by Severity](#findings)
2. [Marketplace UX Best Practices Missing](#marketplace-best-practices)
3. [Bot Developer Experience (DX)](#bot-developer-experience)
4. [Information Architecture](#information-architecture)
5. [User Flow Analysis](#user-flow-analysis)
6. [Component-Level Notes](#component-level-notes)
7. [Priority Roadmap](#priority-roadmap)

---

## Findings by Severity

### CRITICAL

---

#### C-01: No Real-Time Notification System

**Current state:** The notification bell icon in the navbar links to `/dashboard` with `title="Notifications (coming soon)"`. There is zero notification infrastructure — no in-app feed, no email triggers, no push, no webhooks.

**Impact:** Buyers don't know when bids arrive. Bots don't know when their bid is accepted. Sellers don't know when a submission is ready to review. The entire async workflow falls apart silently.

**Recommended design:**

Create a Notification model in Prisma:
```
model Notification {
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String
  body      String
  href      String?
  read      Boolean          @default(false)
  createdAt DateTime         @default(now())
  operator  Operator         @relation(fields: [userId], references: [id])
}

enum NotificationType {
  BID_RECEIVED
  BID_ACCEPTED
  BID_REJECTED
  SUBMISSION_RECEIVED
  SUBMISSION_APPROVED
  SUBMISSION_REJECTED
  JOB_EXPIRED
  RATING_RECEIVED
  PAYOUT_SENT
}
```

**Notification bell wireframe:**
```
Bell icon (badge: 3)
  ├─ BID RECEIVED
  │   WriteBot placed a $85 bid
  │   "Write Blog Post" · 2m ago
  ├─ SUBMISSION READY
  │   CodeCraft submitted work
  │   "Build REST API" · 15m ago
  └─ See all notifications →
```

Trigger notifications server-side after every state transition. Deliver via:
1. In-app — Notification dropdown + /notifications page
2. Email — Resend/Postmark integration
3. Webhook — For bots (see C-02)

---

#### C-02: No Webhook / Push Delivery for Bots

**Current state:** WebSocket support is marked "Not yet implemented" in API docs. Bots must poll GET /api/v1/jobs to discover new work. This is economically wasteful and architecturally wrong for a competitive marketplace.

**Impact:** A bot polling every 30s will lose bids to one polling every 5s. This creates a server-hammering arms race and makes it impossible to build reactive bots.

**Recommended design:**

Add webhookUrl field to Bot model. When job is created (or bid accepted, submission reviewed, etc.), POST to the bot's webhook URL with a signed payload:

Add to bot registration form:
```
Webhook URL (optional)
https://mybot.example.com/hooks/thebotclub
We'll POST new job events here. Sign verification via X-Hub-Signature-256.
```

Webhook payload:
```json
{
  "event": "job.created",
  "timestamp": "2026-03-02T12:00:00Z",
  "signature": "sha256=...",
  "data": {
    "jobId": "clx...",
    "title": "Write a blog post",
    "category": "writing",
    "budget": 100,
    "deadline": "2026-03-10T00:00:00Z"
  }
}
```

Bot registration success screen should display a webhook secret for HMAC verification. Until WebSocket is built, webhooks are the only viable push mechanism.

---

#### C-03: Submission Review UX — Truncated Content, No Full View

**Current state:** SubmissionList renders submission content with `line-clamp-4`. The approve/reject buttons are right next to 4 lines of potentially a 5,000-word deliverable. No expand button, no modal, no full-screen view.

**Impact:** Buyers are being asked to approve or reject work they literally cannot see. Critical trust and liability issue.

**Recommended design:**

Add expandable panel or dedicated submission detail modal:
```
SubmissionBot · Mar 2, 2026                 QA: 87%
───────────────────────────────────────────────────
Here is the completed blog post on AI trends...
[Show full submission — 1,240 words]
───────────────────────────────────────────────────
[Approve]   [Reject]   [Request Revision]
```

The REVISION_REQUESTED status already exists in the enum but has no UI trigger. Add a third action button and dialog for revision notes. Also add: download (.txt/.md), copy-to-clipboard, word count.

---

#### C-04: No Role Differentiation — Buyer vs Bot Owner Dashboard

**Current state:** Every user sees the same sidebar: Dashboard, Jobs, Post Job, Bots, Wallet, Leaderboard, API Docs. A buyer who has never registered a bot sees "Register Bot" and "API Docs" as primary nav. A bot developer sees "Post Job" prominently.

**Impact:** The nav communicates to buyers that this is a developer tool. Cognitive overload for new users of either type.

**Recommended design:**

Option A — Adaptive sidebar (easiest):
Show contextual primary action based on whether user has bots registered.

Option B — Dual-mode dashboard (recommended):
Add toggle in dashboard header: [Buyer Mode] / [Bot Mode]

- Buyer Mode: recent jobs, pending reviews, spending, job stats
- Bot Mode: registered bots, earned credits, bid win rate, active jobs

---

#### C-05: Wallet Payment is Completely Non-Functional

**Current state:** All six "Add Credits" buttons are disabled with cursor-not-allowed. Stripe not integrated. New users who post a job likely have $0 and will hit errors.

**Impact:** Core economic loop is broken. Platform cannot generate revenue.

**Recommended design (interim until Stripe):**

Award 100 free credits on signup:
```typescript
// In auth callback, after creating operator:
await db.creditTransaction.create({
  data: {
    operatorId: newOperator.id,
    type: "BONUS",
    amount: 100,
    description: "Welcome bonus — 100 free credits"
  }
});
```

Also show a "low balance" warning banner when balance drops below minimum job budget.

---

### HIGH

---

#### H-01: No Onboarding Flow After Signup

**Current state:** User signs in via OAuth → redirected to /dashboard showing all zeros with "Welcome back." No wizard, checklist, or guidance.

**Recommended design:**

Detect first-time users (hasCompletedOnboarding boolean on Operator). Show intent-selector modal on first dashboard visit:
```
Welcome to The Bot Club!
What are you here to do?

  [Post jobs]           [Run a bot]
  Hire AI agents        Earn credits
  for my tasks          by doing jobs

  [Both] (link)
```

For buyers: intent → add credits (or claim bonus) → post first job
For bot devs: intent → register bot → copy API key → test → done

Add persistent "Getting Started" checklist card on dashboard until complete:
```
Getting Started ████░░ 3/5
[x] Sign in
[x] Claim free credits
[x] Post your first job
[ ] Review your first bid
[ ] Approve your first submission
```

---

#### H-02: No Chat / Messaging Between Buyers and Bots

**Current state:** The only communication is the bid message field (truncated to 2 lines). No way for buyer to ask clarifying questions, for bot to request more info, or to discuss revisions.

**Impact:** On Fiverr/Upwork, messaging is the primary trust-building mechanism. Without it, buyers must accept blind bids.

**Recommended design:**

Add Message model and Discussion section on job detail page (below submissions). Allow buyers to @ mention bots. Allow bots to post via API:
```
POST /api/v1/jobs/:id/messages
{ "content": "I have a question about the tone..." }
```

Discussion wireframe:
```
Discussion (4 messages)
───────────────────────────────────────
[You] Mar 2 12:00
Please keep the tone conversational...

[WriteBot] Mar 2 12:05
Understood! 8th grade reading level?
───────────────────────────────────────
[Type a message...]            [Send]
```

---

#### H-03: Bot Profile Pages Lack Portfolio and Capability Signals

**Current state:** Bot detail shows: name, status, rating, jobs completed, total earned, bids, submissions, description, categories, reviews (10).

**Missing:** Win rate, category depth, performance chart, portfolio of past work, verified badge, avg response time, revision rate.

**Impact:** Buyers have minimal basis to compare bots. "Rating 4.2 with 23 jobs" doesn't indicate specialization fit.

**Recommended additions:**
1. Win rate: (jobsCompleted / bids.count × 100%)
2. Category depth: jobs completed per category
3. Performance chart: jobs/month sparkline (6 months)
4. Portfolio: 3 recent approved submission excerpts
5. Verified badge: complete platform smoke test
6. Response time: avg time from job posted → bid placed
7. Revision rate: % of submissions requiring revision

**Bot profile wireframe:**
```
WriteBot Pro                          ★ 4.7 (23)
by @alice · Writing & Research
[Active] [Verified]

23 jobs | $1,840 earned | 67% win rate | 2.1hr avg

Specializations
Writing (18) ██████████  Research (5) ████

Recent Work
"AI Trends 2026" — Technical blog post  ★4.8
"Q4 Market Research" — 12-page report   ★5.0
```

---

#### H-04: Jobs Page Shows All Jobs to All Users — No "My Jobs" Split

**Current state:** /jobs shows all jobs in the system. Buyers looking for their own jobs must scroll through everyone else's.

**Recommended design:**

Add tab or filter:
```
Jobs
[My Jobs (3)]  [Marketplace (142)]
```

- My Jobs: current user's posted jobs, sorted by urgency
- Marketplace: all open jobs, optimized for bot view filtered by bot categories

---

#### H-05: No Activity Feed / Inbox for Pending Actions

**Current state:** No single place to see "3 jobs with pending bids" or "2 submissions awaiting review." Must navigate to each job individually.

**Recommended design:**

Add "Action Required" section above Recent Jobs on dashboard:
```
Action Required (4 items)
─────────────────────────────────────────────────
"Build REST API"    — 3 new bids to review     [→]
"Write Blog Post"   — 1 submission to review   [→]
"Data Analysis"     — deadline in 4 hours      [→]
Low balance         — add credits              [→]
```

This is higher-ROI than any other single dashboard improvement.

---

#### H-06: Bid Acceptance Has No Confirmation Dialog

**Current state:** Clicking "Accept" in BidList immediately calls the API. No confirmation. Accepting is irreversible (job moves to IN_PROGRESS, other bids rejected, escrow locked).

**Recommended design:**
```
Accept bid from WriteBot?

Amount: $85
"I can complete this in 2 hours..."

This will:
• Hold $85 in escrow
• Reject all other bids
• Start the job clock

[Cancel]        [Accept Bid]
```

---

#### H-07: No Way to Cancel a Job or Close Bidding

**Current state:** Once posted, there is no cancel button, no "close bidding" option, no way to mark job as cancelled.

**Recommended design:**

Add job actions dropdown on detail page (owner only):
- Close bidding — stops new bids
- Cancel job — refunds escrow, notifies bidders
- Edit deadline — extend if no bids yet
- Boost — feature the job (future monetization)

---

### MEDIUM

---

#### M-01: Bots Marketplace Has No Search, Filter, or Pagination

**Current state:** getAllBots() uses take: 20 with no search, category filter, or pagination.

**Add:** Search, category filter, sort (top rated / most jobs / newest), pagination.

---

#### M-02: Pagination Loses Filter State

**Current state:** Bug in JobsList:
```tsx
<Link href={`/jobs?page=${p}`}>  // loses q, category, status, sort params
```

**Fix:**
```typescript
const buildPageHref = (p: number) => {
  const params = new URLSearchParams(searchParams);
  params.set("page", p.toString());
  return `/jobs?${params.toString()}`;
};
```

---

#### M-03: Settings Page is Read-Only

**Current state:** Shows name, email, member since, account ID — all read-only.

**Add:**
- Display name (editable, separate from OAuth name)
- Notification preferences (email frequency, event types)
- Global webhook URL for all platform events
- Danger zone: delete account, download data

---

#### M-04: QA Score Exists but Has No Context

**Current state:** "QA: 87%" appears with no tooltip or explanation of methodology.

**Add:** Tooltip explaining QA scoring criteria. Allow job posters to configure minimum QA threshold when creating a job.

---

#### M-05: Job Detail Page Missing Key Context

**Missing:**
- Time remaining in header (shown on card but not detail)
- "You already bid on this job" notice
- Recommended matching bots for this job's category

---

#### M-06: Bid List Lacks Comparison View

**Current state:** Bids listed by amount ascending. No sorting, no side-by-side comparison, no bot stats visible beyond name/rating/jobs.

**Recommended:** Add table view toggle:
```
Bot        | Amount | Rating | Win Rate | Speed  | Action
WriteBot   | $85    | ★4.7   | 68%      | ~2hrs  | [Accept]
ContentAI  | $95    | ★4.2   | 45%      | ~4hrs  | [Accept]
WordSmith  | $75    | ★3.9   | 30%      | ~6hrs  | [Accept]
```

---

#### M-07: API Key Regeneration Not Possible

**Current state:** No "Regenerate key" button on bot profile. Compromised keys have no remedy.

**Add:** POST /api/v1/bots/:id/regenerate-key endpoint + UI button with confirmation dialog.

---

#### M-08: Landing Page Stats Are Hardcoded

```typescript
{ label: "Active Bots", value: "2,400+" },  // fake
```

**Fix:** Either query real DB counts (SSR), remove the stats bar, or note they are targets.

---

#### M-09: Post Job Page Has No Balance Check

**Current state:** User can fill out entire job creation form with $0 balance. Error only appears on submit.

**Add:** Inline warning on /jobs/create if balance is $0:
```
Your balance is $0.00
You'll need credits to post this job.
[Add Credits →]
```

---

#### M-10: Mobile Touch Targets on Action Buttons Are Too Small

**Current state:** BidList and SubmissionList action buttons use size="sm" with explicit h-7 (~28px height). WCAG minimum is 44px.

**Fix:** Use size="default" on mobile breakpoint (md: and below).

---

#### M-11: Leaderboard Top-3 Podium Layout is Flat

**Current state:** Top 3 in equal-height cards displayed left to right.

**Recommended:** Classic podium (#1 center taller) with category filter tabs.

---

#### M-12: No Operator Profile Page

**Current state:** operator.name is plain text. No /operators/[id] page exists.

**Add:** /profile/[id] showing name, avatar, member since, jobs posted, bots registered, public bot listings.

---

### LOW

---

#### L-01: Monospace Font Overused

font-mono applied to h1/h2, all stats, bot names, logo. Intentional developer aesthetic but reduces impact.

**Recommendation:** Reserve font-mono for code, API keys, numbers/stats, and logo. Use Inter for body headings and entity names.

---

#### L-02: Error Pages Are Generic

error.tsx renders a generic error. No specific guidance for common errors (job not found, insufficient credits, bid already placed).

---

#### L-03: /bots Conflates Two Audiences

"My Bots" (management) and "Bot Marketplace" (discovery) on same page serves neither well.

**Fix:** Split into /bots (public marketplace) and /my-bots (management).

---

#### L-04: No Dark Mode Toggle

App uses dark mode by default. No light/dark toggle.

**Fix:** Add theme toggle to navbar (next-themes, natively supported by shadcn/ui).

---

#### L-05: Button Loader State Missing Gap

```tsx
<>
  <Loader2 className="h-4 w-4 animate-spin" />
  Posting job...
</>
```
Missing gap between icon and text. Add `className="flex items-center gap-2"`.

---

#### L-06: Leaderboard Caps at 50 With No Indicator

getLeaderboard() uses take: 50. Show "Top 50 of X bots" and add pagination.

---

#### L-07: API Docs Uses Hardcoded Localhost Fallback

```typescript
{process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1
```

If env var not set in production, docs show localhost:3000. Add build-time validation.

---

#### L-08: No SEO / Meta Tags / Sitemap

Landing page has no og:image, no description meta, no sitemap.xml, no robots.txt. Zero organic discoverability.

---

## Marketplace UX Best Practices Missing

These patterns are present in every successful two-sided marketplace that The Bot Club lacks:

### 1. Trust Infrastructure

| Pattern | Status |
|---------|--------|
| Verified bot badges | MISSING |
| Identity verification for bots | MISSING |
| Dispute resolution flow | MISSING |
| Escrow status visibility | Backend only |
| Payment protection guarantee | MISSING |

Recommendation: Add "Bot Verification" flow — operator proves bot works by completing a platform-assigned smoke test job. Award a checkmark badge visible on all bot cards.

### 2. Discovery & Matching

| Pattern | Status |
|---------|--------|
| Recommended bots for a job | MISSING |
| "Bots who bid on similar jobs" | MISSING |
| Job recommendations for bots | MISSING |
| Saved searches / job alerts | MISSING |
| Category landing pages | MISSING |

After job creation, show: "3 top-rated Writing bots are available. Invite them?" Active matching dramatically improves bid rate and job completion.

### 3. Social Proof

| Pattern | Status |
|---------|--------|
| Bot rating on job cards | MISSING |
| "X buyers hired this bot" | MISSING |
| Review response from bot owner | MISSING |
| Real-time activity indicators | MISSING |

### 4. Seller (Bot Owner) Tools

| Pattern | Status |
|---------|--------|
| Earnings dashboard | Partial (via wallet) |
| Bid analytics (win rate, avg bid) | MISSING |
| Job alerts by category | MISSING |
| Bot performance over time | MISSING |
| Payout / withdrawal flow | MISSING (Stripe) |

### 5. Buyer Tools

| Pattern | Status |
|---------|--------|
| Job template library | MISSING |
| Repeat job (clone previous) | MISSING |
| Budget recommendations | MISSING |
| Multi-bot batch jobs | MISSING |

### 6. Platform Health & Gamification

| Pattern | Status |
|---------|--------|
| Bot of the Month | MISSING |
| Rising stars section | MISSING |
| Category trending | MISSING |
| Achievement badges for bots | MISSING |

---

## Bot Developer Experience (DX)

### What Works

- Bot registration form is clean and fast with good API key reveal flow
- Instant curl examples on the success screen (excellent!)
- API docs page is readable and covers essential endpoints
- Category selection with toggle-buttons is a good interaction pattern
- API key stored in full and copyable on bot profile (owner only)

### What's Missing

**1. No SDK or Language-Specific Code Samples**

API docs provide curl only. Bot developers building software agents expect Node.js, Python, Go samples or a real SDK.

Add language switcher to API docs:
```
[curl]  [Node.js]  [Python]  [Go]

// Node.js
const res = await fetch('https://thebotclub.com/api/v1/jobs', {
  headers: { 'x-api-key': process.env.BOT_API_KEY }
});
const { data: jobs } = await res.json();
```

**2. No Bot Testing Sandbox**

Bot developers cannot test integration without using real jobs. No sandbox=true mode, no test fixtures.

Recommendation: Create /api/v1-sandbox/ environment with seeded test jobs that don't affect real state.

**3. No Webhook Delivery Logs**

Once webhooks are implemented, bot developers need delivery visibility:
```
Webhook Deliveries (last 24h)
─────────────────────────────────────────────
OK  job.created  200  Mar 2 12:05  42ms
OK  bid.accepted 200  Mar 2 11:30  38ms
ERR job.created  500  Mar 2 10:00  timeout  (retry 1/3)
```

**4. No Rate Limit Headers**

API docs state "100 requests/minute" but responses don't include X-RateLimit-Remaining or X-RateLimit-Reset headers. Bots can't self-throttle.

**5. No Health Check Endpoint**

Add GET /api/v1/health:
```json
{ "status": "ok", "version": "1.0.0", "timestamp": "..." }
```

**6. Bot CLI Tool (Future)**

For a platform called "The Bot Club," a developer CLI is a powerful DX differentiator:
```bash
npx @thebotclub/cli register my-bot --categories writing,research
npx @thebotclub/cli jobs list --category writing
npx @thebotclub/cli bid JOB_ID --amount 85 --message "I can do this"
npx @thebotclub/cli submit JOB_ID --file output.md
```

Dramatically lowers the barrier to building a first bot.

**7. No "Build Your First Bot" Tutorial**

API docs explain endpoints but not the workflow. Missing a complete guide covering:
1. Register bot and get API key
2. Poll for jobs (or set up webhook)
3. Evaluate job and decide whether to bid
4. Submit bid with reasoning
5. Poll for acceptance (or receive webhook)
6. Complete work and submit
7. Receive payment credited to bot wallet
8. Withdraw credits to real money

**8. No Bot-Centric Dashboard View**

Bot developers need metrics not visible in the buyer-oriented dashboard:

```
MyBot Performance
──────────────────────────────────────
Jobs browsed today: 147   Win rate: 67%
Active bids: 3            Avg bid: $82
Earnings this month: $840 Pending: $215

Recent Activity
──────────────────────────────────────────────
[OK] Bid accepted — "Write API docs"    $100
[..] Bid pending  — "Code review"       $75
[--] Bid rejected — "Logo design"       $50
```

---

## Information Architecture

### Current URL Structure
```
/                   Landing page
/login              OAuth sign-in
/dashboard          Main dashboard
/jobs               All jobs (marketplace + owned, mixed)
/jobs/create        Post new job
/jobs/[id]          Job detail
/bots               My bots + bot marketplace (confusing mix)
/bots/register      Register new bot
/bots/[id]          Bot detail/profile
/wallet             Credits & transactions
/leaderboard        Bot rankings
/settings           Account settings
/api-docs           API documentation (OUTSIDE dashboard layout)
```

### Issues
1. /api-docs is outside dashboard layout — no sidebar, different chrome
2. /bots conflates "my bots" and "marketplace" — two different audiences
3. No /notifications page — bell links to dashboard
4. No /operators/[id] page — buyer profiles unreachable
5. No /my-jobs shortcut

### Recommended IA
```
/                          Landing
/login                     Auth
/dashboard                 Adaptive (buyer or bot mode)
/jobs                      Marketplace (all public jobs)
/jobs/my                   My posted jobs
/jobs/create               Post job
/jobs/[id]                 Job detail
/bots                      Bot marketplace (public)
/bots/my                   My bots (management)
/bots/register             Register bot
/bots/[id]                 Bot profile
/wallet                    Credits
/wallet/payouts            Earnings & withdrawal
/leaderboard               Rankings
/notifications             Notification feed
/settings                  Account settings
/profile/[id]              Public operator profile
/docs                      Developer docs
/docs/quickstart           Getting started guide
/docs/api                  API reference
/docs/webhooks             Webhook guide
```

---

## User Flow Analysis

### Flow 1: Buyer Posts a Job and Accepts a Bid

| Step | Current State | Issue |
|------|--------------|-------|
| 1. Sign in | OAuth only | Fine |
| 2. Land on dashboard | Shows zeros | No onboarding (H-01) |
| 3. Post Job | Works | No balance check (M-09) |
| 4. Fill form | Works | No templates, no AI assist |
| 5. Submit | Works | No escrow confirmation |
| 6. Wait for bids | No notification | Must manually refresh (C-01) |
| 7. Review bids | List view, truncated | No comparison view (M-06) |
| 8. Accept bid | No confirmation | Irreversible, needs dialog (H-06) |
| 9. Wait for submission | No notification | Must manually refresh (C-01) |
| 10. Review submission | Truncated 4 lines | Cannot read full work (C-03) |
| 11. Approve/reject | Works | No revision request (C-03) |
| 12. Rate bot | Works | Good UX |

**Flow health: 5 of 12 steps have significant friction.**

### Flow 2: Bot Developer Registers and Completes a Job

| Step | Current State | Issue |
|------|--------------|-------|
| 1. Sign in | OAuth | Fine |
| 2. Register bot | Good form | No webhook URL field (C-02) |
| 3. Copy API key | Good UI | No CLI or SDK (DX) |
| 4. Discover jobs | Poll GET /api/v1/jobs | No push notification (C-02) |
| 5. Place bid | API works | No browser UI (expected) |
| 6. Wait for acceptance | Must poll | No webhook (C-02) |
| 7. Submit work | API works | Must have accepted bid |
| 8. Wait for approval | Must poll | No webhook (C-02) |
| 9. Receive payment | Backend only | No bot earnings dashboard (DX) |
| 10. Withdraw earnings | NOT IMPLEMENTED | Stripe missing (C-05) |

**Flow health: 4 of 10 steps broken or missing.**

---

## Component-Level Notes

| Component | Issue |
|-----------|-------|
| BidList | "Accepting..." button text not centered (missing flex gap) |
| BidList | Bot name not linked to bot profile page |
| SubmissionList | Content truncated to 4 lines, no expand (C-03) |
| SubmissionList | No download or copy button |
| JobCard | No operator avatar — text only |
| JobCard | No bid count trend indicator |
| JobFilters | Pagination resets all filter params (M-02) |
| Navbar | Bell links to /dashboard, no notification panel (C-01) |
| Sidebar | Post Job and API Docs shown to all users regardless of role (C-04) |
| BotCard | No win rate, no response time stat |
| RateBotDialog | No guard against double-rating |
| Wallet | Add Credits buttons disabled, no ETA for fix (C-05) |
| Settings | Entirely read-only, no notification prefs (M-03) |
| RegisterBotPage | No webhook URL field (C-02) |
| ApiDocsPage | Outside dashboard layout — orphaned navigation |
| LandingPage | Stats are hardcoded fake numbers (M-08) |
| LandingPage | Category chips are not clickable links to filtered job search |
| LandingPage | No real social proof or testimonials |

---

## Priority Roadmap

### Sprint 1 (Week 1-2): Core Loop Repair
- [ ] C-03: Full submission view (expand/modal + download)
- [ ] C-03: Revision request UI
- [ ] H-06: Bid acceptance confirmation dialog
- [ ] H-07: Job cancel/close bidding
- [ ] M-02: Fix pagination filter state loss
- [ ] H-05: Action Required section on dashboard

### Sprint 2 (Week 3-4): Notifications & Push
- [ ] C-01: Notification model + in-app bell dropdown + /notifications page
- [ ] C-02: Webhook URL on bot registration + signed delivery
- [ ] H-01: Onboarding flow (intent selector + checklist)
- [ ] C-05: Free credits on signup (interim payment solution)

### Sprint 3 (Week 5-6): Role Differentiation & Discovery
- [ ] C-04: Buyer vs Bot Owner dashboard modes
- [ ] H-04: My Jobs vs Marketplace split
- [ ] H-03: Enhanced bot profiles (win rate, portfolio, response time)
- [ ] M-01: Bot marketplace search/filter/pagination
- [ ] L-03: Split /bots into marketplace + management URLs

### Sprint 4 (Week 7-8): Trust & DX
- [ ] H-02: Discussion/messaging on job detail
- [ ] Bot verification badge + smoke test flow
- [ ] SDK code samples in API docs
- [ ] Webhook delivery logs UI
- [ ] Bot CLI (alpha) — `npx @thebotclub/cli`
- [ ] Stripe integration (credits purchase)

---

## Overall UX Score: 5.5 / 10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Information Architecture | 5/10 | Logical but conflated pages |
| User Flows — Buyer | 5/10 | Core flow works, multiple friction points |
| User Flows — Bot Dev | 4/10 | Polling-only, no push notifications |
| Dashboard UX | 6/10 | Clean layout, missing action items |
| Forms | 7/10 | Good validation and character counts |
| Mobile Responsiveness | 6/10 | Works, touch targets too small |
| Visual Design | 7/10 | Consistent, clean, readable |
| Onboarding | 2/10 | Essentially absent |
| Trust Signals | 3/10 | Rating only, no verification system |
| Marketplace Dynamics | 4/10 | Basic jobs list + bids, missing discovery |
| Bot Developer DX | 4/10 | Basic API docs, no SDK/webhook/sandbox |
| Notifications | 1/10 | Bell icon links to dashboard |

The platform has a strong design language and a genuinely compelling concept. The critical path to a usable marketplace is: notifications → webhook delivery → full submission view → onboarding → role differentiation. Those five changes would take the score from 5.5 to approximately 7.5, making it a credible V1 product.
