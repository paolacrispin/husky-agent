import { decodeFunctionData, type Address, type PublicClient } from "viem";
import { erc20Abi } from "../abi/index.js";
import type { PolicyResult, ResolvedIntent, SimulationResult, Tokens, UnsignedTx } from "../types/index.js";

export type PolicyContext = {
  tokens: Tokens;
  /** Router, Factory, and known pair addresses — the only contracts a tx may target besides an allowlisted token. */
  allowedContracts: Set<Address>;
  routerAddress: Address;
  publicClient: PublicClient;
  fromAddress: Address;
};

function isAllowlistedToken(address: Address, tokens: Tokens): boolean {
  return Object.values(tokens).some((t) => t.address.toLowerCase() === address.toLowerCase());
}

/**
 * Runs before transaction assembly, on the resolved intent. Cheap, no tx
 * object exists yet. See docs/04-security-policy-spec.md rules 1, 2 (target
 * side), and 4.
 */
export async function preBuildCheck(resolved: ResolvedIntent, ctx: PolicyContext): Promise<PolicyResult> {
  if (resolved.kind === "transfer") {
    if (!isAllowlistedToken(resolved.token.address, ctx.tokens)) {
      return { approved: false, reason: `Token ${resolved.token.symbol} is not in the allowlist.` };
    }
    if (resolved.amount <= 0n) {
      return { approved: false, reason: "Amount must be greater than zero." };
    }
    const balance = await ctx.publicClient.readContract({
      address: resolved.token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [ctx.fromAddress],
    });
    if (balance < resolved.amount) {
      return {
        approved: false,
        reason: `Insufficient balance: you have ${balance.toString()} but need ${resolved.amount.toString()} (base units) of ${resolved.token.symbol}.`,
      };
    }
    return { approved: true };
  }

  // swap
  if (!isAllowlistedToken(resolved.tokenIn.address, ctx.tokens) || !isAllowlistedToken(resolved.tokenOut.address, ctx.tokens)) {
    return { approved: false, reason: "One of the swap tokens is not in the allowlist." };
  }
  if (resolved.amountIn <= 0n) {
    return { approved: false, reason: "Amount must be greater than zero." };
  }
  const balance = await ctx.publicClient.readContract({
    address: resolved.tokenIn.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [ctx.fromAddress],
  });
  if (balance < resolved.amountIn) {
    return {
      approved: false,
      reason: `Insufficient balance: you have ${balance.toString()} but need ${resolved.amountIn.toString()} (base units) of ${resolved.tokenIn.symbol}.`,
    };
  }
  return { approved: true };
}

/**
 * Runs after the tx is built and simulated. Validates the simulation result
 * and re-checks the contract/target allowlist against the actually-built
 * calldata — see docs/04-security-policy-spec.md rules 2 (approve-specific)
 * and 3.
 */
export function postSimulateCheck(tx: UnsignedTx, simulation: SimulationResult, ctx: PolicyContext): PolicyResult {
  if (!simulation.ok) {
    return { approved: false, reason: `Simulation failed: ${simulation.reason}` };
  }

  if (tx.kind === "approve") {
    if (!isAllowlistedToken(tx.to, ctx.tokens)) {
      return { approved: false, reason: "Approve target is not an allowlisted token." };
    }
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    if (decoded.functionName !== "approve") {
      return { approved: false, reason: "Expected an approve call." };
    }
    const [spender] = decoded.args;
    if (spender.toLowerCase() !== ctx.routerAddress.toLowerCase()) {
      return { approved: false, reason: "Approve spender must be the Husky-Agent Router, nothing else." };
    }
    return { approved: true };
  }

  if (tx.kind === "swap" && tx.to.toLowerCase() !== ctx.routerAddress.toLowerCase()) {
    return { approved: false, reason: "Swap must target the Husky-Agent Router." };
  }

  if (tx.kind === "transfer" && !isAllowlistedToken(tx.to, ctx.tokens)) {
    return { approved: false, reason: "Transfer target is not an allowlisted token." };
  }

  if (!ctx.allowedContracts.has(tx.to) && !isAllowlistedToken(tx.to, ctx.tokens)) {
    return { approved: false, reason: `Transaction target ${tx.to} is not on the contract allowlist.` };
  }

  return { approved: true };
}
