import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { prepareTransfer } from "@husky-agent/core";
import { HuskyOperations, OperationExecutionError, type SentLeg } from "../integration/operations.js";
import type { HuskyRuntimeConfig } from "../integration/config.js";
import { createHuskyTools, type HuskyOperationsLike } from "./tools.js";

const from = "0x0000000000000000000000000000000000000001" as Address;
const juan = "0x0000000000000000000000000000000000000002" as Address;
const direct = "0x0000000000000000000000000000000000000003" as Address;
const router = "0x0000000000000000000000000000000000000010" as Address;
const factory = "0x0000000000000000000000000000000000000011" as Address;
const whsk = "0x4200000000000000000000000000000000000006" as Address;
const usdc = "0x0000000000000000000000000000000000000021" as Address;
const husky = "0x0000000000000000000000000000000000000022" as Address;

type PipelineOutput = Awaited<ReturnType<typeof prepareTransfer>>;

const swapOutputAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);
const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/** A chain client stub that records every call, so "never reached the chain" is checkable. */
function makeClient(
  options: { allowance?: bigint; amountOut?: bigint; nativeBalance?: bigint; balances?: Record<string, bigint> } = {},
) {
  const amountOut = options.amountOut ?? 100_000_000_000_000_000_000n;
  const balances = options.balances ?? {};
  const readContract = vi.fn(async ({ address, functionName }: { address: Address; functionName: string }) => {
    if (functionName === "balanceOf") return balances[address.toLowerCase()] ?? 10_000_000_000n;
    if (functionName === "allowance") return options.allowance ?? 0n;
    if (functionName === "getReserves") return [1_000_000_000_000n, 10_000_000_000_000_000_000_000n] as const;
    if (functionName === "getAmountOut") return amountOut;
    throw new Error(`Unexpected readContract(${functionName}) on ${address}`);
  });
  const estimateGas = vi.fn(async () => 45_896n);
  // eth_call returns the router's amounts array for a swap; the pipeline
  // decodes it to prove the simulated output clears amountOutMin.
  const call = vi.fn(async ({ to }: { to: Address }) => ({
    data:
      to.toLowerCase() === router.toLowerCase()
        ? encodeFunctionResult({
            abi: swapOutputAbi,
            functionName: "swapExactTokensForTokens",
            result: [10_000_000n, amountOut],
          })
        : encodeFunctionResult({ abi: erc20Abi, functionName: "transfer", result: true }),
  }));
  const getBalance = vi.fn(async () => options.nativeBalance ?? 10n ** 20n);
  const simulateBlocks = vi.fn(async () => [
    {
      calls: [
        { status: "success", gasUsed: 45_896n, data: "0x" as Hex },
        { status: "success", gasUsed: 87_513n, data: "0x" as Hex },
      ],
    },
  ]);
  // HSK's fee estimate is L2 gas + the L1 data fee from the GasPriceOracle.
  // The unreachable oracle read degrades to 0n, leaving the L2 half.
  const getGasPrice = vi.fn(async () => 1_000_000_000n);

  return {
    client: { readContract, estimateGas, call, getBalance, simulateBlocks, getGasPrice } as unknown as PublicClient,
    readContract,
    estimateGas,
    call,
    getBalance,
  };
}

/**
 * A real `HuskyOperations` whose chain access is stubbed. This keeps the test
 * honest about the thing under test — the tool → adapter → core boundary —
 * instead of asserting against a hand-written double of the adapter itself.
 */
