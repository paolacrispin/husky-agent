import type { PublicClient } from "viem";
import type { Signer } from "@husky-agent/signer";
import type { PreparedOperation } from "@husky-agent/core";
import { subscribeToFlashblocks } from "@husky-agent/flashblocks";
import { finalizeForSigning } from "./txAssembly.js";

/**
 * Signs and sends every leg of a prepared operation in sequence (one leg for
 * transfer/swap, two for approveAndSwap — see
 * docs/04-security-policy-spec.md). Waits for each leg's real receipt before
 * moving to the next; a failed leg aborts the remaining ones rather than
 * retrying or proceeding partially.
 */
export async function sendOperation(
  operation: PreparedOperation,
  signer: Signer,
  publicClient: PublicClient,
  chainId: number,
  flashblocksWsUrl: string,
): Promise<void> {
  for (const leg of operation.legs) {
    const tx = await finalizeForSigning(leg.unsignedTx, leg.simulation.gasEstimate, publicClient, chainId);
    const signedTx = await signer.signTransaction(tx);

    const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx });
    console.log(`[${leg.unsignedTx.kind}] sent: ${txHash}`);

    let preconfirmedShown = false;
    const flashblocks = subscribeToFlashblocks(
      flashblocksWsUrl,
      txHash,
      () => {
        if (!preconfirmedShown) {
          preconfirmedShown = true;
          console.log(`⏳ Preconfirmed (HSK Flashblocks) — awaiting finality: ${txHash}`);
        }
      },
      () => {
        // Silent degradation per docs/01-architecture.md — Flashblocks is UX only.
      },
    );

    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error(`Transaction ${txHash} reverted on-chain.`);
      }
      console.log(`✅ Confirmed in block ${receipt.blockNumber}: ${txHash}`);
    } finally {
      flashblocks.close();
    }
  }
}
