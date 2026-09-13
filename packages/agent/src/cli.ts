#!/usr/bin/env node

import { main } from "@earendil-works/pi-coding-agent";

import { loadHuskyEnvironment } from "./config/env.js";
import { getHuskyAgentDir, getHuskyAgentVersion } from "./config/paths.js";
import { withDefaultModelSelection } from "./launcher/args.js";
import { huskyExtensionFactory } from "./extensions/index.js";

process.title = "husky-agent";

export async function runHuskyAgent(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const environment = loadHuskyEnvironment();
  process.env.PI_CODING_AGENT_DIR = getHuskyAgentDir();

  if (args.includes("--version")) {
    console.log(`husky-agent ${getHuskyAgentVersion()}`);
    return;
  }

  const forwardedArgs = withDefaultModelSelection(args, environment.provider, environment.model);
  await main(forwardedArgs, { extensionFactories: [huskyExtensionFactory] });
}

void runHuskyAgent().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  console.error(`Husky Agent could not start: ${message}`);
  process.exitCode = 1;
});
