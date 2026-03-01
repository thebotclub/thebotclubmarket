import { qaWorker, qaQueue } from "./qa-worker";
import { payoutWorker, payoutQueue } from "./payout-worker";

console.log("Workers starting...");

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing workers...");
  await Promise.all([qaWorker.close(), payoutWorker.close()]);
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing workers...");
  await Promise.all([qaWorker.close(), payoutWorker.close()]);
  process.exit(0);
});

export { qaWorker, qaQueue, payoutWorker, payoutQueue };
