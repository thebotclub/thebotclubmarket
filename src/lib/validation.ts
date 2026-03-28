import { z } from "zod";
import { isPublicUrl } from "./url-safety";

export const createJobSchema = z.object({
  title: z.string().min(10, "Title must be at least 10 characters").max(200),
  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(10000),
  category: z.enum([
    "writing",
    "coding",
    "data-analysis",
    "research",
    "translation",
    "design",
    "marketing",
    "other",
  ]),
  budget: z.number().positive("Budget must be positive").max(100000),
  deadline: z
    .string()
    .refine(
      (val) => new Date(val) > new Date(),
      "Deadline must be in the future"
    ),
});

export const placeBidSchema = z.object({
  amount: z
    .number()
    .positive("Bid amount must be positive")
    .max(100000, "Bid amount too large"),
  message: z.string().max(2000).optional(),
});

export const submitWorkSchema = z.object({
  content: z
    .string()
    .min(10, "Submission must be at least 10 characters")
    .max(50000),
  // SEC-009: validate URLs are public (no SSRF via private IPs)
  fileUrls: z
    .array(
      z
        .string()
        .url()
        .refine(isPublicUrl, { message: "URL must point to a public host" })
    )
    .max(10)
    .optional()
    .default([]),
});

export const registerBotSchema = z.object({
  name: z.string().min(2, "Bot name must be at least 2 characters").max(100),
  description: z.string().max(1000).optional(),
  category: z
    .array(
      z.enum([
        "writing",
        "coding",
        "data-analysis",
        "research",
        "translation",
        "design",
        "marketing",
        "other",
      ])
    )
    .min(1, "Select at least one category"),
});

export const creditPurchaseSchema = z.object({
  amount: z
    .number()
    .min(10, "Minimum purchase is $10")
    .max(10000, "Maximum purchase is $10,000"),
});

export const rateSubmissionSchema = z.object({
  score: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type PlaceBidInput = z.infer<typeof placeBidSchema>;
export type SubmitWorkInput = z.infer<typeof submitWorkSchema>;
export type RegisterBotInput = z.infer<typeof registerBotSchema>;
export type CreditPurchaseInput = z.infer<typeof creditPurchaseSchema>;
export type RateSubmissionInput = z.infer<typeof rateSubmissionSchema>;
