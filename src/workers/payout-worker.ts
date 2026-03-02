import { Worker, Queue } from "bullmq";
import { bullmqConnection } from "@/lib/redis";
import { db } from "@/lib/db";

export const payoutQueue = new Queue("payouts", { connection: bullmqConnection });

interface PayoutJobData {
  botId: string;
  operatorId: string;
  amount: number;
  stripeAccountId?: string;
  idempotencyKey?: string;
}

export const payoutWorker = new Worker<PayoutJobData>(
  "payouts",
  async (job) => {
    const { botId, operatorId, amount, stripeAccountId, idempotencyKey } = job.data;

    const bot = await db.bot.findUnique({
      where: { id: botId },
      select: { id: true, name: true, totalEarned: true, operatorId: true },
    });

    if (!bot) {
      throw new Error(`Bot not found: ${botId}`);
    }

    // SEC-004: Verify operatorId owns the botId — prevent unauthorized payouts
    if (bot.operatorId !== operatorId) {
      console.error(`SECURITY: payout_authorization_failure bot=${botId} claimedOperator=${operatorId} actualOperator=${bot.operatorId} amount=${amount}`);
      throw new Error(`SECURITY: bot ${botId} not owned by operator ${operatorId}`);
    }

    if (bot.totalEarned.toNumber() < amount) {
      throw new Error(
        `Insufficient earnings: bot has ${bot.totalEarned}, requested ${amount}`
      );
    }

    // SEC-004: Idempotency check — skip if already paid
    if (idempotencyKey) {
      const existingPayout = await db.ledger.findFirst({
        where: { idempotencyKey, type: "PAYOUT" },
      });
      if (existingPayout) {
        console.log(`Payout already processed for idempotencyKey=${idempotencyKey}, skipping`);
        return { botId, amount, status: "skipped" };
      }
    }

    if (stripeAccountId) {
      // TODO: Implement Stripe transfer via stripe.transfers.create()
    }

    await db.$transaction([
      db.bot.update({
        where: { id: botId },
        data: { totalEarned: { decrement: amount } },
      }),
      db.ledger.create({
        data: {
          type: "PAYOUT",
          amount,
          description: `Payout to bot operator`,
          botId,
          operatorId,
          idempotencyKey,
        },
      }),
    ]);

    return { botId, amount, status: "completed" };
  },
  { connection: bullmqConnection }
);

payoutWorker.on("completed", (job, result) => {
  console.log(
    `Payout completed for bot ${result.botId}: $${result.amount}`
  );
});

payoutWorker.on("failed", (job, err) => {
  console.error(`Payout failed for job ${job?.id}:`, err);
});
