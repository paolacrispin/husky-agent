import { decodeFunctionData, decodeFunctionResult, isHex, type Address, type Hex, type PublicClient } from "viem";
import { erc20Abi, routerAbi } from "../abi/index.js";
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

function isAllowedContract(address: Address, contracts: Set<Address>): boolean {
  return [...contracts].some((candidate) => candidate.toLowerCase() === address.toLowerCase());
}

function isSameAddress(left: unknown, right: Address): boolean {
  return typeof left === "string" && left.toLowerCase() === right.toLowerCase();
}

function isSameBigInt(left: unknown, right: bigint): boolean {
  return typeof left === "bigint" && left === right;
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

    const balance = resolved.token.native
      ? await ctx.publicClient.getBalance({ address: ctx.fromAddress })
      : await ctx.publicClient.readContract({
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
 * Runs after the tx is built and simulated. Validates the simulation result,
 * target allowlists, and the actual calldata. `expected` is supplied by the
 * pipeline so a future caller cannot turn a valid generic transfer/swap into
 * a different operation after resolution.
 */
export function postSimulateCheck(
  tx: UnsignedTx,
  simulation: SimulationResult,
  ctx: PolicyContext,
  expected?: ResolvedIntent,
  expectedAmountOutMin?: bigint,
): PolicyResult {
  if (!simulation.ok) {
    return { approved: false, reason: `Simulation failed: ${simulation.reason}` };
  }

  if (!isSameAddress(tx.from, ctx.fromAddress)) {
    return { approved: false, reason: "Transaction sender does not match the configured wallet." };
  }

  if (tx.kind === "approve") {
    if (!isAllowlistedToken(tx.to, ctx.tokens)) {
      return { approved: false, reason: "Approve target is not an allowlisted token." };
    }
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      if (decoded.functionName !== "approve") {
        return { approved: false, reason: "Expected an approve call." };
      }
      const [spender, amount] = decoded.args as readonly [Address, bigint];
      if (!isSameAddress(spender, ctx.routerAddress)) {
        return { approved: false, reason: "Approve spender must be the Husky-Agent Router, nothing else." };
      }
      if (tx.value !== 0n) {
        return { approved: false, reason: "Approve transactions cannot carry native HSK." };
      }
      if (expected?.kind !== "swap") {
        return { approved: false, reason: "Approve leg is not attached to a swap plan." };
      }
      if (!isSameAddress(tx.to, expected.tokenIn.address) || !isSameBigInt(amount, expected.amountIn)) {
        return { approved: false, reason: "Approve amount or token does not match the resolved swap." };
      }
      return { approved: true };
    } catch {
      return { approved: false, reason: "Approve calldata could not be decoded." };
    }
  }

  if (tx.kind === "transfer") {
    if (tx.data === "0x") {
      if (expected?.kind !== "transfer" || !expected.token.native) {
        return { approved: false, reason: "Native transfer calldata is not attached to a native HSK intent." };
      }
      if (!isSameAddress(tx.to, expected.recipient) || tx.value !== expected.amount) {
        return { approved: false, reason: "Native transfer recipient or amount does not match the resolved intent." };
      }
      return { approved: true };
    }

    if (!isAllowlistedToken(tx.to, ctx.tokens)) {
      return { approved: false, reason: "Transfer target is not an allowlisted token." };
    }
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      if (decoded.functionName !== "transfer") {
        return { approved: false, reason: "Expected an ERC-20 transfer call." };
      }
      const [recipient, amount] = decoded.args as readonly [Address, bigint];
      if (tx.value !== 0n) {
        return { approved: false, reason: "ERC-20 transfers cannot carry native HSK." };
      }
      if (expected?.kind !== "transfer" || expected.token.native) {
        return { approved: false, reason: "ERC-20 transfer calldata is not attached to an ERC-20 intent." };
      }
      if (
        !isSameAddress(tx.to, expected.token.address) ||
        !isSameAddress(recipient, expected.recipient) ||
        !isSameBigInt(amount, expected.amount)
      ) {
        return { approved: false, reason: "Transfer calldata does not match the resolved intent." };
      }
      return { approved: true };
    } catch {
      return { approved: false, reason: "Transfer calldata could not be decoded." };
    }
  }

  if (tx.kind === "swap") {
    if (!isSameAddress(tx.to, ctx.routerAddress)) {
      return { approved: false, reason: "Swap must target the Husky-Agent Router." };
    }
    if (tx.value !== 0n) {
      return { approved: false, reason: "Token swaps cannot carry native HSK." };
    }
    try {
      const decoded = decodeFunctionData({ abi: routerAbi, data: tx.data });
      if (decoded.functionName !== "swapExactTokensForTokens") {
        return { approved: false, reason: "Expected a swapExactTokensForTokens call." };
      }
      const [amountIn, amountOutMin, path, recipient, deadline] = decoded.args as readonly [
        bigint,
        bigint,
        readonly Address[],
        Address,
        bigint,
      ];
      if (deadline <= 0n || amountOutMin < 0n || path.length !== 2 || amountIn <= 0n) {
        return { approved: false, reason: "Swap calldata contains invalid bounds." };
      }
      if (expected?.kind !== "swap") {
        return { approved: false, reason: "Swap calldata is not attached to a resolved swap." };
      }
      if (
        !isSameAddress(path[0], expected.tokenIn.address) ||
        !isSameAddress(path[1], expected.tokenOut.address) ||
        !isSameBigInt(amountIn, expected.amountIn) ||
        !isSameAddress(recipient, ctx.fromAddress)
      ) {
        return { approved: false, reason: "Swap calldata does not match the resolved intent." };
      }
      if (expectedAmountOutMin !== undefined && amountOutMin !== expectedAmountOutMin) {
        return { approved: false, reason: "Swap amountOutMin does not match the deterministic quote." };
      }

      const output = simulation.decodedOutput;
      let amounts: readonly bigint[] | undefined;
      if (Array.isArray(output) && output.every((value): value is bigint => typeof value === "bigint")) {
        amounts = output;
      } else if (isHex(output) && output !== "0x") {
        try {
          amounts = decodeFunctionResult({
            abi: routerAbi,
            functionName: "swapExactTokensForTokens",
            data: output as Hex,
          }) as readonly bigint[];
        } catch {
          return { approved: false, reason: "Swap simulation output could not be decoded." };
        }
      } else {
        return { approved: false, reason: "Swap simulation output is missing." };
      }

      const actualOutput = amounts.at(-1);
      if (actualOutput === undefined || actualOutput < amountOutMin) {
        return { approved: false, reason: "Simulated swap output is below amountOutMin." };
      }
      return { approved: true };
    } catch {
      return { approved: false, reason: "Swap calldata could not be decoded." };
    }
  }

  if (!isAllowedContract(tx.to, ctx.allowedContracts) && !isAllowlistedToken(tx.to, ctx.tokens)) {
    return { approved: false, reason: `Transaction target ${tx.to} is not on the contract allowlist.` };
  }

  return { approved: true };
}
