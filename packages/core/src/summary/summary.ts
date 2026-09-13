import { decodeFunctionData, decodeFunctionResult, formatUnits, isHex, type Address, type Hex } from "viem";
import { erc20Abi, routerAbi } from "../abi/index.js";
import type { ResolvedSwap, ResolvedTransfer, SimulationResult, UnsignedTx } from "../types/index.js";

/**
 * Every value here comes from the simulation, the decoded/built tx, or config
 * — never from the LLM. See docs/04-security-policy-spec.md for the
 * templates this implements.
 */

export function transferSummary(
  resolved: ResolvedTransfer,
  estimatedFeeWei: bigint,
  builtTx?: UnsignedTx,
): string {
  const decoded = builtTx ? decodeTransferForSummary(builtTx, resolved) : {
    amount: resolved.amount,
    recipient: resolved.recipient,
  };
  const amount = formatUnits(decoded.amount, resolved.token.decimals);
  const fee = formatUnits(estimatedFeeWei, 18);
  return (
    `You are about to transfer ${amount} ${resolved.token.symbol} to ` +
    `${resolved.recipientLabel} (${decoded.recipient}).\n` +
    `Estimated network fee: ~${fee} HSK.`
  );
}

export function swapSummary(
  resolved: ResolvedSwap,
  amountOutMin: bigint,
  amountOutEstimate: bigint,
  slippageBps: bigint,
  estimatedFeeWei: bigint,
  builtTx?: UnsignedTx,
  simulation?: SimulationResult,
): string {
  const decoded = builtTx ? decodeSwapForSummary(builtTx, resolved, amountOutMin) : {
    amountIn: resolved.amountIn,
    amountOutMin,
  };
  const simulatedOutput = simulation ? decodeSwapOutputForSummary(simulation) : undefined;
  const amountIn = formatUnits(decoded.amountIn, resolved.tokenIn.decimals);
  const min = formatUnits(decoded.amountOutMin, resolved.tokenOut.decimals);
  const estimate = formatUnits(simulatedOutput ?? amountOutEstimate, resolved.tokenOut.decimals);
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
  approveTx?: UnsignedTx,
  swapTx?: UnsignedTx,
  swapSimulation?: SimulationResult,
): string {
  const decoded = swapTx ? decodeSwapForSummary(swapTx, resolved, amountOutMin) : {
    amountIn: resolved.amountIn,
    amountOutMin,
  };
  if (approveTx) decodeApproveForSummary(approveTx, resolved);
  const simulatedOutput = swapSimulation ? decodeSwapOutputForSummary(swapSimulation) : undefined;
  const amountIn = formatUnits(decoded.amountIn, resolved.tokenIn.decimals);
  const min = formatUnits(decoded.amountOutMin, resolved.tokenOut.decimals);
  const estimate = formatUnits(simulatedOutput ?? amountOutEstimate, resolved.tokenOut.decimals);
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

type DecodedTransfer = { amount: bigint; recipient: Address };

function decodeTransferForSummary(tx: UnsignedTx, resolved: ResolvedTransfer): DecodedTransfer {
  if (tx.kind !== "transfer") throw new Error("Transfer summary received a non-transfer transaction.");
  if (resolved.token.native) {
    if (tx.data !== "0x" || tx.value !== resolved.amount || tx.to.toLowerCase() !== resolved.recipient.toLowerCase()) {
      throw new Error("Native transfer summary does not match the built transaction.");
    }
    return { amount: tx.value, recipient: tx.to };
  }

  if (tx.value !== 0n) throw new Error("ERC-20 transfer summary cannot include native value.");
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    if (decoded.functionName !== "transfer") throw new Error("Expected an ERC-20 transfer call.");
    const [recipient, amount] = decoded.args as readonly [Address, bigint];
    if (tx.to.toLowerCase() !== resolved.token.address.toLowerCase() ||
        recipient.toLowerCase() !== resolved.recipient.toLowerCase() ||
        amount !== resolved.amount) {
      throw new Error("ERC-20 transfer summary does not match the built transaction.");
    }
    return { amount, recipient };
  } catch (error) {
    if (error instanceof Error && error.message.includes("summary")) throw error;
    throw new Error("ERC-20 transfer summary calldata could not be decoded.");
  }
}

type DecodedSwap = { amountIn: bigint; amountOutMin: bigint };

function decodeSwapForSummary(
  tx: UnsignedTx,
  resolved: ResolvedSwap,
  expectedAmountOutMin: bigint,
): DecodedSwap {
  if (tx.kind !== "swap" || tx.value !== 0n) throw new Error("Swap summary received an invalid transaction.");
  try {
    const decoded = decodeFunctionData({ abi: routerAbi, data: tx.data });
    if (decoded.functionName !== "swapExactTokensForTokens") throw new Error("Expected a swap call.");
    const [amountIn, amountOutMin, path, recipient] = decoded.args as readonly [bigint, bigint, readonly Address[], Address, bigint];
    if (path.length !== 2 || amountIn !== resolved.amountIn || amountOutMin !== expectedAmountOutMin ||
        path[0].toLowerCase() !== resolved.tokenIn.address.toLowerCase() ||
        path[1].toLowerCase() !== resolved.tokenOut.address.toLowerCase() ||
        recipient.toLowerCase() !== tx.from.toLowerCase()) {
      throw new Error("Swap summary does not match the built transaction.");
    }
    return { amountIn, amountOutMin };
  } catch (error) {
    if (error instanceof Error && error.message.includes("summary")) throw error;
    throw new Error("Swap summary calldata could not be decoded.");
  }
}

function decodeApproveForSummary(tx: UnsignedTx, resolved: ResolvedSwap): void {
  if (tx.kind !== "approve" || tx.value !== 0n) throw new Error("Approve summary received an invalid transaction.");
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    if (decoded.functionName !== "approve") throw new Error("Expected an approve call.");
    const [, amount] = decoded.args as readonly [Address, bigint];
    if (tx.to.toLowerCase() !== resolved.tokenIn.address.toLowerCase() || amount !== resolved.amountIn) {
      throw new Error("Approve summary does not match the swap transaction.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("summary")) throw error;
    throw new Error("Approve summary calldata could not be decoded.");
  }
}

/** Decode the output returned by the router simulation for the estimate shown to a human. */
export function decodeSwapOutputForSummary(simulation: SimulationResult): bigint | undefined {
  if (!simulation.ok) throw new Error("Cannot summarize a failed swap simulation.");
  const output = simulation.decodedOutput;
  if (Array.isArray(output) && output.every((value): value is bigint => typeof value === "bigint")) {
    const amountOut = output.at(-1);
    if (amountOut === undefined) throw new Error("Swap simulation returned no output amount.");
    return amountOut;
  }
  if (!isHex(output) || output === "0x") throw new Error("Swap simulation output could not be decoded.");
  try {
    const amounts = decodeFunctionResult({
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      data: output as Hex,
    }) as readonly bigint[];
    const amountOut = amounts.at(-1);
    if (amountOut === undefined) throw new Error("Swap simulation returned no output amount.");
    return amountOut;
  } catch {
    throw new Error("Swap simulation output could not be decoded.");
  }
}