function makeRealAdapter(client: PublicClient, env: Partial<HuskyRuntimeConfig["env"]> = {}) {
  const config = {
    rootDir: "/tmp",
    env: {
      chainId: 133,
      flashblocksWsUrl: "wss://flashblocks.invalid/ws",
      routerAddress: router,
      factoryAddress: factory,
      speculosTransportUrl: "127.0.0.1:40000",
      rpcUrl: "http://rpc.invalid",
      explorerUrl: "http://explorer.invalid",
      whskAddress: whsk,
      ...env,
    },
    publicClient: client,
    contacts: { juan },
    tokens: {
      HSK: { address: whsk, decimals: 18, native: true },
      USDC: { address: usdc, decimals: 6 },
      HUSKY: { address: husky, decimals: 18 },
    },
    allowedContracts: new Set<Address>([router, factory]),
  } as unknown as HuskyRuntimeConfig;

  const operations = new HuskyOperations(config);
  // Only the signer is faked here — it needs a live Speculos emulator, which
  // a unit test must not require. Everything else is the production adapter.
  vi.spyOn(operations, "getAddress").mockResolvedValue(from);
  return operations;
}

function makeFakeUi(options: { confirm?: boolean; hasUI?: boolean } = {}) {
  const confirm = vi.fn(async () => options.confirm ?? false);
  const ctx = {
    hasUI: options.hasUI ?? true,
    mode: "tui",
    cwd: "/tmp",
    ui: { confirm, notify: vi.fn(), setStatus: vi.fn(), setWidget: vi.fn() },
  } as unknown as ExtensionContext;
  return { ctx, confirm };
}

