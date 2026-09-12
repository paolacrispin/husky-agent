import SpeculosTransport from "@ledgerhq/hw-transport-node-speculos";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import type Transport from "@ledgerhq/hw-transport";
import { LedgerSigner, DEFAULT_DERIVATION_PATH } from "./ledgerSigner";
import { SignerHealthCheckError } from "./types";

/** `SPECULOS_TRANSPORT_URL` is `host:port` — see .env.testnet.example. */
export function parseSpeculosUrl(url: string): { host: string; apduPort: number } {
  const [host, portStr] = url.split(":");
  const apduPort = Number(portStr);
  if (!host || Number.isNaN(apduPort)) {
    throw new Error(`SPECULOS_TRANSPORT_URL must be "host:port", got: ${url}`);
  }
  return { host, apduPort };
}

/**
 * Creates a Signer backed by the Speculos emulator. This is the only
 * transport used in v1 — see docs/05-signing-spec.md and CLAUDE.md's
 * non-goals (no physical hardware in scope).
 */
export async function createSpeculosSigner(
  speculosTransportUrl: string,
  path: string = DEFAULT_DERIVATION_PATH,
): Promise<LedgerSigner> {
  const { host, apduPort } = parseSpeculosUrl(speculosTransportUrl);
  const transport: Transport = await SpeculosTransport.open({ host, apduPort });
  return new LedgerSigner(transport, path);
}

/**
 * Creates a Signer backed by a physical Ledger over USB/HID. Out of scope
 * for v1 (CLAUDE.md non-goals), but exists to prove the abstraction holds:
 * swapping Speculos for real hardware is a transport change, not a logic
 * change. Not exercised by any test in this repo.
 */
export async function createNodeHidSigner(path: string = DEFAULT_DERIVATION_PATH): Promise<LedgerSigner> {
  const transport: Transport = await TransportNodeHid.create();
  return new LedgerSigner(transport, path);
}

/**
 * Health-checks the Speculos transport by attempting to open it and fetch
 * the device address. Callers should catch SignerHealthCheckError and print
 * "Speculos isn't running, run `npm run speculos:start`" per
 * docs/05-signing-spec.md, instead of surfacing a raw connection error.
 */
export async function healthCheckSpeculos(speculosTransportUrl: string): Promise<void> {
  try {
    const signer = await createSpeculosSigner(speculosTransportUrl);
    await signer.getAddress();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SignerHealthCheckError(`Speculos health check failed: ${reason}`);
  }
}
