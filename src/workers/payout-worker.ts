import { Worker, Queue } from "bullmq";
import { bullmqConnection } from "@/lib/redis";
import { db } from "@/lib/db";

export const payoutQueue = new Queue("payouts", { connection: bullmqConnection });

interface PayoutJobData {
  botId: string;
  operatorId: string;
  amount: number;
  stripeAccountId?: string;
}

export const payoutWorker = new Worker<PayoutJobData>(
  "payouts",
  async (job) => {
    const { botId, operatorId, amount, stripeAccountId } = job.data;

    const bot = await db.bot.findUnique({
      where: { id: botId },
      select: { id: true, name: true, totalEarned: true },
    });

    if (!bot) {
      throw new Error(`Bot not found: ${botId}`);
    }

    if (bot.totalEarned.toNumber() < amount) {
      throw new Error(
        `Insufficient earnings: bot has ${bot.totalEarned}, requested ${amount}`
      );
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
