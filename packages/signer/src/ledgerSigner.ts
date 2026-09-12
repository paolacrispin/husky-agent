import Eth, { ledgerService } from "@ledgerhq/hw-app-eth";
import type Transport from "@ledgerhq/hw-transport";
import { serializeTransaction, type Address, type Hex, type TransactionSerializable } from "viem";
import type { Signer } from "./types";

/** Standard Ethereum default, per docs/05-signing-spec.md. */
export const DEFAULT_DERIVATION_PATH = "44'/60'/0'/0/0";

/**
 * Signer backed by a Ledger Ethereum app, over any Transport implementation.
 * The only thing that changes between Speculos and a physical device is the
 * transport passed in here — see createSpeculosSigner / createNodeHidSigner.
 */
export class LedgerSigner implements Signer {
  private readonly eth: Eth;
  private readonly path: string;
  private cachedAddress: Address | undefined;

  constructor(transport: Transport, path: string = DEFAULT_DERIVATION_PATH) {
    this.eth = new Eth(transport);
    this.path = path;
  }

  async getAddress(): Promise<Address> {
    if (this.cachedAddress) return this.cachedAddress;
    const { address } = await this.eth.getAddress(this.path);
    this.cachedAddress = address as Address;
    return this.cachedAddress;
  }

  async signTransaction(tx: TransactionSerializable): Promise<Hex> {
    const unsignedSerialized = serializeTransaction(tx);
    const rawTxHex = unsignedSerialized.slice(2); // Ledger expects hex without the 0x prefix

    // Falls back to blind signing (still functional, less user-friendly on
    // the device screen) if resolution/clear-signing metadata can't be
    // fetched — see docs/05-signing-spec.md open items re: app version.
    const resolution = await ledgerService
      .resolveTransaction(rawTxHex, {}, {})
      .catch(() => null);

    const { r, s, v } = await this.eth.signTransaction(this.path, rawTxHex, resolution);

    return serializeTransaction(tx, {
      r: `0x${r}` as Hex,
      s: `0x${s}` as Hex,
      v: parseLedgerV(v),
    });
  }
}

/**
 * hw-app-eth's `signTransaction` types `v` as a plain string, but different
 * app-eth/firmware versions have been observed returning it as either a
 * decimal string ("28") or bare hex ("1c"). NOT verified against a live
 * Speculos instance — see the "confirm Ledger app version" open item in
 * docs/05-signing-spec.md. If signed transactions are rejected as invalid,
 * check this parsing first.
 */
function parseLedgerV(v: string): bigint {
  return /^[0-9]+$/.test(v) ? BigInt(v) : BigInt(`0x${v}`);
}
