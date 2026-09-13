import { encodeFunctionData, type Address, type PublicClient } from "viem";
import { erc20Abi, routerAbi } from "../abi/index.js";
import type { ResolvedTransfer, ResolvedSwap, UnsignedTx } from "../types/index.js";

/**
 * Default slippage tolerance for swaps. docs/02-contracts-spec.md still lists
 * the exact value as an open item (range given there: 0.5%-1%); 0.5% is used
 * here as the conservative default until that's closed out.
 */
export const DEFAULT_SLIPPAGE_BPS = 50n; // 0.50%
const BPS_DENOMINATOR = 10_000n;

export function buildTransfer(resolved: ResolvedTransfer, from: Address): UnsignedTx {
  if (resolved.token.native) {
    return {
      kind: "transfer",
      to: resolved.recipient,
      data: "0x",
      value: resolved.amount,
      from,
    };
  }

  return {
    kind: "transfer",
    to: resolved.token.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [resolved.recipient, resolved.amount],
    }),
    value: 0n,
    from,
  };
}

export function buildApprove(tokenAddress: Address, spender: Address, amount: bigint, from: Address): UnsignedTx {
  return {
    kind: "approve",
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    }),
    value: 0n,
    from,
  };
}

export type SwapPlan = {
  amountOutMin: bigint;
  amountOutEstimate: bigint;
  tx: UnsignedTx;
};

/**
 * Computes amountOutMin from live reserves + the fixed slippage tolerance
 * (never from the LLM — see docs/03-agent-tools-spec.md) and builds the
 * swapExactTokensForTokens calldata.
 */
export async function buildSwap(
  resolved: ResolvedSwap,
  routerAddress: Address,
  from: Address,
  publicClient: PublicClient,
  slippageBps: bigint = DEFAULT_SLIPPAGE_BPS,
  deadlineSecondsFromNow = 3600,
): Promise<SwapPlan> {
  const [reserveIn, reserveOut] = await publicClient.readContract({
    address: routerAddress,
    abi: routerAbi,
    functionName: "getReserves",
    args: [resolved.tokenIn.address, resolved.tokenOut.address],
  });

  const amountOutEstimate = await publicClient.readContract({
    address: routerAddress,
    abi: routerAbi,
    functionName: "getAmountOut",
    args: [resolved.amountIn, reserveIn, reserveOut],
  });

  const amountOutMin = (amountOutEstimate * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSecondsFromNow);

  const tx: UnsignedTx = {
    kind: "swap",
    to: routerAddress,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      args: [resolved.amountIn, amountOutMin, [resolved.tokenIn.address, resolved.tokenOut.address], from, deadline],
    }),
    value: 0n,
    from,
  };

  return { amountOutMin, amountOutEstimate, tx };
}

/** Checks current allowance to decide whether an approve leg is needed before a swap. */
export async function needsApproval(
  tokenAddress: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
  publicClient: PublicClient,
): Promise<boolean> {
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  return allowance < amount;
}
