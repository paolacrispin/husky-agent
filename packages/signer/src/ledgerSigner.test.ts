import { describe, expect, it, vi } from "vitest";

const ledgerMocks = vi.hoisted(() => ({
  resolveTransaction: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("@ledgerhq/hw-app-eth", () => ({
  default: class MockEth {
    constructor(_transport: unknown) {}
    signTransaction = ledgerMocks.signTransaction;
  },
  ledgerService: { resolveTransaction: ledgerMocks.resolveTransaction },
}));

import { LedgerSigner, parseLedgerV } from "./ledgerSigner";

describe("parseLedgerV", () => {
  it("treats the bare value from hw-app-eth as hexadecimal", () => {
    expect(parseLedgerV("10")).toBe(0x10n);
    expect(parseLedgerV("1c")).toBe(0x1cn);
  });

  it("also accepts a 0x prefix", () => {
    expect(parseLedgerV("0x12d")).toBe(301n);
  });
});

describe("LedgerSigner resolution", () => {
  it("requests ERC-20 metadata before signing", async () => {
    ledgerMocks.resolveTransaction.mockResolvedValue({
      nfts: [],
      erc20Tokens: [],
      externalPlugin: [],
      plugin: [],
      domains: [],
    });
    ledgerMocks.signTransaction.mockResolvedValue({
      r: "00".repeat(32),
      s: "00".repeat(32),
      v: "10",
    });

    const signer = new LedgerSigner({} as never);
    await signer.signTransaction({
      type: "eip1559",
      chainId: 133,
      nonce: 0,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      gas: 21_000n,
      to: "0x0000000000000000000000000000000000000001",
      value: 0n,
    });

    expect(ledgerMocks.resolveTransaction).toHaveBeenCalledWith(
      expect.any(String),
      {},
      { erc20: true },
    );
  });
});
