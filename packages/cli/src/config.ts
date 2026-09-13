import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";
import { loadContacts, loadEnvConfig, loadTokens, type EnvConfig } from "@husky-agent/core";

// `pnpm --filter cli dev` (and `node dist/main.js` run from anywhere) does
// NOT guarantee cwd is the repo root — pnpm sets it to packages/cli itself.
// Every config file this project uses (.env.testnet, contacts.json,
// tokens.json) lives at the repo root, so paths are anchored there
// explicitly rather than assumed relative to cwd. This file is always at
// packages/cli/src/config.ts (dev) or packages/cli/dist/config.js (built) —
// same depth either way, three levels below the repo root.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Every doc in this project (06-repo-and-tooling.md, 08-getting-started.md,
// .gitignore) uses `.env.testnet` as the real config file, not `.env` —
// dotenv's default `import "dotenv/config"` only auto-loads `.env`, so that
// convention has to be pointed at explicitly here.
loadDotenv({ path: process.env.DOTENV_PATH ?? path.join(REPO_ROOT, ".env.testnet") });

export const hskTestnet = (chainId: number, rpcUrl: string) =>
  defineChain({
    id: chainId,
    name: "HashKey Chain Testnet",
    nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

export type AppConfig = {
  env: EnvConfig;
  publicClient: PublicClient;
  contactsPath: string;
  tokensPath: string;
  contacts: ReturnType<typeof loadContacts>;
  tokens: ReturnType<typeof loadTokens>;
  allowedContracts: Set<Address>;
};

export function loadAppConfig(): AppConfig {
  const env = loadEnvConfig();
  const contactsPath = process.env.CONTACTS_PATH ?? path.join(REPO_ROOT, "contacts.json");
  const tokensPath = process.env.TOKENS_PATH ?? path.join(REPO_ROOT, "tokens.json");
  const contacts = loadContacts(contactsPath);
  const tokens = loadTokens(tokensPath);

  const publicClient = createPublicClient({
    chain: hskTestnet(env.chainId, env.rpcUrl),
    transport: http(env.rpcUrl),
  });

  const allowedContracts = new Set<Address>([env.routerAddress, env.factoryAddress]);

  return { env, publicClient, contactsPath, tokensPath, contacts, tokens, allowedContracts };
}
