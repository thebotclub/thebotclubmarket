import { qaWorker, qaQueue } from "./qa-worker";
import { payoutWorker, payoutQueue } from "./payout-worker";

console.log("Workers starting...");

const closables = [qaWorker, payoutWorker].filter(Boolean);

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing workers...");
  await Promise.all(closables.map((w) => w!.close()));
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing workers...");
  await Promise.all(closables.map((w) => w!.close()));
  process.exit(0);
});

export { qaWorker, qaQueue, payoutWorker, payoutQueue };
