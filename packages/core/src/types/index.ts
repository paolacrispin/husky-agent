import type { Address, Hex } from "viem";

/** Output of the resolver stage — canonical, on-chain-ready values only. */
export type ResolvedTransfer = {
  kind: "transfer";
  token: TokenConfig;
  amount: bigint;
  recipient: Address;
  recipientLabel: string;
};

export type ResolvedSwap = {
  kind: "swap";
  tokenIn: TokenConfig;
  tokenOut: TokenConfig;
  amountIn: bigint;
};

export type ResolvedIntent = ResolvedTransfer | ResolvedSwap;

export type TokenConfig = {
  symbol: string;
  address: Address;
  decimals: number;
};

export type Contacts = Record<string, Address>;
export type Tokens = Record<string, { address: Address; decimals: number }>;

/** A single unsigned transaction, before signing. */
export type UnsignedTx = {
  /** Human label for this leg, used in summaries and logs (e.g. "approve", "swap", "transfer"). */
  kind: "transfer" | "approve" | "swap";
  to: Address;
  data: Hex;
  value: bigint;
  from: Address;
};

export type SimulationResult =
  | { ok: true; gasEstimate: bigint; decodedOutput?: unknown }
  | { ok: false; reason: string };

export type PolicyResult = { approved: true } | { approved: false; reason: string };

/** One fully built + simulated leg of an operation, ready for the human-approval summary. */
export type PreparedTx = {
  unsignedTx: UnsignedTx;
  simulation: Extract<SimulationResult, { ok: true }>;
};

export type PreparedOperation =
  | { kind: "transfer"; resolved: ResolvedTransfer; legs: [PreparedTx] }
  | { kind: "swap"; resolved: ResolvedSwap; legs: [PreparedTx] }
  | { kind: "approveAndSwap"; resolved: ResolvedSwap; legs: [approve: PreparedTx, swap: PreparedTx] };
