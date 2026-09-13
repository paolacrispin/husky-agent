import type { Address, PublicClient } from "viem";
import type { Contacts, PreparedOperation, PreparedTx, ResolvedIntent, Tokens, UnsignedTx } from "./types/index.js";
import { resolveTransfer, resolveSwap, ResolutionError } from "./resolver/resolve.js";
import { preBuildCheck, postSimulateCheck, type PolicyContext } from "./policy/policyEngine.js";
import { buildTransfer, buildApprove, buildSwap, needsApproval, DEFAULT_SLIPPAGE_BPS } from "./builder/build.js";
import { simulate, simulateApproveAndSwap } from "./simulate/simulate.js";
import { estimateFee } from "./simulate/estimateFee.js";
import { transferSummary, swapSummary, approveAndSwapSummary } from "./summary/summary.js";

export type PipelineConfig = {
  tokens: Tokens;
  contacts: Contacts;
  publicClient: PublicClient;
  fromAddress: Address;
  routerAddress: Address;
  factoryAddress: Address;
  /** Router, Factory, and known pair addresses. */
  allowedContracts: Set<Address>;
  slippageBps?: bigint;
  /** Optional test seam for fee estimation; production uses HSK's gas + L1 oracle estimate. */
  estimateFee?: typeof estimateFee;
};

export type PipelineResult =
  | { status: "rejected"; reason: string }
  | { status: "ready"; operation: PreparedOperation; summary: string };

function policyContext(config: PipelineConfig): PolicyContext {
  return {
    tokens: config.tokens,
    allowedContracts: config.allowedContracts,
    routerAddress: config.routerAddress,
    publicClient: config.publicClient,
    fromAddress: config.fromAddress,
  };
}

async function prepareLeg(
  tx: UnsignedTx,
  config: PipelineConfig,
  expected?: ResolvedIntent,
  expectedAmountOutMin?: bigint,
): Promise<{ prepared: PreparedTx } | { rejected: string }> {
  const simulation = await simulate(tx, config.publicClient);
  const policyResult = postSimulateCheck(tx, simulation, policyContext(config), expected, expectedAmountOutMin);
  if (!policyResult.approved) {
    return { rejected: policyResult.reason };
  }
  // policyResult.approved implies simulation.ok, narrowed for the caller.
  if (!simulation.ok) {
    return { rejected: "Unreachable: policy approved a failed simulation." };
  }
  return { prepared: { unsignedTx: tx, simulation } };
}

async function estimate(tx: UnsignedTx, gasEstimate: bigint, config: PipelineConfig): Promise<bigint> {
  return (config.estimateFee ?? estimateFee)(tx, gasEstimate, config.publicClient);
}

/**
 * Check the native HSK needed for fees after simulation. For a native transfer
 * the value and fee must both fit; ERC-20 operations only need the fee. This
 * runs before the summary/approval boundary, so a doomed operation never asks
 * the human to approve it.
 */
async function checkNativeFunds(
  config: PipelineConfig,
  operationValue: bigint,
  estimatedFee: bigint,
): Promise<string | undefined> {
  const balance = await config.publicClient.getBalance({ address: config.fromAddress });
  if (balance < operationValue + estimatedFee) {
    return `Insufficient native HSK for amount and fees: you have ${balance.toString()} wei but need at least ${(operationValue + estimatedFee).toString()} wei.`;
  }
  return undefined;
}

