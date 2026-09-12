import type { PublicClient, TransactionSerializableEIP1559 } from "viem";
import type { UnsignedTx } from "@husky-agent/core";

/**
 * Bridges a core UnsignedTx (which only knows to/data/value/from — see
 * packages/core/src/types) into a fully-specified, ready-to-sign
 * transaction: fetches a fresh nonce at send time (not at simulate time,
 * since human approval can take arbitrary time in between) and current fee
 * data.
 *
 * Uses EIP-1559 since HSK testnet is an OP Stack Bedrock+ chain (1559 is the
 * standard fee mechanism there). hskchain/references/developer-workflows.md
 * shows `forge script --broadcast --legacy` in its Foundry example, which
 * may just be a Foundry/RPC compatibility default rather than a chain
 * limitation — NOT verified against a live testnet transaction. If 1559 txs
 * are rejected, switch to a legacy TransactionSerializable here first.
 */
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
    // 20% headroom over the simulate-time estimate, since state may have
    // shifted slightly by send time.
    gas: (gasEstimate * 120n) / 100n,
    maxFeePerGas: feesPerGas.maxFeePerGas,
    maxPriorityFeePerGas: feesPerGas.maxPriorityFeePerGas,
  };
}
