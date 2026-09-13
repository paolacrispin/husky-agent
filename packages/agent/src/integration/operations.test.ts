import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hash, Hex, PublicClient, TransactionSerializableEIP1559 } from "viem";
import type { PreparedOperation, PreparedTx, UnsignedTx } from "@husky-agent/core";
import type { Signer } from "@husky-agent/signer";
import type { HuskyRuntimeConfig } from "./config.js";

const flashblocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  onPreconfirmed: undefined as (() => void) | undefined,
  onError: undefined as ((error: Error) => void) | undefined,
}));

vi.mock("@husky-agent/flashblocks", () => ({
  subscribeToFlashblocks: (
    _wsUrl: string,
    _hash: string,
    onPreconfirmed: () => void,
    onError?: (error: Error) => void,
  ) => {
    flashblocks.onPreconfirmed = onPreconfirmed;
    flashblocks.onError = onError;
    return flashblocks.subscribe();
  },
}));

const { HuskyOperations, OperationExecutionError } = await import("./operations.js");

const from = "0x0000000000000000000000000000000000000001" as Address;
const router = "0x0000000000000000000000000000000000000010" as Address;
const usdc = "0x0000000000000000000000000000000000000021" as Address;
const husky = "0x0000000000000000000000000000000000000022" as Address;

const approveTx: UnsignedTx = { kind: "approve", to: usdc, data: "0x095ea7b3" as Hex, value: 0n, from };
const swapTx: UnsignedTx = { kind: "swap", to: router, data: "0x38ed1739" as Hex, value: 0n, from };
const transferTx: UnsignedTx = { kind: "transfer", to: usdc, data: "0xa9059cbb" as Hex, value: 0n, from };

const approveAndSwap: PreparedOperation = {
  kind: "approveAndSwap",
  resolved: {
    kind: "swap",
    tokenIn: { symbol: "USDC", address: usdc, decimals: 6 },
    tokenOut: { symbol: "HUSKY", address: husky, decimals: 18 },
    amountIn: 10_000_000n,
  },
  legs: [
    { unsignedTx: approveTx, simulation: { ok: true, gasEstimate: 45_896n } },
    { unsignedTx: swapTx, simulation: { ok: true, gasEstimate: 87_513n } },
  ] as [PreparedTx, PreparedTx],
};

const singleTransfer: PreparedOperation = {
  kind: "transfer",
  resolved: {
    kind: "transfer",
    token: { symbol: "USDC", address: usdc, decimals: 6 },
    amount: 5_000_000n,
    recipient: "0x0000000000000000000000000000000000000002" as Address,
    recipientLabel: "juan",
  },
  legs: [{ unsignedTx: transferTx, simulation: { ok: true, gasEstimate: 45_896n } }],
};

function makeChain(options: { leg1Status?: "success" | "reverted" } = {}) {
  const sent: Hex[] = [];
  const hashes: Hash[] = [];
  const waited: Hash[] = [];
  const sendRawTransaction = vi.fn(async ({ serializedTransaction }: { serializedTransaction: Hex }) => {
    sent.push(serializedTransaction);
    // The hash the node returns, kept separately from the raw serialized bytes.
    const hash = (`0x${sent.length.toString(16).padStart(64, "0")}`) as Hash;
    hashes.push(hash);
    return hash;
  });
  const waitForTransactionReceipt = vi.fn(async ({ hash }: { hash: Hash }) => {
    waited.push(hash);
    const status = sent.length === 1 ? (options.leg1Status ?? "success") : "success";
    return { status, blockNumber: BigInt(1000 + waited.length) };
  });
  const getTransactionCount = vi.fn(async () => 7);
  const client = {
    getTransactionCount,
    estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n })),
    sendRawTransaction,
    waitForTransactionReceipt,
  } as unknown as PublicClient;
  return { client, sent, hashes, waited, getTransactionCount, sendRawTransaction, waitForTransactionReceipt };
}

function makeSigner() {
  const signed: TransactionSerializableEIP1559[] = [];
  const signer: Signer = {
    getAddress: async () => from,
    signTransaction: async (tx) => {
      signed.push(tx as TransactionSerializableEIP1559);
      return (`0x${(signed.length).toString(16).padStart(2, "0")}`) as Hex;
    },
  };
  return { signer, signed };
}

function makeOperations(client: PublicClient, signer: Signer) {
  const config = {
    rootDir: "/tmp",
    env: { chainId: 133, flashblocksWsUrl: "wss://flashblocks.invalid/ws" },
    publicClient: client,
    contacts: {},
    tokens: {},
    allowedContracts: new Set<Address>([router]),
  } as unknown as HuskyRuntimeConfig;

  const operations = new HuskyOperations(config);
  vi.spyOn(operations, "getSigner").mockResolvedValue(signer);
  return operations;
}

