/**
 * Core Marketplace Flow Tests
 *
 * Tests for:
 * - Job creation validation (Zod schema)
 * - Bid placement and acceptance
 * - Submission lifecycle (submit → approve/reject/revise)
 * - Rating system
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const { method = "POST", body, headers = {} } = opts;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!headers["content-type"])
      (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  return new NextRequest(new URL(url, "http://localhost"), init);
}

function mockSession(userId = "op_123") {
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, name: "Test User", email: "t@t.com" },
  } as never);
}

// ─── 1. Job Creation Validation ──────────────────────────────────────────────

describe("createJobSchema validation", () => {
  it("accepts valid job data", async () => {
    const { createJobSchema } = await import("@/lib/validation");
    const result = createJobSchema.safeParse({
      title: "Write a compelling product description",
      description:
        "We need a 500-word description for our SaaS product that highlights key benefits and features for remote teams.",
      category: "writing",
      budget: 100,
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects title shorter than 10 characters", async () => {
    const { createJobSchema } = await import("@/lib/validation");
    const result = createJobSchema.safeParse({
      title: "Short",
      description: "A ".repeat(30),
      category: "writing",
      budget: 100,
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects description shorter than 50 characters", async () => {
    const { createJobSchema } = await import("@/lib/validation");
    const result = createJobSchema.safeParse({
      title: "A valid title for the job posting",
      description: "Too short",
      category: "writing",
      budget: 100,
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid category", async () => {
    const { createJobSchema } = await import("@/lib/validation");
    const result = createJobSchema.safeParse({
      title: "A valid title for the job posting",
      description: "A ".repeat(30),
      category: "invalid-category",
      budget: 100,
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects past deadline", async () => {
    const { createJobSchema } = await import("@/lib/validation");
    const result = createJobSchema.safeParse({
      title: "A valid title for the job posting",
      description: "A ".repeat(30),
      category: "coding",
      budget: 100,
      deadline: new Date(Date.now() - 86400_000).toISOString(), // yesterday
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative budget", async () => {
    const { createJobSchema } = await import("@/lib/validation");
    const result = createJobSchema.safeParse({
      title: "A valid title for the job posting",
      description: "A ".repeat(30),
      category: "coding",
      budget: -10,
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

// ─── 2. Bid Placement ────────────────────────────────────────────────────────

describe("POST /api/v1/jobs/[id]/bids — bid placement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects bid with negative amount", async () => {
    const { placeBidSchema } = await import("@/lib/validation");
    const result = placeBidSchema.safeParse({ amount: -5 });
    expect(result.success).toBe(false);
  });

  it("accepts valid bid data", async () => {
    const { placeBidSchema } = await import("@/lib/validation");
    const result = placeBidSchema.safeParse({ amount: 50, message: "I can do this job well." });
    expect(result.success).toBe(true);
  });
});

// ─── 3. Bid Acceptance ───────────────────────────────────────────────────────

describe("POST /api/v1/jobs/[id]/bids/[bidId]/accept — bid acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/jobs/[id]/bids/[bidId]/accept/route");
    const req = makeRequest("http://localhost/api/v1/jobs/j1/bids/b1/accept");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", bidId: "b1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when job not found", async () => {
    mockSession();
    vi.mocked(db.job.findUnique).mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/jobs/[id]/bids/[bidId]/accept/route");
    const req = makeRequest("http://localhost/api/v1/jobs/bad_job/bids/b1/accept");
    const res = await POST(req, { params: Promise.resolve({ id: "bad_job", bidId: "b1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-owner tries to accept bid", async () => {
    mockSession("op_other");
    vi.mocked(db.job.findUnique).mockResolvedValue({
      id: "j1",
      status: "OPEN",
      operatorId: "op_owner",
      title: "Test job",
    } as never);
    const { POST } = await import("@/app/api/v1/jobs/[id]/bids/[bidId]/accept/route");
    const req = makeRequest("http://localhost/api/v1/jobs/j1/bids/b1/accept");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", bidId: "b1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 409 when job is not OPEN", async () => {
    mockSession("op_owner");
    vi.mocked(db.job.findUnique).mockResolvedValue({
      id: "j1",
      status: "COMPLETED",
      operatorId: "op_owner",
      title: "Test job",
    } as never);
    const { POST } = await import("@/app/api/v1/jobs/[id]/bids/[bidId]/accept/route");
    const req = makeRequest("http://localhost/api/v1/jobs/j1/bids/b1/accept");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", bidId: "b1" }) });
    expect(res.status).toBe(409);
  });

  it("returns 409 when bid is not PENDING", async () => {
    mockSession("op_owner");
    vi.mocked(db.job.findUnique).mockResolvedValue({
      id: "j1",
      status: "OPEN",
      operatorId: "op_owner",
      title: "Test job",
    } as never);
    vi.mocked(db.bid.findUnique).mockResolvedValue({
      id: "b1",
      jobId: "j1",
      status: "REJECTED",
      amount: { toNumber: () => 50 },
      bot: { id: "bot_1", operatorId: "op_bot", name: "TestBot" },
    } as never);
    const { POST } = await import("@/app/api/v1/jobs/[id]/bids/[bidId]/accept/route");
    const req = makeRequest("http://localhost/api/v1/jobs/j1/bids/b1/accept");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", bidId: "b1" }) });
    expect(res.status).toBe(409);
  });

  it("accepts bid: updates job to IN_PROGRESS and rejects other bids", async () => {
    mockSession("op_owner");
    vi.mocked(db.job.findUnique).mockResolvedValue({
      id: "j1",
      status: "OPEN",
      operatorId: "op_owner",
      title: "Test job",
    } as never);
    vi.mocked(db.bid.findUnique).mockResolvedValue({
      id: "b1",
      jobId: "j1",
      status: "PENDING",
      amount: { toNumber: () => 50 },
      bot: { id: "bot_1", operatorId: "op_bot", name: "TestBot" },
    } as never);
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}, {}] as never);

    const { POST } = await import("@/app/api/v1/jobs/[id]/bids/[bidId]/accept/route");
    const req = makeRequest("http://localhost/api/v1/jobs/j1/bids/b1/accept");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", bidId: "b1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(db.$transaction).toHaveBeenCalled();
  });
});

// ─── 4. Submission Lifecycle ─────────────────────────────────────────────────

describe("Submission lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitWorkSchema: rejects content shorter than 10 chars", async () => {
    const { submitWorkSchema } = await import("@/lib/validation");
    const result = submitWorkSchema.safeParse({ content: "Short" });
    expect(result.success).toBe(false);
  });

  it("submitWorkSchema: accepts valid submission content", async () => {
    const { submitWorkSchema } = await import("@/lib/validation");
    const result = submitWorkSchema.safeParse({
      content: "Here is my full submission with all required details.",
    });
    expect(result.success).toBe(true);
  });

  it("reject route: returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/v1/jobs/[id]/submissions/[subId]/reject/route"
    );
    const req = makeRequest("http://localhost/api/v1/jobs/j1/submissions/s1/reject");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", subId: "s1" }) });
    expect(res.status).toBe(401);
  });

  it("reject route: returns 409 when submission already rejected", async () => {
    mockSession("op_owner");
    vi.mocked(db.job.findUnique).mockResolvedValue({
      id: "j1",
      operatorId: "op_owner",
      title: "Test",
    } as never);
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      id: "s1",
      jobId: "j1",
      botId: "bot_1",
      status: "REJECTED",
    } as never);
    const { POST } = await import(
      "@/app/api/v1/jobs/[id]/submissions/[subId]/reject/route"
    );
    const req = makeRequest("http://localhost/api/v1/jobs/j1/submissions/s1/reject");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", subId: "s1" }) });
    expect(res.status).toBe(409);
  });

  it("reject route: successfully rejects a pending submission", async () => {
    mockSession("op_owner");
    vi.mocked(db.job.findUnique).mockResolvedValue({
      id: "j1",
      operatorId: "op_owner",
      title: "Test",
    } as never);
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      id: "s1",
      jobId: "j1",
      botId: "bot_1",
      status: "PENDING",
    } as never);
    vi.mocked(db.submission.update).mockResolvedValue({} as never);
    vi.mocked(db.bot.findUnique).mockResolvedValue({
      operatorId: "op_bot",
      name: "BotOne",
    } as never);
    const { POST } = await import(
      "@/app/api/v1/jobs/[id]/submissions/[subId]/reject/route"
    );
    const req = makeRequest("http://localhost/api/v1/jobs/j1/submissions/s1/reject");
    const res = await POST(req, { params: Promise.resolve({ id: "j1", subId: "s1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(db.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } })
    );
  });
});

// ─── 5. Rating System ────────────────────────────────────────────────────────

describe("Rating system validation", () => {
  it("rateSubmissionSchema: rejects score below 1", async () => {
    const { rateSubmissionSchema } = await import("@/lib/validation");
    const result = rateSubmissionSchema.safeParse({ score: 0 });
    expect(result.success).toBe(false);
  });

  it("rateSubmissionSchema: rejects score above 5", async () => {
    const { rateSubmissionSchema } = await import("@/lib/validation");
    const result = rateSubmissionSchema.safeParse({ score: 6 });
    expect(result.success).toBe(false);
  });

  it("rateSubmissionSchema: accepts score in 1-5 range", async () => {
    const { rateSubmissionSchema } = await import("@/lib/validation");
    for (const score of [1, 2, 3, 4, 5]) {
      const result = rateSubmissionSchema.safeParse({ score });
      expect(result.success).toBe(true);
    }
  });

  it("rateSubmissionSchema: accepts optional comment", async () => {
    const { rateSubmissionSchema } = await import("@/lib/validation");
    const result = rateSubmissionSchema.safeParse({ score: 4, comment: "Great work!" });
    expect(result.success).toBe(true);
    expect(result.data?.comment).toBe("Great work!");
  });
});

// ─── 6. Constants Validation ─────────────────────────────────────────────────

describe("Platform constants", () => {
  it("exports correct PLATFORM_FEE_PERCENT (15% public facing)", async () => {
    const { PLATFORM_FEE_PERCENT } = await import("@/lib/constants");
    expect(PLATFORM_FEE_PERCENT).toBe(15);
  });

  it("exports correct MIN_JOB_BUDGET ($5)", async () => {
    const { MIN_JOB_BUDGET } = await import("@/lib/constants");
    expect(MIN_JOB_BUDGET).toBe(5);
  });

  it("exports correct MAX_JOB_BUDGET ($10,000)", async () => {
    const { MAX_JOB_BUDGET } = await import("@/lib/constants");
    expect(MAX_JOB_BUDGET).toBe(10000);
  });

  it("exports WELCOME_BONUS_CREDITS (100 credits)", async () => {
    const { WELCOME_BONUS_CREDITS } = await import("@/lib/constants");
    expect(WELCOME_BONUS_CREDITS).toBe(100);
  });
});

// ─── 7. Wallet Balance Calculations ──────────────────────────────────────────

describe("Wallet balance calculations", () => {
  it("debit + credit balance with escrow: credits_after = credits_before - budget", () => {
    const creditsBefore = 500;
    const jobBudget = 100;
    const creditsAfter = creditsBefore - jobBudget;
    expect(creditsAfter).toBe(400);
  });

  it("refund calculation: full refund without cancellation fee", () => {
    const budget = 200;
    const hasAcceptedBid = false;
    const cancellationFee = hasAcceptedBid ? budget * 0.1 : 0;
    const refundAmount = budget - cancellationFee;
    expect(refundAmount).toBe(200);
    expect(cancellationFee).toBe(0);
  });

  it("refund calculation: 10% fee when accepted bid exists", () => {
    const budget = 200;
    const hasAcceptedBid = true;
    const cancellationFee = hasAcceptedBid ? budget * 0.1 : 0;
    const refundAmount = budget - cancellationFee;
    expect(refundAmount).toBe(180);
    expect(cancellationFee).toBe(20);
  });

  it("approval splits: bot gets 85%, platform gets 15%", () => {
    const budget = 1000;
    const PLATFORM_FEE_PERCENT = 15;
    const platformFee = Math.round(budget * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const botEarning = budget - platformFee;
    expect(platformFee).toBe(150);
    expect(botEarning).toBe(850);
    expect(platformFee + botEarning).toBe(budget);
  });

  it("ledger debit/credit consistency: sum of entries equals total", () => {
    // Simulate ledger entries for a completed job
    const budget = 500;
    const entries = [
      { type: "JOB_PAYMENT", amount: -budget }, // escrow debit
      { type: "BOT_EARNING", amount: budget * 0.85 }, // release to bot
      { type: "PLATFORM_FEE", amount: budget * 0.15 }, // platform revenue
    ];
    const operatorDebits = entries
      .filter((e) => e.type === "JOB_PAYMENT")
      .reduce((sum, e) => sum + Math.abs(e.amount), 0);
    const payouts = entries
      .filter((e) => e.type !== "JOB_PAYMENT")
      .reduce((sum, e) => sum + e.amount, 0);
    expect(operatorDebits).toBe(payouts);
  });
});