function toolNamed(tools: ReturnType<typeof createHuskyTools>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool ${name} is not registered.`);
  return tool;
}

async function runTool(
  tools: ReturnType<typeof createHuskyTools>,
  name: string,
  params: Record<string, unknown>,
  ctx: ExtensionContext,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return toolNamed(tools, name).execute("call-1", params as any, undefined, undefined, ctx);
}

describe("Husky tool boundary", () => {
  it("sends valid transfer parameters through the deterministic pipeline untouched", async () => {
    const { client, readContract } = makeClient();
    const adapter = makeRealAdapter(client);
    const prepareSpy = vi.spyOn(adapter, "prepareTransfer");
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: false });

    await runTool(tools, "husky_transfer", { token: "USDC", amount: "5", recipient: "juan" }, ctx);

    // The human-readable values reach `prepareTransfer` exactly as typed —
    // no base-unit conversion, address lookup, or quoting in the tool layer.
    expect(prepareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ token: "USDC", amount: "5", recipient: "juan" }),
    );

    // The built calldata is what got simulated, and it encodes the resolved
    // intent: 5 USDC (6 decimals) to the contact's address, no native value.
    const simulated = (client.call as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls[0]?.[0];
    expect(simulated).toMatchObject({ to: usdc, value: 0n });
    const decoded = decodeFunctionData({ abi: erc20Abi, data: simulated?.data as Hex });
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.args).toEqual([juan, 5_000_000n]);

    const summary = confirm.mock.calls[0]?.[1];
    expect(summary).toContain("5 USDC");
    expect(summary).toContain(`juan (${juan})`);
  });

  it("builds a native HSK transfer as value with no calldata", async () => {
    const { client, estimateGas } = makeClient({ nativeBalance: 10n ** 18n });
    const adapter = makeRealAdapter(client);
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: false });

    const result = await runTool(tools, "husky_transfer", { token: "HSK", amount: "0.001", recipient: direct }, ctx);

    expect(result.details.status).toBe("cancelled");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]?.[1]).toContain("0.001 HSK");
    // Native HSK moves as tx.value against the recipient, not as ERC-20 calldata.
    expect(estimateGas).toHaveBeenCalledWith(expect.objectContaining({ to: direct, data: "0x", value: 10n ** 15n }));
  });

  it("rejects malformed parameters before the resolver or any chain read", async () => {
    const { client, readContract, estimateGas, call } = makeClient();
    const adapter = makeRealAdapter(client);
    const prepareSpy = vi.spyOn(adapter, "prepareTransfer");
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: true });

    const malformed: Array<Record<string, unknown>> = [
      { token: "USDC", amount: "1e3", recipient: "juan" }, // exponent notation
      { token: "USDC", amount: "-5", recipient: "juan" }, // negative
      { token: "USDC", amount: "five", recipient: "juan" }, // not a number
      { token: "USDC", amount: "5", recipient: "" }, // empty recipient
      { token: "", amount: "5", recipient: "juan" }, // empty token
      { token: "USDC", amount: "5" }, // missing recipient
      { token: "USDC", amount: "5", recipient: "juan", extra: 1 }, // unknown field
      { token: "USDC", amount: 5, recipient: "juan" }, // amount as a number
    ];

    for (const params of malformed) {
      const result = await runTool(tools, "husky_transfer", params, ctx);
      expect(result.details.status).toBe("rejected");
      expect(result.details.reason).toContain("Invalid tool arguments");
    }

    expect(prepareSpy).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
    expect(estimateGas).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects a non-allowlisted token and an unknown recipient without approval", async () => {
    const { client } = makeClient();
    const adapter = makeRealAdapter(client);
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: true });

    const scam = await runTool(tools, "husky_transfer", { token: "SCAM", amount: "1", recipient: "juan" }, ctx);
    expect(scam.details.status).toBe("rejected");
    expect(scam.details.reason).toContain("not a supported token");

    const unknown = await runTool(tools, "husky_transfer", { token: "USDC", amount: "1", recipient: "nobody" }, ctx);
    expect(unknown.details.status).toBe("rejected");
    expect(unknown.details.reason).toContain("not a valid address");

    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks for the missing values instead of inventing them when params are absent", async () => {
    const { client } = makeClient();
    const adapter = makeRealAdapter(client);
    const prepareTransferSpy = vi.spyOn(adapter, "prepareTransfer");
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: true });

    // "send something to juan": the model must ask rather than emit a
    // placeholder tool call. If it emits one anyway, the tool rejects it.
    const result = await runTool(tools, "husky_transfer", { token: "", amount: "", recipient: "juan" }, ctx);
    expect(result.details.status).toBe("rejected");
    expect(prepareTransferSpy).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects an underfunded transfer before building or simulating anything", async () => {
    // 1 USDC held, 5 requested: the balance rule fires before any tx object
    // exists, so there is nothing to simulate and nothing to approve.
    const { client, estimateGas, call } = makeClient({ balances: { [usdc.toLowerCase()]: 1_000_000n } });
    const adapter = makeRealAdapter(client);
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: true });

    const result = await runTool(tools, "husky_transfer", { token: "USDC", amount: "5", recipient: "juan" }, ctx);

    expect(result.details).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("Insufficient balance"),
    });
    expect(estimateGas).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("runs a swap through the deterministic quote path and never accepts slippage input", async () => {
    const amountOut = 100_000_000_000_000_000_000n;
    const { client, readContract } = makeClient({ allowance: 20_000_000n, amountOut });
    const adapter = makeRealAdapter(client);
    const prepareSpy = vi.spyOn(adapter, "prepareSwap");
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: false });

    await runTool(tools, "husky_swap", { tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10" }, ctx);
    expect(prepareSpy).toHaveBeenCalledWith({ tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10" });
    // 0.50% of the live quote, computed by core from the pool reserves.
    expect(confirm.mock.calls[0]?.[1]).toContain("minimum of 99.5 HUSKY");
    expect(confirm.mock.calls[0]?.[1]).toContain("max slippage 0.50%");

    // A model that tries to set slippage or calldata is rejected outright.
    const smuggled = await runTool(
      tools,
      "husky_swap",
      { tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10", slippageBps: "500" },
      ctx,
    );
    expect(smuggled.details.status).toBe("rejected");
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    expect(readContract).toHaveBeenCalled();
  });

  it("executes nothing when the human rejects the approval prompt", async () => {
    const { client } = makeClient();
    const adapter = makeRealAdapter(client);
    const executeSpy = vi.spyOn(adapter, "execute");
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ confirm: false });

    const result = await runTool(tools, "husky_transfer", { token: "USDC", amount: "5", recipient: "juan" }, ctx);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.details.status).toBe("cancelled");
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining("nothing was signed or sent") });
  });

  it("fails closed when the session has no human dialog to approve with", async () => {
    const { client } = makeClient();
    const adapter = makeRealAdapter(client);
    const executeSpy = vi.spyOn(adapter, "execute");
    const tools = createHuskyTools(async () => adapter);
    const { ctx, confirm } = makeFakeUi({ hasUI: false, confirm: true });

    const result = await runTool(tools, "husky_transfer", { token: "USDC", amount: "5", recipient: "juan" }, ctx);

    expect(confirm).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ status: "rejected", reason: expect.stringContaining("human approval") });
  });

  it("signs and reports the confirmed hashes after approval", async () => {
    const { client } = makeClient();
    const adapter = makeRealAdapter(client);
    const proof = { status: "ready", operation: { kind: "transfer" } } as unknown as PipelineOutput;
    const fake: HuskyOperationsLike = {
      prepareTransfer: vi.fn(async () => proof),
      prepareSwap: vi.fn(),
      execute: vi.fn(async () => ({ hashes: ["0xabc"] })),
      getAddress: vi.fn(async () => from),
      getBalances: vi.fn(async () => []),
    };
    const tools = createHuskyTools(async () => fake);
    const { ctx } = makeFakeUi({ confirm: true });

    const result = await runTool(tools, "husky_transfer", { token: "USDC", amount: "5", recipient: "juan" }, ctx);

    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(result.details).toMatchObject({ status: "confirmed", hashes: ["0xabc"] });
    // The adapter, not the tool, decides what a leg looks like.
    expect(adapter.getAddress).toBeDefined();
  });

  /**
   * F1: once a leg has been broadcast, no later failure may be reported as a
   * rejection or as "nothing was sent" — the hashes must survive to the tool
   * boundary, in `details` and in the text the model relays.
   */
  describe("failures after broadcast", () => {
    const approveHash = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const swapHash = "0x2222222222222222222222222222222222222222222222222222222222222222";

    function failingAdapter(prepare: "transfer" | "swap", error: OperationExecutionError) {
      const proof = {
        status: "ready",
        operation: { kind: prepare === "swap" ? "approveAndSwap" : "transfer" },
        summary: prepare === "swap" ? "Swap 10 USDC for at least 99.5 HUSKY." : "Send 5 USDC to juan.",
      } as unknown as PipelineOutput;
      const adapter: HuskyOperationsLike = {
        prepareTransfer: vi.fn(async () => proof),
        prepareSwap: vi.fn(async () => proof),
        execute: vi.fn(async () => {
          throw error;
        }),
        getAddress: vi.fn(async () => from),
        getBalances: vi.fn(async () => []),
      };
      return adapter;
    }

    function textOf(result: { content: ReadonlyArray<{ type: string }> }): string {
      return result.content.map((block) => (block as { text?: string }).text ?? "").join("\n");
    }

    async function runFailing(prepare: "transfer" | "swap", error: OperationExecutionError) {
      const adapter = failingAdapter(prepare, error);
      const tools = createHuskyTools(async () => adapter);
      const { ctx } = makeFakeUi({ confirm: true });
      const params =
        prepare === "swap"
          ? { tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10" }
          : { token: "USDC", amount: "5", recipient: "juan" };
      return runTool(tools, prepare === "swap" ? "husky_swap" : "husky_transfer", params, ctx);
    }

    it("reports an abort after the approve leg confirmed as partial, keeping the hash", async () => {
      const result = await runFailing(
        "swap",
        new OperationExecutionError("Aborted before the swap leg was signed.", [
          { kind: "approve", hash: approveHash, status: "confirmed" },
        ], true),
      );
      const text = textOf(result);

      expect(result.details.status).toBe("failed");
      expect(result.details.hashes).toEqual([approveHash]);
      expect(result.details.sent).toEqual([{ kind: "approve", hash: approveHash, status: "confirmed" }]);
      expect(text).toContain(approveHash);
      expect(text).toContain("receipt-confirmed");
      expect(text).toContain("do not resend");
      // Never a rejection, and never the "nothing was signed or sent" wording.
      expect(text).not.toContain("❌");
      expect(text).not.toContain("nothing was signed or sent");
      // No automatic retry: a fresh approval is required.
      expect(text).toContain("fresh explicit human approval");
    });

    it("reports a broadcast leg that reverted with its hash, not as unsent", async () => {
      const sent: SentLeg[] = [{ kind: "transfer", hash: approveHash, status: "reverted" }];
      const result = await runFailing(
        "transfer",
        new OperationExecutionError(`transfer transaction ${approveHash} reverted on-chain.`, sent),
      );
      const text = textOf(result);

      expect(result.details.status).toBe("failed");
      expect(result.details.hashes).toEqual([approveHash]);
      expect(result.details.sent).toEqual(sent);
      expect(text).toContain(approveHash);
      expect(text).toContain("reverted on-chain");
      expect(text).toContain("do not resend");
      expect(text).not.toContain("nothing was signed or sent");
    });

    it("reports an unread receipt as unknown confirmation while keeping both hashes", async () => {
      const sent: SentLeg[] = [
        { kind: "approve", hash: approveHash, status: "confirmed" },
        { kind: "swap", hash: swapHash, status: "unknown" },
      ];
      const result = await runFailing(
        "swap",
        new OperationExecutionError(
          `swap transaction ${swapHash} was broadcast but its receipt could not be read (timed out); its on-chain outcome is unknown.`,
          sent,
        ),
      );
      const text = textOf(result);

      expect(result.details.status).toBe("failed");
      expect(result.details.hashes).toEqual([approveHash, swapHash]);
      // The receipt-confirmed leg history is kept alongside the uncertain one.
      expect(result.details.sent).toEqual(sent);
      expect(text).toContain(approveHash);
      expect(text).toContain("receipt-confirmed");
      expect(text).toContain(swapHash);
      expect(text).toContain("UNKNOWN");
      expect(text).toContain("explorer");
      expect(text).not.toContain("nothing was signed or sent");
    });

    it("keeps the confirmed hash when the swap leg is rejected on the signing device", async () => {
      const result = await runFailing(
        "swap",
        new OperationExecutionError("Signing the swap leg failed: Ledger rejected the request.", [
          { kind: "approve", hash: approveHash, status: "confirmed" },
        ]),
      );
      const text = textOf(result);

      expect(result.details.status).toBe("failed");
      expect(result.details.hashes).toEqual([approveHash]);
      expect(text).toContain(approveHash);
      expect(text).toContain("receipt-confirmed");
      expect(text).not.toContain("nothing was signed or sent");
      // A signer failure is not a cancellation, so it must not claim otherwise.
      expect(text).not.toContain("was cancelled");
      expect(text).toContain("fresh explicit human approval");
    });

    it("still reports a pre-broadcast cancellation as cancelled with no hashes", async () => {
      const result = await runFailing(
        "swap",
        new OperationExecutionError("Aborted before the approve leg was signed.", [], true),
      );

      expect(result.details.status).toBe("cancelled");
      expect(result.details.hashes).toBeUndefined();
      expect(textOf(result)).toContain("nothing was signed or sent");
    });
  });

  it("never labels an aborted read-only tool as a transfer (F2)", async () => {
    const { client } = makeClient();
    const adapter = makeRealAdapter(client);
    const tools = createHuskyTools(async () => adapter);
    const { ctx } = makeFakeUi();
    const controller = new AbortController();
    controller.abort();

    for (const name of ["husky_wallet_status", "husky_balances"]) {
      const result = await toolNamed(tools, name).execute("call-1", {} as never, controller.signal, undefined, ctx);
      expect(result.details.status).toBe("cancelled");
      expect(result.details.operation).toBeUndefined();
    }
  });
});
