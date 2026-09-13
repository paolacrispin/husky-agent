#!/usr/bin/env node

import { main } from "@earendil-works/pi-coding-agent";

import { loadHuskyEnvironment } from "./config/env.js";
import { getHuskyAgentDir, getHuskyAgentVersion } from "./config/paths.js";
import { withDefaultModelSelection, withHuskyHardening } from "./launcher/args.js";
import { huskyExtensionFactory } from "./extensions/index.js";

process.title = "husky-agent";

function huskyHelpText(provider: string, model: string): string {
  return `husky-agent ${getHuskyAgentVersion()} — HashKey Chain Testnet (chain ID 133)

Usage:
  husky-agent [options]

Write operations (each shows a deterministic summary and asks for your approval):
  send <amount> <TOKEN> to <contact|0x address>     transfer native HSK or an allowlisted token
  swap <amount> <TOKEN_IN> for <TOKEN_OUT>          swap via the Husky-Agent AMM (fixed 0.50% slippage)

Read-only tools: wallet status, balances, policy status, transaction status, health.

Configuration:
  .env          HUSKY_AGENT_PROVIDER, HUSKY_AGENT_MODEL, provider credential
  .env.testnet  HSK RPC, contract addresses, WHSK_ADDRESS, SPECULOS_TRANSPORT_URL

Model: ${provider}:${model}

Options:
  --version           print the husky-agent version and exit
  --help, -h          show this help and exit
  --provider <name>   override HUSKY_AGENT_PROVIDER for this run
  --model <name>      override HUSKY_AGENT_MODEL for this run
  --                  treat the remaining arguments as a message

This shell always runs with Pi's built-in tools, extension discovery, skills,
prompt templates and context files disabled. See README.md.
`;
}

function requestsHelp(args: readonly string[]): boolean {
  for (const argument of args) {
    if (argument === "--") return false;
    if (argument === "--help" || argument === "-h") return true;
  }
  return false;
}

export async function runHuskyAgent(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const environment = loadHuskyEnvironment();
  process.env.PI_CODING_AGENT_DIR = getHuskyAgentDir();

  if (args.includes("--version")) {
    console.log(`husky-agent ${getHuskyAgentVersion()}`);
    return;
  }

  // Pi's own help advertises a coding agent with read/bash/edit/write tools,
  // which this shell deliberately disables. Show Husky's help instead.
  if (requestsHelp(args)) {
    console.log(huskyHelpText(environment.provider, environment.model));
    return;
  }

  const forwardedArgs = withHuskyHardening(
    withDefaultModelSelection(args, environment.provider, environment.model),
  );
  await main(forwardedArgs, { extensionFactories: [huskyExtensionFactory] });
}

void runHuskyAgent().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  console.error(`Husky Agent could not start: ${message}`);
  process.exitCode = 1;
});
