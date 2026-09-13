import type { PublicClient } from "viem";
import type { SimulationResult, UnsignedTx } from "../types/index.js";

/**
 * Simulates a tx via eth_call (through viem's estimateGas + call), never
 * sending it. A revert here means the pipeline aborts before any human-facing
 * summary is generated — see docs/04-security-policy-spec.md rule 3.
 */
export async function simulate(tx: UnsignedTx, publicClient: PublicClient): Promise<SimulationResult> {
  try {
    const [gasEstimate, callResult] = await Promise.all([
      publicClient.estimateGas({ account: tx.from, to: tx.to, data: tx.data, value: tx.value }),
      publicClient.call({ account: tx.from, to: tx.to, data: tx.data, value: tx.value }),
    ]);
    return { ok: true, gasEstimate, decodedOutput: callResult.data };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

/**
 * Simulate an approve followed by a swap in one virtual block. Two separate
 * eth_call requests run against the same latest state, so the second call
 * would still see the old allowance and provide a false failure. HSK exposes
 * `eth_simulateV1`, surfaced by viem as `simulateBlocks`, which applies the
 * first call's state changes to the next call without broadcasting anything.
 */
export async function simulateApproveAndSwap(
  approve: UnsignedTx,
  swap: UnsignedTx,
  publicClient: PublicClient,
): Promise<{ approve: SimulationResult; swap: SimulationResult }> {
  if (typeof publicClient.simulateBlocks !== "function") {
    const reason = "HSK stateful simulation (eth_simulateV1) is unavailable.";
    return { approve: { ok: false, reason }, swap: { ok: false, reason } };
  }

  try {
    const blocks = await publicClient.simulateBlocks({
      blockTag: "latest",
      blocks: [
        {
          calls: [
            { account: approve.from, to: approve.to, data: approve.data, value: approve.value },
            { account: swap.from, to: swap.to, data: swap.data, value: swap.value },
          ],
        },
      ],
    });
    const calls = blocks[0]?.calls as readonly unknown[] | undefined;
    if (!calls || calls.length < 2) {
      const reason = "HSK stateful simulation returned no results for both swap legs.";
      return { approve: { ok: false, reason }, swap: { ok: false, reason } };
    }
    return {
      approve: simulationFromBlockCall(calls[0], "approve"),
      swap: simulationFromBlockCall(calls[1], "swap"),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      approve: { ok: false, reason: `Stateful simulation failed: ${reason}` },
      swap: { ok: false, reason: `Stateful simulation failed: ${reason}` },
    };
  }
}

function simulationFromBlockCall(call: unknown, label: string): SimulationResult {
  if (!call || typeof call !== "object") {
    return { ok: false, reason: `Stateful simulation returned an invalid ${label} result.` };
  }
  const record = call as Record<string, unknown>;
  if (record.status !== "success") {
    const error = record.error instanceof Error
      ? record.error.message
      : typeof record.error === "string"
        ? record.error
        : `the ${label} call reverted`;
    return { ok: false, reason: `Stateful simulation ${label} leg failed: ${error}` };
  }

  try {
    const gasEstimate = typeof record.gasUsed === "bigint" ? record.gasUsed : BigInt(String(record.gasUsed));
    return { ok: true, gasEstimate, decodedOutput: record.data ?? record.returnData };
  } catch {
    return { ok: false, reason: `Stateful simulation returned no gas estimate for the ${label} leg.` };
  }
}
