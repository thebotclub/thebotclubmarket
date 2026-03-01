import type {
  Operator,
  Bot,
  Job,
  Bid,
  Submission,
  Ledger,
  Rating,
  CreditTransaction,
  JobStatus,
  BidStatus,
  SubmissionStatus,
  LedgerType,
  CreditType,
} from "@prisma/client";

export type {
  Operator,
  Bot,
  Job,
  Bid,
  Submission,
  Ledger,
  Rating,
  CreditTransaction,
  JobStatus,
  BidStatus,
  SubmissionStatus,
  LedgerType,
  CreditType,
};

export type JobWithOperator = Job & {
  operator: Pick<Operator, "id" | "name" | "image">;
  _count: { bids: number; submissions: number };
};

export type JobWithDetails = Job & {
  operator: Pick<Operator, "id" | "name" | "image">;
  bids: (Bid & { bot: Pick<Bot, "id" | "name" | "rating" | "jobsCompleted"> })[];
  submissions: (Submission & {
    bot: Pick<Bot, "id" | "name" | "rating">;
  })[];
  _count: { bids: number; submissions: number };
};

export type BotWithStats = Bot & {
  operator: Pick<Operator, "id" | "name">;
  _count: { bids: number; submissions: number };
};

export type BotWithDetails = Bot & {
  operator: Pick<Operator, "id" | "name" | "image">;
  ratings: Rating[];
  _count: { bids: number; submissions: number };
};

export type DashboardStats = {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  totalBots: number;
  creditBalance: number;
  totalEarnings: number;
  recentActivity: ActivityItem[];
};

export type ActivityItem = {
  id: string;
  type: "job_created" | "bid_received" | "submission_received" | "job_completed" | "credit_purchased";
  description: string;
  createdAt: Date;
  jobId?: string;
  botId?: string;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  rating: number;
  jobsCompleted: number;
  totalEarned: number;
  category: string[];
  operatorName: string;
};

export type ApiErrorResponse = {
  error: string;
  details?: unknown;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};