beforeEach(() => {
  flashblocks.subscribe.mockReset();
  flashblocks.subscribe.mockReturnValue({ close: vi.fn() });
  flashblocks.onPreconfirmed = undefined;
  flashblocks.onError = undefined;
});

describe("Husky operation execution", () => {
  it("signs, sends and confirms a single transfer leg", async () => {
    const chain = makeChain();
    const { signer, signed } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    const progress: string[] = [];

    const execution = await operations.execute(singleTransfer, (update) => progress.push(update.message));

    expect(signed).toHaveLength(1);
    expect(chain.sent).toHaveLength(1);
    expect(chain.waited).toHaveLength(1);
    expect(execution.hashes).toHaveLength(1);
    expect(progress.join("\n")).toContain("✅ Confirmed in block");
  });

  it("waits for the approve receipt before signing the swap leg", async () => {
    const chain = makeChain();
    const { signer, signed } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    const order: string[] = [];
    chain.waitForTransactionReceipt.mockImplementation(async ({ hash }: { hash: Hash }) => {
      order.push(`receipt:${chain.waited.length}`);
      chain.waited.push(hash);
      return { status: "success" as const, blockNumber: 1000n + BigInt(chain.waited.length) };
    });
    chain.sendRawTransaction.mockImplementation(async () => {
      order.push(`send:${chain.sent.length}`);
      chain.sent.push("0x" as Hex);
      return (`0x${chain.sent.length.toString(16).padStart(64, "0")}`) as Hash;
    });

    const execution = await operations.execute(approveAndSwap, () => undefined);

    // Exact order: leg 1 submitted, leg 1 receipt, leg 2 submitted, leg 2 receipt.
    expect(order).toEqual(["send:0", "receipt:0", "send:1", "receipt:1"]);
    expect(signed).toHaveLength(2);
    expect(chain.waited).toHaveLength(2);
    expect(execution.hashes).toHaveLength(2);
  });

  it("aborts before the swap leg when the approve leg reverts on-chain", async () => {
    const chain = makeChain({ leg1Status: "reverted" });
    const { signer, signed } = makeSigner();
    const operations = makeOperations(chain.client, signer);

    const failure = await operations.execute(approveAndSwap, () => undefined).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OperationExecutionError);
    expect((failure as Error).message).toMatch(/approve transaction .* reverted/);
    expect(signed).toHaveLength(1);
    expect(chain.sent).toHaveLength(1);
    expect(chain.waited).toHaveLength(1);
    // The revert was broadcast, so its hash survives in the error and is marked
    // as reverted rather than being dropped.
    expect((failure as OperationExecutionError).sent).toEqual([
      { kind: "approve", hash: chain.waited[0], status: "reverted" },
    ]);
  });

  it("keeps the confirmed approve hash, and does not send the swap, when aborted between legs", async () => {
    const chain = makeChain();
    const { signer } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    const controller = new AbortController();
    const progress: string[] = [];

    // The human approves, the approve leg is signed, sent and confirmed, and
    // only then does the cancellation land — the exact F1 window.
    const submit = chain.sendRawTransaction.getMockImplementation()!;
    chain.sendRawTransaction.mockImplementation(async (args: { serializedTransaction: Hex }) => {
      const hash = await submit(args);
      controller.abort();
      return hash;
    });
    chain.waitForTransactionReceipt.mockImplementation(async ({ hash }: { hash: Hash }) => {
      chain.waited.push(hash);
      return { status: "success" as const, blockNumber: 1234n };
    });

    const failure = await operations
      .execute(approveAndSwap, (update) => progress.push(update.message), controller.signal)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OperationExecutionError);
    expect((failure as OperationExecutionError).aborted).toBe(true);
    // Exactly one leg exists, and its hash is preserved as receipt-confirmed.
    expect((failure as OperationExecutionError).hashes).toEqual([chain.hashes[0]]);
    expect((failure as OperationExecutionError).sent).toEqual([
      { kind: "approve", hash: chain.hashes[0], status: "confirmed" },
    ]);
    // The swap leg was never signed, sent, or waited on.
    expect(chain.sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(chain.waited).toHaveLength(1);
    expect(progress.at(-1)).toContain("✅ Confirmed in block");
  });

  it("reports a broadcast transaction whose receipt could not be read as unknown, not unsent", async () => {
    const chain = makeChain();
    const { signer } = makeSigner();
    const operations = makeOperations(chain.client, signer);

    chain.waitForTransactionReceipt.mockImplementation(async () => {
      throw new Error("timed out waiting for transaction receipt");
    });

    const failure = await operations.execute(singleTransfer, () => undefined).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OperationExecutionError);
    expect((failure as Error).message).toMatch(/was broadcast but its receipt could not be read/);
    // The hash is kept and the outcome stays explicitly unknown.
    expect((failure as OperationExecutionError).sent).toEqual([
      { kind: "transfer", hash: chain.hashes[0], status: "unknown" },
    ]);
  });

  it("does not start signing when the operation is aborted while nonce and fees are in flight", async () => {
    const chain = makeChain();
    const { signer, signed } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    const controller = new AbortController();

    // The cancellation lands in the async gap between the abort check and the
    // Ledger call, so signing must not start.
    chain.getTransactionCount.mockImplementation(async () => {
      controller.abort();
      return 7;
    });

    const failure = await operations
      .execute(singleTransfer, () => undefined, controller.signal)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OperationExecutionError);
    expect((failure as OperationExecutionError).aborted).toBe(true);
    expect((failure as OperationExecutionError).sent).toEqual([]);
    expect(signed).toHaveLength(0);
    expect(chain.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("aborts before the swap leg when the signer fails on the approve leg", async () => {
    const chain = makeChain();
    const failingSigner: Signer = {
      getAddress: async () => from,
      signTransaction: vi.fn(async () => {
        throw new Error("Ledger rejected the request");
      }),
    };
    const operations = makeOperations(chain.client, failingSigner);

    await expect(operations.execute(approveAndSwap, () => undefined)).rejects.toThrow(/Ledger rejected/);

    expect(failingSigner.signTransaction).toHaveBeenCalledTimes(1);
    expect(chain.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("keeps the confirmed approve hash when the swap leg fails to sign", async () => {
    const chain = makeChain();
    // The most likely real-world version of F1: the human already approved in
    // the terminal, the approve leg confirmed, and the device then rejects the
    // second signature.
    let signatures = 0;
    const signer: Signer = {
      getAddress: async () => from,
      // The approve leg signs fine; the swap leg is rejected on the device.
      signTransaction: vi.fn(async () => {
        if (signatures++ > 0) throw new Error("Ledger rejected the request");
        return "0x01" as Hex;
      }),
    };
    const operations = makeOperations(chain.client, signer);

    const failure = await operations.execute(approveAndSwap, () => undefined).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OperationExecutionError);
    expect((failure as Error).message).toMatch(/Signing the swap leg failed/);
    // The approve leg is the one that already reached the chain.
    expect((failure as OperationExecutionError).sent).toEqual([
      { kind: "approve", hash: chain.hashes[0], status: "confirmed" },
    ]);
    expect(chain.sendRawTransaction).toHaveBeenCalledTimes(1);
  });

  it("reports an unconfirmed submit as uncertain instead of unsent", async () => {
    const chain = makeChain();
    const { signer, signed } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    chain.sendRawTransaction.mockImplementation(async () => {
      throw new Error("socket hang up");
    });

    const failure = await operations.execute(singleTransfer, () => undefined).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OperationExecutionError);
    expect((failure as Error).message).toMatch(/not known whether the node accepted it/);
    expect((failure as OperationExecutionError).sent).toEqual([]);
    expect(signed).toHaveLength(1);
  });

  it("does not start a leg once the operation has been aborted", async () => {
    const chain = makeChain();
    const { signer, signed } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    const controller = new AbortController();
    controller.abort();

    await expect(operations.execute(approveAndSwap, () => undefined, controller.signal)).rejects.toThrow(/Aborted/);

    expect(signed).toHaveLength(0);
    expect(chain.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("treats a Flashblocks preconfirmation as progress, never as finality", async () => {
    const chain = makeChain();
    const { signer } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    const progress: string[] = [];

    chain.waitForTransactionReceipt.mockImplementation(async ({ hash }: { hash: Hash }) => {
      // The preconfirmation arrives while the receipt is still pending — the
      // exact window where a premature "confirmed" claim would be a lie.
      flashblocks.onPreconfirmed?.();
      chain.waited.push(hash);
      return { status: "success" as const, blockNumber: 1000n };
    });

    await operations.execute(singleTransfer, (update) => progress.push(update.message));

    const preconfirmation = progress.find((line) => line.includes("Preconfirmed"));
    expect(preconfirmation).toBeDefined();
    expect(preconfirmation).toContain("NOT final");
    // Finality is only ever asserted by the receipt line, and it comes last.
    expect(progress.at(-1)).toContain("✅ Confirmed in block");
  });

  it("completes normally when Flashblocks is unavailable", async () => {
    const chain = makeChain();
    const { signer } = makeSigner();
    const operations = makeOperations(chain.client, signer);
    const progress: string[] = [];

    chain.waitForTransactionReceipt.mockImplementation(async ({ hash }: { hash: Hash }) => {
      flashblocks.onError?.(new Error("socket closed"));
      chain.waited.push(hash);
      return { status: "success" as const, blockNumber: 1000n };
    });

    const execution = await operations.execute(singleTransfer, (update) => progress.push(update.message));

    expect(execution.hashes).toHaveLength(1);
    expect(progress.join("\n")).toContain("Flashblocks preconfirmation unavailable");
    expect(progress.at(-1)).toContain("✅ Confirmed in block");
    expect(progress.join("\n")).not.toContain("❌");
  });
});
