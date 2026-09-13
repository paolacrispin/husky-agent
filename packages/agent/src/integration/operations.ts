import type { Address, Hash, Hex, PublicClient, TransactionSerializableEIP1559 } from "viem";
import {
  prepareSwap,
  prepareTransfer,
  type PreparedOperation,
  type PipelineConfig,
  type UnsignedTx,
} from "@husky-agent/core";
import { subscribeToFlashblocks } from "@husky-agent/flashblocks";
import { createSpeculosSigner, type Signer } from "@husky-agent/signer";
import { loadHuskyRuntimeConfig, type HuskyRuntimeConfig } from "./config.js";

export type OperationProgress = {
  message: string;
  type?: "info" | "warning" | "error";
};

export type OperationExecution = {
  hashes: Hash[];
};

export type SentLegStatus = "confirmed" | "reverted" | "unknown";

/** A transaction this process already handed to the chain. */
export type SentLeg = {
  kind: UnsignedTx["kind"];
  hash: Hash;
  /**
   * What is actually known about the outcome: a receipt confirmed it, a receipt
   * reported a revert, or the receipt was never observed and the outcome is
   * genuinely unknown (still pending, or lost to an RPC/timeout error).
   */
  status: SentLegStatus;
};

/**
 * Thrown when `execute` stops without completing the operation. Every leg that
 * reached the chain is preserved in `sent`, so an abort between legs, a revert,
 * or a receipt that could not be read can never be reported to the human as
 * "nothing was sent". An empty `sent` means no transaction was broadcast.
 */
export class OperationExecutionError extends Error {
  readonly sent: readonly SentLeg[];
  /** True when the stop was a cancellation rather than a chain or signing failure. */
  readonly aborted: boolean;

  constructor(reason: string, sent: readonly SentLeg[], aborted = false) {
    super(reason);
    this.name = "OperationExecutionError";
    this.sent = sent.map((leg) => ({ ...leg }));
    this.aborted = aborted;
  }

  get hashes(): Hash[] {
    return this.sent.map((leg) => leg.hash);
  }
}

/**
 * The active Pi shell's deterministic chain adapter. It is intentionally the
 * only module that can move from a prepared operation to a Signer call.
 */
export class HuskyOperations {
  readonly config: HuskyRuntimeConfig;
  private signerPromise: Promise<Signer> | undefined;

  constructor(config: HuskyRuntimeConfig = loadHuskyRuntimeConfig()) {
    this.config = config;
  }

  async getSigner(): Promise<Signer> {
    this.signerPromise ??= createSpeculosSigner(this.config.env.speculosTransportUrl);
    return this.signerPromise;
  }

  async getAddress(): Promise<Address> {
    return (await this.getSigner()).getAddress();
  }

  private async pipelineConfig(): Promise<PipelineConfig> {
    return {
      tokens: this.config.tokens,
      contacts: this.config.contacts,
      publicClient: this.config.publicClient,
      fromAddress: await this.getAddress(),
      routerAddress: this.config.env.routerAddress,
      factoryAddress: this.config.env.factoryAddress,
      allowedContracts: this.config.allowedContracts,
    };
  }

  async prepareTransfer(params: { token: string; amount: string; recipient: string }) {
    return prepareTransfer(params, await this.pipelineConfig());
  }

  async prepareSwap(params: { tokenIn: string; tokenOut: string; amountIn: string }) {
    return prepareSwap(params, await this.pipelineConfig());
  }

