import "dotenv/config";
import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";
import { loadContacts, loadEnvConfig, loadTokens, type EnvConfig } from "@husky-agent/core";

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
  const contactsPath = process.env.CONTACTS_PATH ?? "./contacts.json";
  const tokensPath = process.env.TOKENS_PATH ?? "./tokens.json";
  const contacts = loadContacts(contactsPath);
  const tokens = loadTokens(tokensPath);

  const publicClient = createPublicClient({
    chain: hskTestnet(env.chainId, env.rpcUrl),
    transport: http(env.rpcUrl),
  });

  const allowedContracts = new Set<Address>([env.routerAddress, env.factoryAddress]);

  return { env, publicClient, contactsPath, tokensPath, contacts, tokens, allowedContracts };
}
