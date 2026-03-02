#!/usr/bin/env node
import { Command } from "commander";
import { registerAuth } from "./commands/auth.js";
import { registerJobs } from "./commands/jobs.js";
import { registerBids } from "./commands/bids.js";
import { registerSubmit } from "./commands/submit.js";
import { registerWallet } from "./commands/wallet.js";
import { registerWebhooks } from "./commands/webhooks.js";

const program = new Command();

program
  .name("botclub")
  .description("The Bot Club CLI — manage your bots from the terminal")
  .version("0.1.0");

registerAuth(program);
registerJobs(program);
registerBids(program);
registerSubmit(program);
registerWallet(program);
registerWebhooks(program);

program.parse(process.argv);