  async execute(
    operation: PreparedOperation,
    onProgress: (progress: OperationProgress) => void,
    signal?: AbortSignal,
  ): Promise<OperationExecution> {
    const signer = await this.getSigner();
    const sent: SentLeg[] = [];

    for (const leg of operation.legs) {
      const kind = leg.unsignedTx.kind;

      // Checked between legs, not only before the first one: an approval that
      // was already given must not push a second leg after an abort.
      if (signal?.aborted) {
        throw new OperationExecutionError(`Aborted before the ${kind} leg was signed.`, sent, true);
      }

      // Fetch nonce/fees immediately before signing, after approval and any
      // preceding receipt. This avoids stale nonces during a human pause.
      const tx = await finalizeForSigning(
        leg.unsignedTx,
        leg.simulation.gasEstimate,
        this.config.publicClient,
        this.config.env.chainId,
      );

      // Re-checked after that await: a cancellation landing while the nonce and
      // fees are in flight must not start a Ledger signature request.
      if (signal?.aborted) {
        throw new OperationExecutionError(`Aborted before the ${kind} leg was signed.`, sent, true);
      }

      let signedTx: Hex;
      try {
        signedTx = await signer.signTransaction(tx);
      } catch (error) {
        // A Signer failure can only happen before this leg is broadcast — but
        // an earlier leg may already be on-chain, so `sent` travels with it.
        const cause = error instanceof Error ? error.message : String(error);
        throw new OperationExecutionError(
          `Signing the ${kind} leg failed: ${cause} — nothing was broadcast for this leg.`,
          sent,
        );
      }

      let hash: Hash;
      try {
        hash = await this.config.publicClient.sendRawTransaction({ serializedTransaction: signedTx });
      } catch (error) {
        // A failed submit is not proof that nothing reached the node: the
        // signed transaction may still be in the mempool. No hash is known, so
        // this is reported as uncertain rather than as unsent.
        const cause = error instanceof Error ? error.message : String(error);
        throw new OperationExecutionError(
          `Submitting the ${kind} leg failed: ${cause}. It is not known whether the node accepted it — check the account's pending transactions before retrying.`,
          sent,
        );
      }

      // Recorded the instant the chain accepts it: every later failure must
      // still report this hash, so the leg is tracked from here on.
      const sentLeg: SentLeg = { kind, hash, status: "unknown" };
      sent.push(sentLeg);
      onProgress({ message: `${kind} submitted: ${hash}`, type: "info" });

      let preconfirmedShown = false;
      const flashblocks = subscribeToFlashblocks(
        this.config.env.flashblocksWsUrl,
        hash,
        () => {
          if (preconfirmedShown) return;
          preconfirmedShown = true;
          // Wording is deliberate: a preconfirmation is never a confirmation.
          onProgress({
            message: `⏳ Preconfirmed (HSK Flashblocks) — NOT final, awaiting the block receipt: ${hash}`,
            type: "info",
          });
        },
        (error) => {
          // Flashblocks is only a UX enhancement. A malformed message, closed
          // socket, or unavailable endpoint must never alter receipt handling
          // or be reported as an operation failure.
          onProgress({
            message: `Flashblocks preconfirmation unavailable (${error.message}); waiting for the normal HSK receipt.`,
            type: "warning",
          });
        },
      );

      try {
        // Final success comes only from this receipt — never from Flashblocks.
        let receipt;
        try {
          receipt = await this.config.publicClient.waitForTransactionReceipt({ hash });
        } catch (error) {
          // The transaction is already broadcast; only our view of its receipt
          // was lost (RPC error, or the wait timed out). The leg stays
          // "unknown" and keeps its hash — never reported as unsent.
          const cause = error instanceof Error ? error.message : String(error);
          throw new OperationExecutionError(
            `${kind} transaction ${hash} was broadcast but its receipt could not be read (${cause}); its on-chain outcome is unknown.`,
            sent,
          );
        }
        if (receipt.status !== "success") {
          sentLeg.status = "reverted";
          throw new OperationExecutionError(`${kind} transaction ${hash} reverted on-chain.`, sent);
        }
        sentLeg.status = "confirmed";
        onProgress({ message: `✅ Confirmed in block ${receipt.blockNumber}: ${hash}`, type: "info" });
      } finally {
        flashblocks.close();
      }
    }

    return { hashes: sent.map((leg) => leg.hash) };
  }

  async getBalances(): Promise<Array<{ symbol: string; balance: bigint; decimals: number }>> {
    const address = await this.getAddress();
    const balances: Array<{ symbol: string; balance: bigint; decimals: number }> = [];
    for (const [symbol, token] of Object.entries(this.config.tokens)) {
      const balance = token.native
        ? await this.config.publicClient.getBalance({ address })
        : await this.config.publicClient.readContract({
            address: token.address,
            abi: [
              {
                type: "function",
                name: "balanceOf",
                stateMutability: "view",
                inputs: [{ name: "account", type: "address" }],
                outputs: [{ name: "", type: "uint256" }],
              },
            ],
            functionName: "balanceOf",
            args: [address],
          });
      balances.push({ symbol, balance, decimals: token.decimals });
    }
    return balances;
  }
}

export async function finalizeForSigning(
  unsignedTx: UnsignedTx,
  gasEstimate: bigint,
  publicClient: PublicClient,
  chainId: number,
): Promise<TransactionSerializableEIP1559> {
  const [nonce, feesPerGas] = await Promise.all([
    publicClient.getTransactionCount({ address: unsignedTx.from, blockTag: "pending" }),
    publicClient.estimateFeesPerGas(),
  ]);

  return {
    type: "eip1559",
    chainId,
    to: unsignedTx.to,
    data: unsignedTx.data,
    value: unsignedTx.value,
    nonce,
    // Leave enough room for a small state/fee shift between simulation and send.
    gas: (gasEstimate * 120n) / 100n,
    maxFeePerGas: feesPerGas.maxFeePerGas,
    maxPriorityFeePerGas: feesPerGas.maxPriorityFeePerGas,
  };
}
