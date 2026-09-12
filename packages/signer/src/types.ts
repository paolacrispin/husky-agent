import type { Address, Hex, TransactionSerializable } from "viem";

/**
 * Interface the rest of the app depends on. packages/core and packages/cli
 * only ever see this — never the concrete transport. See
 * docs/05-signing-spec.md.
 */
export interface Signer {
  getAddress(): Promise<Address>;
  /** Returns the fully signed, RLP-serialized transaction, ready to broadcast. */
  signTransaction(tx: TransactionSerializable): Promise<Hex>;
}

export class SignerHealthCheckError extends Error {}
