import type { Address, PublicClient } from "viem";
import type { Contacts, PreparedOperation, PreparedTx, Tokens, UnsignedTx } from "./types/index.js";
import { resolveTransfer, resolveSwap } from "./resolver/resolve.js";
import { preBuildCheck, postSimulateCheck, type PolicyContext } from "./policy/policyEngine.js";
import { buildTransfer, buildApprove, buildSwap, needsApproval, DEFAULT_SLIPPAGE_BPS } from "./builder/build.js";
import { simulate } from "./simulate/simulate.js";
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
): Promise<{ prepared: PreparedTx } | { rejected: string }> {
  const simulation = await simulate(tx, config.publicClient);
  const policyResult = postSimulateCheck(tx, simulation, policyContext(config));
  if (!policyResult.approved) {
    return { rejected: policyResult.reason };
  }
  // policyResult.approved implies simulation.ok, narrowed for the caller.
  if (!simulation.ok) {
    return { rejected: "Unreachable: policy approved a failed simulation." };
  }
  return { prepared: { unsignedTx: tx, simulation } };
}

export async function prepareTransfer(
  params: { token: string; amount: string; recipient: string },
  config: PipelineConfig,
): Promise<PipelineResult> {
  const resolved = resolveTransfer(params, config.tokens, config.contacts);

  const preCheck = await preBuildCheck(resolved, policyContext(config));
  if (!preCheck.approved) return { status: "rejected", reason: preCheck.reason };

  const tx = buildTransfer(resolved, config.fromAddress);
  const leg = await prepareLeg(tx, config);
  if ("rejected" in leg) return { status: "rejected", reason: leg.rejected };

  const estimatedFee = await estimateFee(tx, leg.prepared.simulation.gasEstimate, config.publicClient);
  const summary = transferSummary(resolved, estimatedFee);

  return {
    status: "ready",
    operation: { kind: "transfer", resolved, legs: [leg.prepared] },
    summary,
  };
}

export async function prepareSwap(
  params: { tokenIn: string; tokenOut: string; amountIn: string },
  config: PipelineConfig,
): Promise<PipelineResult> {
  const resolved = resolveSwap(params, config.tokens);
  const slippageBps = config.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

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
    const swapLeg = await prepareLeg(swapPlan.tx, config);
    if ("rejected" in swapLeg) return { status: "rejected", reason: swapLeg.rejected };

    const estimatedFee = await estimateFee(
      swapPlan.tx,
      swapLeg.prepared.simulation.gasEstimate,
      config.publicClient,
    );
    const summary = swapSummary(resolved, swapPlan.amountOutMin, swapPlan.amountOutEstimate, slippageBps, estimatedFee);

    return {
      status: "ready",
      operation: { kind: "swap", resolved, legs: [swapLeg.prepared] },
      summary,
    };
  }

  // Insufficient allowance: build + simulate BOTH legs before showing anything
  // to the user — see "Swap with insufficient allowance" in
  // docs/04-security-policy-spec.md. Never present a combined prompt backed
  // by a swap leg that's already known to fail.
  const approveTx = buildApprove(resolved.tokenIn.address, config.routerAddress, resolved.amountIn, config.fromAddress);
  const approveLeg = await prepareLeg(approveTx, config);
  if ("rejected" in approveLeg) return { status: "rejected", reason: approveLeg.rejected };

  const swapLeg = await prepareLeg(swapPlan.tx, config);
  if ("rejected" in swapLeg) return { status: "rejected", reason: swapLeg.rejected };

  const totalFee =
    (await estimateFee(approveTx, approveLeg.prepared.simulation.gasEstimate, config.publicClient)) +
    (await estimateFee(swapPlan.tx, swapLeg.prepared.simulation.gasEstimate, config.publicClient));

  const summary = approveAndSwapSummary(resolved, swapPlan.amountOutMin, swapPlan.amountOutEstimate, slippageBps, totalFee);

  return {
    status: "ready",
    operation: { kind: "approveAndSwap", resolved, legs: [approveLeg.prepared, swapLeg.prepared] },
    summary,
  };
}
