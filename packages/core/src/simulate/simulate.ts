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
