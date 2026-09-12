import { formatUnits } from "viem";
import type { ResolvedSwap, ResolvedTransfer } from "../types/index.js";

/**
 * Every value here comes from the simulation, the decoded/built tx, or config
 * — never from the LLM. See docs/04-security-policy-spec.md for the
 * templates this implements.
 */

export function transferSummary(resolved: ResolvedTransfer, estimatedFeeWei: bigint): string {
  const amount = formatUnits(resolved.amount, resolved.token.decimals);
  const fee = formatUnits(estimatedFeeWei, 18);
  return (
    `You are about to transfer ${amount} ${resolved.token.symbol} to ` +
    `${resolved.recipientLabel} (${resolved.recipient}).\n` +
    `Estimated network fee: ~${fee} HSK.`
  );
}

export function swapSummary(
  resolved: ResolvedSwap,
  amountOutMin: bigint,
  amountOutEstimate: bigint,
  slippageBps: bigint,
  estimatedFeeWei: bigint,
): string {
  const amountIn = formatUnits(resolved.amountIn, resolved.tokenIn.decimals);
  const min = formatUnits(amountOutMin, resolved.tokenOut.decimals);
  const estimate = formatUnits(amountOutEstimate, resolved.tokenOut.decimals);
  const slippagePercent = (Number(slippageBps) / 100).toFixed(2);
  const fee = formatUnits(estimatedFeeWei, 18);
  return (
    `You are about to swap ${amountIn} ${resolved.tokenIn.symbol} for a minimum of ` +
    `${min} ${resolved.tokenOut.symbol} (estimated: ~${estimate} ${resolved.tokenOut.symbol}, ` +
    `max slippage ${slippagePercent}%). Estimated network fee: ~${fee} HSK.`
  );
}

export function approveAndSwapSummary(
  resolved: ResolvedSwap,
  amountOutMin: bigint,
  amountOutEstimate: bigint,
  slippageBps: bigint,
  totalEstimatedFeeWei: bigint,
): string {
  const amountIn = formatUnits(resolved.amountIn, resolved.tokenIn.decimals);
  const min = formatUnits(amountOutMin, resolved.tokenOut.decimals);
  const estimate = formatUnits(amountOutEstimate, resolved.tokenOut.decimals);
  const slippagePercent = (Number(slippageBps) / 100).toFixed(2);
  const fee = formatUnits(totalEstimatedFeeWei, 18);
  return (
    `This requires two on-chain transactions:\n` +
    `  1. Approve ${amountIn} ${resolved.tokenIn.symbol} for the Husky-Agent Router.\n` +
    `  2. Swap ${amountIn} ${resolved.tokenIn.symbol} for a minimum of ${min} ${resolved.tokenOut.symbol} ` +
    `(estimated: ~${estimate} ${resolved.tokenOut.symbol}, max slippage ${slippagePercent}%).\n` +
    `Estimated total network fee: ~${fee} HSK.`
  );
}