export async function prepareTransfer(
  params: { token: string; amount: string; recipient: string },
  config: PipelineConfig,
): Promise<PipelineResult> {
  const resolved = resolveTransfer(params, config.tokens, config.contacts);

  try {
    const preCheck = await preBuildCheck(resolved, policyContext(config));
    if (!preCheck.approved) return { status: "rejected", reason: preCheck.reason };

    const tx = buildTransfer(resolved, config.fromAddress);
    const leg = await prepareLeg(tx, config, resolved);
    if ("rejected" in leg) return { status: "rejected", reason: leg.rejected };

    const estimatedFee = await estimate(tx, leg.prepared.simulation.gasEstimate, config);
    const fundsError = await checkNativeFunds(config, tx.value, estimatedFee);
    if (fundsError) return { status: "rejected", reason: fundsError };
    const summary = transferSummary(resolved, estimatedFee, tx);

    return {
      status: "ready",
      operation: { kind: "transfer", resolved, legs: [leg.prepared] },
      summary,
    };
  } catch (error) {
    if (error instanceof ResolutionError) throw error;
    return { status: "rejected", reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function prepareSwap(
  params: { tokenIn: string; tokenOut: string; amountIn: string },
  config: PipelineConfig,
): Promise<PipelineResult> {
  const resolved = resolveSwap(params, config.tokens);
  const configuredSlippageBps = config.slippageBps;
  if (configuredSlippageBps !== undefined && configuredSlippageBps !== DEFAULT_SLIPPAGE_BPS) {
    return { status: "rejected", reason: "Swap slippage is fixed at 0.50%." };
  }
  const slippageBps = DEFAULT_SLIPPAGE_BPS;

  try {
    const preCheck = await preBuildCheck(resolved, policyContext(config));
    if (!preCheck.approved) return { status: "rejected", reason: preCheck.reason };

    const swapPlan = await buildSwap(
      resolved,
      config.routerAddress,
      config.fromAddress,
      config.publicClient,
      slippageBps,
    );

    const requiresApproval = await needsApproval(
      resolved.tokenIn.address,
      config.fromAddress,
      config.routerAddress,
      resolved.amountIn,
      config.publicClient,
    );

    if (!requiresApproval) {
      const swapLeg = await prepareLeg(swapPlan.tx, config, resolved, swapPlan.amountOutMin);
      if ("rejected" in swapLeg) return { status: "rejected", reason: swapLeg.rejected };

      const estimatedFee = await estimate(swapPlan.tx, swapLeg.prepared.simulation.gasEstimate, config);
      const fundsError = await checkNativeFunds(config, 0n, estimatedFee);
      if (fundsError) return { status: "rejected", reason: fundsError };
      const summary = swapSummary(
        resolved,
        swapPlan.amountOutMin,
        swapPlan.amountOutEstimate,
        slippageBps,
        estimatedFee,
        swapPlan.tx,
        swapLeg.prepared.simulation,
      );

      return {
        status: "ready",
        operation: { kind: "swap", resolved, legs: [swapLeg.prepared] },
        summary,
      };
    }

    // Insufficient allowance: simulate both calls in one virtual block so the
    // swap sees the approval's state change. Never use two independent eth_call
    // requests here: the second request would still see the old allowance.
    const approveTx = buildApprove(resolved.tokenIn.address, config.routerAddress, resolved.amountIn, config.fromAddress);
    const simulations = await simulateApproveAndSwap(approveTx, swapPlan.tx, config.publicClient);
    const approvePolicy = postSimulateCheck(approveTx, simulations.approve, policyContext(config), resolved);
    if (!approvePolicy.approved) return { status: "rejected", reason: approvePolicy.reason };
    const swapPolicy = postSimulateCheck(
      swapPlan.tx,
      simulations.swap,
      policyContext(config),
      resolved,
      swapPlan.amountOutMin,
    );
    if (!swapPolicy.approved) return { status: "rejected", reason: swapPolicy.reason };
    if (!simulations.approve.ok || !simulations.swap.ok) {
      return { status: "rejected", reason: "Stateful simulation approved neither swap leg." };
    }

    const approveFee = await estimate(approveTx, simulations.approve.gasEstimate, config);
    const swapFee = await estimate(swapPlan.tx, simulations.swap.gasEstimate, config);
    const totalFee = approveFee + swapFee;
    const fundsError = await checkNativeFunds(config, 0n, totalFee);
    if (fundsError) return { status: "rejected", reason: fundsError };

    const approveLeg: PreparedTx = { unsignedTx: approveTx, simulation: simulations.approve };
    const swapLeg: PreparedTx = { unsignedTx: swapPlan.tx, simulation: simulations.swap };
    const summary = approveAndSwapSummary(
      resolved,
      swapPlan.amountOutMin,
      swapPlan.amountOutEstimate,
      slippageBps,
      totalFee,
      approveTx,
      swapPlan.tx,
      simulations.swap,
    );

    return {
      status: "ready",
      operation: { kind: "approveAndSwap", resolved, legs: [approveLeg, swapLeg] },
      summary,
    };
  } catch (error) {
    if (error instanceof ResolutionError) throw error;
    return { status: "rejected", reason: error instanceof Error ? error.message : String(error) };
  }
}
