import { describe, expect, it, vi } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { erc20Abi, routerAbi } from "./abi/index.js";
import { DEFAULT_SLIPPAGE_BPS } from "./builder/build.js";
import { prepareSwap, prepareTransfer, type PipelineConfig } from "./pipeline.js";
import { ResolutionError } from "./resolver/resolve.js";
import type { Tokens } from "./types/index.js";

const from = "0x0000000000000000000000000000000000000001" as Address;
const juan = "0x0000000000000000000000000000000000000002" as Address;
const direct = "0x0000000000000000000000000000000000000003" as Address;
const router = "0x0000000000000000000000000000000000000010" as Address;
const factory = "0x0000000000000000000000000000000000000011" as Address;
const whsk = "0x0000000000000000000000000000000000000020" as Address;
const usdc = "0x0000000000000000000000000000000000000021" as Address;
const husky = "0x0000000000000000000000000000000000000022" as Address;

const tokens: Tokens = {
  HSK: { address: whsk, decimals: 18 },
  USDC: { address: usdc, decimals: 6 },
  HUSKY: { address: husky, decimals: 18 },
};

type MockOptions = {
  nativeBalance?: bigint;
  balances?: Record<string, bigint>;
  allowance?: bigint;
  amountOutEstimate?: bigint;
  statefulCalls?: readonly {
    status: "success" | "failure";
    gasUsed?: bigint;
    data?: Hex;
    result?: unknown;
    error?: string;
  }[];
};

function swapOutput(amountIn: bigint, amountOut: bigint): Hex {
  return encodeFunctionResult({
    abi: routerAbi,
    functionName: "swapExactTokensForTokens",
    result: [amountIn, amountOut],
  });
}

function transferOutput(): Hex {
  return encodeFunctionResult({ abi: erc20Abi, functionName: "transfer", result: true });
}

function makeConfig(options: MockOptions = {}): {
  config: PipelineConfig;
  client: PublicClient & {
    readContract: ReturnType<typeof vi.fn>;
    estimateGas: ReturnType<typeof vi.fn>;
    call: ReturnType<typeof vi.fn>;
    simulateBlocks: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
  };
} {
  const amountOutEstimate = options.amountOutEstimate ?? 100_000_000_000_000_000_000n;
  const balances = Object.fromEntries(
    Object.entries(options.balances ?? { [usdc.toLowerCase()]: 1_000_000_000n }).map(([address, value]) => [
      address.toLowerCase(),
      value,
    ]),
  );
  const readContract = vi.fn(async ({ address, functionName }: { address: Address; functionName: string }) => {
    if (functionName === "balanceOf") return balances[address.toLowerCase()] ?? 0n;
    if (functionName === "allowance") return options.allowance ?? 0n;
    if (functionName === "getReserves") return [1_000_000_000_000n, 10_000_000_000_000_000_000_000n] as const;
    if (functionName === "getAmountOut") return amountOutEstimate;
    throw new Error(`Unexpected readContract(${functionName})`);
  });
  const estimateGas = vi.fn(async ({ to, data }: { to: Address; data: Hex }) => {
    if (to.toLowerCase() === router.toLowerCase()) return 87_513n;
    if (data === "0x") return 21_000n;
    return 45_896n;
  });
  const call = vi.fn(async ({ to }: { to: Address }) => ({
    data: to.toLowerCase() === router.toLowerCase() ? swapOutput(10_000_000n, amountOutEstimate) : transferOutput(),
  }));
  const simulateBlocks = vi.fn(async () => [
    {
      calls: options.statefulCalls ?? [
        { status: "success", gasUsed: 45_896n, data: transferOutput() },
        { status: "success", gasUsed: 87_513n, data: swapOutput(10_000_000n, amountOutEstimate) },
      ],
    },
  ]);
  const getBalance = vi.fn(async () => options.nativeBalance ?? 10n ** 20n);
  const client = {
    readContract,
    estimateGas,
    call,
    simulateBlocks,
    getBalance,
  } as unknown as PublicClient & {
    readContract: ReturnType<typeof vi.fn>;
    estimateGas: ReturnType<typeof vi.fn>;
    call: ReturnType<typeof vi.fn>;
    simulateBlocks: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
  };
  const config: PipelineConfig = {
    tokens,
    contacts: { juan },
    publicClient: client,
    fromAddress: from,
    routerAddress: router,
    factoryAddress: factory,
    allowedContracts: new Set([router, factory]),
    estimateFee: async (_tx, gasEstimate) => gasEstimate,
  };
  return { config, client };
}

