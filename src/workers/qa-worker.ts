import { Worker, Queue } from "bullmq";
import { bullmqConnection } from "@/lib/redis";
import { db } from "@/lib/db";

export const qaQueue = bullmqConnection ? new Queue("qa-review", { connection: bullmqConnection }) : null;

interface QaJobData {
  submissionId: string;
  jobId: string;
  botId: string;
}

async function scoreSubmission(
  jobDescription: string,
  submissionContent: string
): Promise<{ score: number; feedback: string }> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    const wordCount = submissionContent.split(/\s+/).length;
    const score = Math.min(1, wordCount / 200);
    return {
      score,
      feedback: `Submission contains ${wordCount} words. OpenAI API key not configured for full QA review.`,
    };
  }

  const prompt = `You are a quality assurance reviewer for a freelance marketplace.

Job Description:
${jobDescription}

Submission:
${submissionContent}

Rate this submission on a scale of 0.0 to 1.0 based on:
1. Relevance to the job requirements
2. Completeness
3. Quality and accuracy
4. Professionalism

Respond with a JSON object: { "score": 0.85, "feedback": "Brief explanation..." }`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const result = JSON.parse(data.choices[0].message.content) as {
    score: number;
    feedback: string;
  };

  return {
    score: Math.max(0, Math.min(1, result.score)),
    feedback: result.feedback,
  };
}

export const qaWorker = bullmqConnection ? new Worker<QaJobData>(
  "qa-review",
  async (job) => {
    const { submissionId, jobId } = job.data;

    const [submission, jobRecord] = await Promise.all([
      db.submission.findUnique({ where: { id: submissionId } }),
      db.job.findUnique({
        where: { id: jobId },
        select: { description: true },
      }),
    ]);

    if (!submission || !jobRecord) {
      throw new Error(`Submission or job not found: ${submissionId}`);
    }

    const { score, feedback } = await scoreSubmission(
      jobRecord.description,
      submission.content
    );

    // SEC-010: QA worker ONLY scores. Never auto-pays or marks APPROVED.
    // Payment happens ONLY in the approve endpoint (operator-triggered).
    // Leave high scores as PENDING for operator review.
    // Only request revision for very low scores.
    const status = score < 0.5 ? "REVISION_REQUESTED" : "PENDING";

    await db.submission.update({
      where: { id: submissionId },
      data: { qaScore: score, qaFeedback: feedback, status },
    });

    return { submissionId, score, status };
  },
  { connection: bullmqConnection }
) : null;

qaWorker?.on("completed", (job, result) => {
  console.log(`QA review completed for submission ${result.submissionId}: score=${result.score}`);
});

qaWorker?.on("failed", (job, err) => {
  console.error(`QA review failed for job ${job?.id}:`, err);
});
