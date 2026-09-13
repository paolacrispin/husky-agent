import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";
import {
  loadContacts,
  loadEnvConfig,
  loadTokens,
  type Contacts,
  type EnvConfig,
  type Tokens,
} from "@husky-agent/core";

export type HuskyRuntimeConfig = {
  rootDir: string;
  env: EnvConfig;
  publicClient: PublicClient;
  contacts: Contacts;
  tokens: Tokens;
  allowedContracts: Set<Address>;
};

function findRepoRoot(start = process.cwd()): string {
  const configured = process.env.HUSKY_AGENT_ROOT?.trim();
  if (configured) return path.resolve(configured);

  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, "packages", "agent", "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function configPath(rootDir: string, envName: string, fileName: string, exampleName: string): string {
  const configured = process.env[envName]?.trim();
  if (configured) {
    const resolved = path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
    if (!existsSync(resolved)) throw new Error(`${envName} points to a missing file: ${resolved}`);
    return resolved;
  }
  const userFile = path.join(rootDir, fileName);
  if (existsSync(userFile)) return userFile;
  const exampleFile = path.join(rootDir, exampleName);
  if (existsSync(exampleFile)) return exampleFile;
  throw new Error(`Missing ${fileName}. Copy ${exampleName} to ${fileName} first.`);
}

/** Load the HSK-only chain config used by the deterministic operation pipeline. */
export function loadHuskyRuntimeConfig(): HuskyRuntimeConfig {
  const rootDir = findRepoRoot();
  const testnetEnvPath = process.env.HUSKY_TESTNET_ENV_PATH?.trim()
    ? path.resolve(rootDir, process.env.HUSKY_TESTNET_ENV_PATH)
    : path.join(rootDir, ".env.testnet");
  if (!existsSync(testnetEnvPath)) {
    throw new Error(`Missing ${testnetEnvPath}. Copy .env.testnet.example to .env.testnet first.`);
  }
  // Keep shell-provided values authoritative. This file contains only public
  // testnet config for the active agent path; credentials stay with Pi.
  loadDotenv({ path: testnetEnvPath, override: false });

  const env = loadEnvConfig();
  if (env.chainId !== 133) {
    throw new Error(`Husky Agent only supports HashKey Chain Testnet (chain ID 133), got ${env.chainId}.`);
  }

  const contactsFile = configPath(rootDir, "CONTACTS_PATH", "contacts.json", "contacts.json.example");
  const tokensFile = configPath(rootDir, "TOKENS_PATH", "tokens.json", "tokens.json.example");
  const contacts = loadContacts(contactsFile);
  const loadedTokens = loadTokens(tokensFile);
  const tokens: Tokens = Object.fromEntries(
    Object.entries(loadedTokens).map(([symbol, token]) => [
      symbol,
      { ...token, native: token.native === true || symbol.toUpperCase() === "HSK" },
    ]),
  );
  const hsk = Object.entries(tokens).find(([symbol]) => symbol.toUpperCase() === "HSK");
  if (!hsk || hsk[1].address.toLowerCase() !== env.whskAddress.toLowerCase()) {
    throw new Error("tokens.json must map HSK to the configured WHSK address for swap/transfer consistency.");
  }

  const chain = defineChain({
    id: env.chainId,
    name: "HashKey Chain Testnet",
    nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
    rpcUrls: { default: { http: [env.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(env.rpcUrl) });
  const allowedContracts = new Set<Address>([env.routerAddress, env.factoryAddress]);

  return { rootDir, env, publicClient, contacts, tokens, allowedContracts };
}