describe("transaction preparation pipeline", () => {
  it("prepares an ERC-20 transfer to a contact from the built calldata", async () => {
    const { config } = makeConfig({ balances: { [usdc.toLowerCase()]: 10_000_000n } });

    const result = await prepareTransfer({ token: "USDC", amount: "5", recipient: "Juan" }, config);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.operation.kind).toBe("transfer");
    expect(result.operation.legs[0].unsignedTx.to).toBe(usdc);
    expect(result.operation.legs[0].unsignedTx.value).toBe(0n);
    expect(result.summary).toContain("5 USDC");
    expect(result.summary).toContain(`juan (${juan})`);
  });

  it("prepares a native HSK transfer with value and no calldata", async () => {
    const { config, client } = makeConfig({ nativeBalance: 10n ** 18n });

    const result = await prepareTransfer({ token: "HSK", amount: "0.1", recipient: direct }, config);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const tx = result.operation.legs[0].unsignedTx;
    expect(tx.to).toBe(direct);
    expect(tx.data).toBe("0x");
    expect(tx.value).toBe(100_000_000_000_000_000n);
    expect(client.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "balanceOf" }));
    expect(result.summary).toContain("0.1 HSK");
  });

  it("rejects malformed amounts and unknown recipients before any chain read", async () => {
    const { config, client } = makeConfig();

    await expect(prepareTransfer({ token: "USDC", amount: "1e3", recipient: "juan" }, config)).rejects.toThrow(
      ResolutionError,
    );
    await expect(prepareTransfer({ token: "USDC", amount: "1", recipient: "unknown" }, config)).rejects.toThrow(
      ResolutionError,
    );
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("rejects an insufficient ERC-20 balance before building", async () => {
    const { config, client } = makeConfig({ balances: { [usdc.toLowerCase()]: 1_000_000n } });

    const result = await prepareTransfer({ token: "USDC", amount: "5", recipient: "juan" }, config);

    expect(result).toEqual({
      status: "rejected",
      reason: expect.stringContaining("Insufficient balance"),
    });
    expect(client.estimateGas).not.toHaveBeenCalled();
  });

  it("quotes a swap with exactly the fixed 0.5% amountOutMin", async () => {
    const amountOutEstimate = 100_000_000_000_000_000_000n;
    const { config } = makeConfig({
      balances: { [usdc.toLowerCase()]: 20_000_000n },
      allowance: amountOutEstimate,
      amountOutEstimate,
    });

    const result = await prepareSwap({ tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10" }, config);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.operation.kind).toBe("swap");
    const tx = result.operation.legs[0].unsignedTx;
    const decoded = decodeFunctionData({
      abi: routerAbi,
      data: tx.data,
    });
    expect(decoded.functionName).toBe("swapExactTokensForTokens");
    expect((decoded.args as readonly bigint[])[0]).toBe(10_000_000n);
    expect((decoded.args as readonly bigint[])[1]).toBe(99_500_000_000_000_000_000n);
    expect(result.summary).toContain("99.5 HUSKY");
    expect(result.summary).toContain("max slippage 0.50%");
    expect(DEFAULT_SLIPPAGE_BPS).toBe(50n);
  });

  it("prepares a sufficient-allowance swap as one leg", async () => {
    const { config, client } = makeConfig({
      balances: { [usdc.toLowerCase()]: 20_000_000n },
      allowance: 20_000_000n,
    });

    const result = await prepareSwap({ tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10" }, config);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.operation.kind).toBe("swap");
    expect(result.operation.legs).toHaveLength(1);
    expect(client.simulateBlocks).not.toHaveBeenCalled();
  });

  it("uses sequential stateful simulation and exact approval for an insufficient allowance", async () => {
    const { config, client } = makeConfig({
      balances: { [usdc.toLowerCase()]: 20_000_000n },
      allowance: 0n,
    });

    const result = await prepareSwap({ tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10" }, config);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    if (result.operation.kind !== "approveAndSwap") return;
    expect(result.operation.legs).toHaveLength(2);
    const [approveLeg, swapLeg] = result.operation.legs;
    expect(approveLeg.unsignedTx.kind).toBe("approve");
    expect(swapLeg.unsignedTx.kind).toBe("swap");
    const approval = approveLeg.unsignedTx.data.slice(-64);
    expect(BigInt(`0x${approval}`)).toBe(10_000_000n);
    expect(client.simulateBlocks).toHaveBeenCalledTimes(1);
    expect(client.estimateGas).not.toHaveBeenCalled();
  });

  it("does not prepare an approve-plus-swap plan when either stateful leg fails", async () => {
    const { config, client } = makeConfig({
      balances: { [usdc.toLowerCase()]: 20_000_000n },
      allowance: 0n,
      statefulCalls: [
        { status: "success", gasUsed: 45_896n, data: transferOutput() },
        { status: "failure", gasUsed: 87_513n, error: "swap reverted" },
      ],
    });

    const result = await prepareSwap({ tokenIn: "USDC", tokenOut: "HUSKY", amountIn: "10" }, config);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toContain("Simulation failed");
  });
});
