import { isAddress, parseUnits, type Address } from "viem";
import type { Contacts, ResolvedIntent, TokenConfig, Tokens } from "../types/index.js";

export class ResolutionError extends Error {}

/**
 * Resolves a `recipient` string (from the transfer tool call) to an address.
 * Contacts first, then a direct 0x address — see docs/03-agent-tools-spec.md.
 * ENS is deliberately outside the deterministic v1 resolver.
 */
export function resolveRecipient(
  recipient: string,
  contacts: Contacts,
): { address: Address; label: string } {
  const alias = Object.keys(contacts).find((name) => name.toLowerCase() === recipient.toLowerCase());
  if (alias) {
    return { address: contacts[alias], label: alias };
  }
  // strict: false — accept any 0x + 40 hex chars, matching the pure format
  // check in docs/03-agent-tools-spec.md. Requiring EIP-55 checksum casing
  // here would reject perfectly valid lowercase addresses a user pastes in.
  if (isAddress(recipient, { strict: false })) {
    return { address: recipient as Address, label: "address" };
  }
  throw new ResolutionError(`I don't recognize '${recipient}' and it's not a valid address.`);
}

/** Resolves a token symbol (case-insensitive) against the tokens.json allowlist. */
export function resolveToken(symbol: string, tokens: Tokens): TokenConfig {
  const key = Object.keys(tokens).find((s) => s.toLowerCase() === symbol.toLowerCase());
  if (!key) {
    throw new ResolutionError(`'${symbol}' is not a supported token.`);
  }
  // Keep old tokens.json files working while making the native-vs-WHSK rule
  // explicit: the HSK symbol is native for transfers, but its configured
  // address is the WHSK ERC-20 used by swaps.
  return { symbol: key, ...tokens[key], native: tokens[key].native === true || key.toUpperCase() === "HSK" };
}

/** Converts a human-readable amount string (e.g. "10.5") to wei/base units using the token's decimals. */
export function resolveAmount(amount: string, decimals: number): bigint {
  try {
    if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("invalid decimal");
    return parseUnits(amount, decimals);
  } catch {
    throw new ResolutionError(`'${amount}' is not a valid amount.`);
  }
}

export function resolveTransfer(
  params: { token: string; amount: string; recipient: string },
  tokens: Tokens,
  contacts: Contacts,
): Extract<ResolvedIntent, { kind: "transfer" }> {
  const token = resolveToken(params.token, tokens);
  const amount = resolveAmount(params.amount, token.decimals);
  const { address, label } = resolveRecipient(params.recipient, contacts);
  return { kind: "transfer", token, amount, recipient: address, recipientLabel: label };
}

export function resolveSwap(
  params: { tokenIn: string; tokenOut: string; amountIn: string },
  tokens: Tokens,
): Extract<ResolvedIntent, { kind: "swap" }> {
  const tokenIn = resolveToken(params.tokenIn, tokens);
  const tokenOut = resolveToken(params.tokenOut, tokens);
  const amountIn = resolveAmount(params.amountIn, tokenIn.decimals);
  return { kind: "swap", tokenIn, tokenOut, amountIn };
}
