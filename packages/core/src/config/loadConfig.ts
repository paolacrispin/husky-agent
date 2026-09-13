import { readFileSync } from "node:fs";
import type { Address } from "viem";
import { ContactsSchema, TokensSchema } from "./schema.js";
import type { Contacts, Tokens } from "../types/index.js";

/**
 * Loads and validates contacts.json / tokens.json from disk. Both files are
 * plain config, never LLM input — but AGENTS.md's schema-validation
 * convention still applies to anything that ends up feeding the resolver.
 */
export function loadContacts(path: string): Contacts {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return ContactsSchema.parse(raw) as Record<string, Address>;
}

export function loadTokens(path: string): Tokens {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return TokensSchema.parse(raw) as Tokens;
}

export type EnvConfig = {
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
  whskAddress: Address;
  routerAddress: Address;
  factoryAddress: Address;
  flashblocksWsUrl: string;
  speculosTransportUrl: string;
};

const requiredAddress = /^0x[a-fA-F0-9]{40}$/;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireAddressEnv(name: string): Address {
  const value = requireEnv(name);
  if (!requiredAddress.test(value)) {
    throw new Error(`Environment variable ${name} is not a valid 0x address: ${value}`);
  }
  return value as Address;
}

export function loadEnvConfig(): EnvConfig {
  return {
    rpcUrl: requireEnv("HSK_TESTNET_RPC_URL"),
    chainId: Number(requireEnv("HSK_TESTNET_CHAIN_ID")),
    explorerUrl: requireEnv("HSK_TESTNET_EXPLORER_URL"),
    whskAddress: requireAddressEnv("WHSK_ADDRESS"),
    routerAddress: requireAddressEnv("HUSKY_AGENT_ROUTER_ADDRESS"),
    factoryAddress: requireAddressEnv("HUSKY_AGENT_FACTORY_ADDRESS"),
    flashblocksWsUrl: requireEnv("HSK_FLASHBLOCKS_WS_URL"),
    speculosTransportUrl: requireEnv("SPECULOS_TRANSPORT_URL"),
  };
}
