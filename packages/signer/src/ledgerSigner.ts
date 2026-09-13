import Eth, { ledgerService } from "@ledgerhq/hw-app-eth";
import type Transport from "@ledgerhq/hw-transport";
import { serializeTransaction, type Address, type Hex, type TransactionSerializable } from "viem";
import type { Signer } from "./types";

/** Standard Ethereum default, per docs/05-signing-spec.md. */
export const DEFAULT_DERIVATION_PATH = "44'/60'/0'/0/0";

/**
 * Ask Ledger's resolver for ERC-20 metadata before signing. This enables clear
 * signing for token methods that are present in Ledger's CAL registry. The
 * custom Husky router is not registered there, so its swap calls still use
 * the device's blind-signing path (see ledger.md).
 */
const RESOLUTION_CONFIG = { erc20: true };

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
    // fetched. The custom Husky router currently has no CAL descriptor.
    const resolution = await ledgerService
      .resolveTransaction(rawTxHex, {}, RESOLUTION_CONFIG)
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
 * Parse the bare hexadecimal `v` returned by hw-app-eth's `getV` helper.
 *
 * `getV` calls `BigNumber#toString(16)`, so a value such as `"10"` means
 * hexadecimal 0x10 (16), not decimal 10. Keeping this conversion explicit
 * avoids producing an invalid signature for values whose hex representation
 * contains digits only.
 */
export function parseLedgerV(v: string): bigint {
  return BigInt(v.toLowerCase().startsWith("0x") ? v : `0x${v}`);
}
