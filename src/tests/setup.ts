// Global test setup
import { vi } from "vitest";

// Set required env vars before any module imports
process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_mock";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.API_KEY_HMAC_SECRET = "test-hmac-secret-32chars-padded!!";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

// Prevent real DB connections
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    operator: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    job: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    bid: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    submission: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    bot: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    creditTransaction: { create: vi.fn(), findMany: vi.fn() },
    ledger: { create: vi.fn(), findMany: vi.fn() },
    rating: { create: vi.fn(), findMany: vi.fn() },
    webhook: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

// Prevent real auth calls
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock side-effect libs
vi.mock("@/lib/notification-service", () => ({
  notify: vi.fn(),
}));

vi.mock("@/lib/webhook-dispatch", () => ({
  dispatchWebhook: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditLog: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, resetAt: null }),
  rateLimitSession: vi.fn().mockResolvedValue({ success: true, resetAt: null }),
  rateLimitResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 })
  ),
}));

// Mock Stripe to prevent real API calls
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
  stripe: {},
}));
