import type { AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext, ExtensionFactory, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { formatUnits, isHash } from "viem";
import { z } from "zod";
import {
  ResolutionError,
  type PipelineResult,
  type PreparedOperation,
} from "@husky-agent/core";
import {
  HuskyOperations,
  OperationExecutionError,
  type OperationProgress,
  type SentLeg,
  type SentLegStatus,
} from "../integration/operations.js";

/**
 * The only write inputs accepted by the active Pi shell. Pi validates these
 * values against the TypeBox schemas before invoking a tool; the zod schemas
 * below are an independent application check at the LLM boundary.
 */
export const TransferInput = z
  .object({
    token: z.string().min(1),
    amount: z.string().regex(/^\d+(\.\d+)?$/, "must be a decimal amount"),
    recipient: z.string().min(1),
  })
  .strict();

export const SwapInput = z
  .object({
    tokenIn: z.string().min(1),
    tokenOut: z.string().min(1),
    amountIn: z.string().regex(/^\d+(\.\d+)?$/, "must be a decimal amount"),
  })
  .strict();

const transferParameters = Type.Object(
  {
    token: Type.String({ minLength: 1, description: "Token symbol, for example USDC or HSK." }),
    amount: Type.String({ minLength: 1, description: "Human-readable decimal amount, for example 10.5." }),
    recipient: Type.String({ minLength: 1, description: "Contact alias or a 0x address." }),
  },
  { additionalProperties: false },
);

const swapParameters = Type.Object(
  {
    tokenIn: Type.String({ minLength: 1, description: "Input token symbol." }),
    tokenOut: Type.String({ minLength: 1, description: "Output token symbol." }),
    amountIn: Type.String({ minLength: 1, description: "Human-readable decimal input amount." }),
  },
  { additionalProperties: false },
);

const emptyParameters = Type.Object({}, { additionalProperties: false });
const transactionStatusParameters = Type.Object(
  {
    transactionId: Type.Optional(Type.String({ minLength: 1, description: "A submitted transaction hash." })),
  },
  { additionalProperties: false },
);

export type TransferParameters = z.infer<typeof TransferInput>;
export type SwapParameters = z.infer<typeof SwapInput>;

export type HuskyToolDetails = {
  /**
   * "failed" means at least one transaction was broadcast but the operation did
   * not complete. It is never "rejected", and "hashes" is always populated, so a
   * partial or uncertain outcome cannot be reported as nothing having happened.
   */
  status: "ready" | "rejected" | "cancelled" | "executing" | "confirmed" | "failed" | "unavailable";
  operation?: "transfer" | "swap" | "approveAndSwap";
  summary?: string;
  message?: string;
  reason?: string;
  hashes?: string[];
  /** Per-leg outcome of everything already broadcast, when the run did not complete. */
  sent?: Array<{ kind: string; hash: string; status: SentLegStatus }>;
};

export type OperationExecutionResult = { hashes: string[] };
export type OperationProgressCallback = (progress: { message: string }) => void;

/**
 * The subset of the deterministic adapter the tools depend on. Declared
 * structurally rather than as `Pick<HuskyOperations, ...>` so tests can inject
 * a fake without constructing chain clients.
 */
export type HuskyOperationsLike = {
  prepareTransfer(params: TransferParameters): Promise<PipelineResult>;
  prepareSwap(params: SwapParameters): Promise<PipelineResult>;
  execute(
    operation: PreparedOperation,
    onProgress: OperationProgressCallback,
    signal?: AbortSignal,
  ): Promise<OperationExecutionResult>;
  getAddress(): Promise<string>;
  getBalances(): Promise<Array<{ symbol: string; balance: bigint; decimals: number }>>;
};

export type HuskyToolOptions = {
  /** Dependency seam for deterministic tests; production lazily creates the real adapter. */
  getOperations?: () => HuskyOperationsLike | Promise<HuskyOperationsLike>;
};

const BUILTIN_TOOL_NAMES = new Set(["bash", "powershell", "read", "write", "edit", "grep", "find", "ls"]);

function result(
  text: string,
  details: HuskyToolDetails,
): AgentToolResult<HuskyToolDetails> {
  return { content: [{ type: "text", text }], details };
}

function operationFailure(
  operation: HuskyToolDetails["operation"],
  reason: string,
): AgentToolResult<HuskyToolDetails> {
  return result(`❌ ${reason}`, { status: "rejected", operation, reason });
}

function cancelled(
  operation?: HuskyToolDetails["operation"],
  summary?: string,
): AgentToolResult<HuskyToolDetails> {
  return result("Cancelled — nothing was signed or sent.", { status: "cancelled", operation, summary });
}

function operationLabel(operation: PreparedOperation): HuskyToolDetails["operation"] {
  return operation.kind;
}

const SENT_LEG_OUTCOME: Record<SentLegStatus, string> = {
  confirmed: "receipt-confirmed",
  reverted: "reverted on-chain — gas was spent, no funds moved",
  unknown: "confirmation UNKNOWN — broadcast, but its receipt was never observed",
};

/**
 * The operation stopped after at least one transaction reached the chain. The
 * hashes are preserved in the tool result (and in the text the model relays) so
 * a partial or uncertain outcome is never reported as a rejection or as
 * "nothing was sent".
 */
function executionIncomplete(
  operation: HuskyToolDetails["operation"],
  error: OperationExecutionError,
): AgentToolResult<HuskyToolDetails> {
  const noun = operation === "approveAndSwap" ? "swap" : operation ?? "operation";
  const sent: NonNullable<HuskyToolDetails["sent"]> = error.sent.map((leg: SentLeg) => ({
    kind: leg.kind,
    hash: leg.hash,
    status: leg.status,
  }));
  const lines = [
    `⚠️ ${noun} did NOT complete: ${error.message}`,
    "Already broadcast to HSK testnet — do not resend:",
    ...sent.map((leg) => `- ${leg.kind} ${leg.hash}: ${SENT_LEG_OUTCOME[leg.status]}`),
  ];
  if (sent.some((leg) => leg.status === "unknown")) {
    lines.push(
      "A broadcast transaction has no observed receipt, so whether it succeeded is unknown — check it on the HSK explorer before anything else.",
    );
  }
  lines.push(
    error.aborted
      ? "The operation was cancelled; the remaining leg was not signed or sent."
      : "Nothing further was signed or sent.",
    "Any retry requires a fresh explicit human approval.",
  );
  return result(lines.join("\n"), {
    status: "failed",
    operation,
    reason: error.message,
    hashes: sent.map((leg) => leg.hash),
    sent,
  });
}

function progressResult(
  operation: HuskyToolDetails["operation"],
  progress: OperationProgress,
): AgentToolResult<HuskyToolDetails> {
  return result(progress.message, { status: "executing", operation, message: progress.message });
}

function validationMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Tool arguments are invalid.";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `Invalid tool arguments — ${path}${first.message}.`;
}

async function getPreparedAndApproved(
  operationName: "transfer" | "swap",
  rawParams: unknown,
  schema: typeof TransferInput | typeof SwapInput,
  prepare: (params: TransferParameters | SwapParameters) => Promise<PipelineResult>,
  getOperations: () => Promise<HuskyOperationsLike>,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<HuskyToolDetails> | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<HuskyToolDetails>> {
  const parsed = schema.safeParse(rawParams);
  if (!parsed.success) return operationFailure(operationName, validationMessage(parsed.error));
  if (signal?.aborted) return cancelled(operationName);

  let prepared: PipelineResult;
  try {
    prepared = await prepare(parsed.data);
  } catch (error) {
    if (error instanceof ResolutionError) return operationFailure(operationName, error.message);
    throw error;
  }

  if (prepared.status === "rejected") return operationFailure(operationName, prepared.reason);
  const operation = operationLabel(prepared.operation);
  onUpdate?.(result("Prepared and simulated. Waiting for explicit human approval.", {
    status: "ready",
    operation,
    summary: prepared.summary,
  }));

  // Print/JSON mode has no human dialog. Fail closed instead of ever treating
  // model output, a flag, or an absent UI as approval.
  if (!ctx.hasUI) {
    return operationFailure(operation, "Interactive human approval is required before signing.");
  }

  const approved = await ctx.ui.confirm("Approve Husky Agent operation", prepared.summary, { signal });
  if (!approved || signal?.aborted) return cancelled(operation, prepared.summary);

  const operations = await getOperations();
  let execution: OperationExecutionResult;
  try {
    execution = await operations.execute(
      prepared.operation,
      (progress) => onUpdate?.(progressResult(operation, progress)),
      signal,
    );
  } catch (error) {
    if (error instanceof OperationExecutionError) {
      if (error.sent.length === 0) {
        // Nothing reached the chain: an abort is a plain cancellation, and any
        // other pre-broadcast failure already carries accurate wording of its
        // own — nothing is appended that could contradict it.
        return error.aborted
          ? cancelled(operation, prepared.summary)
          : operationFailure(operation, error.message);
      }
      // At least one leg is already on-chain. It is reported as a partial
      // failure with its hashes — never as a rejection, and never as unsent.
      return executionIncomplete(operation, error);
    }
    const reason = error instanceof Error ? error.message : String(error);
    return operationFailure(operation, `${reason} Nothing further was signed or sent.`);
  }
  const hashes = execution.hashes;
  const joined = hashes.join(", ");
  const noun = operation === "approveAndSwap" ? "swap" : operation;
  return result(`✅ ${noun} confirmed. Transaction${hashes.length === 1 ? "" : "s"}: ${joined}`, {
    status: "confirmed",
    operation,
    summary: prepared.summary,
    hashes,
  });
}

function makeTransferTool(getOperations: () => Promise<HuskyOperationsLike>): ToolDefinition<typeof transferParameters, HuskyToolDetails> {
  return {
    name: "husky_transfer",
    label: "Transfer",
    description: "Transfer an allowlisted token, or native HSK, to a contact or direct 0x address.",
    promptSnippet: "Transfer HSK or an allowlisted token after deterministic checks and human approval",
    promptGuidelines: [
      "Use husky_transfer only when token, amount, and recipient are explicit; never invent a missing value.",
      "husky_transfer always presents a deterministic summary and requires explicit human approval before signing.",
    ],
    parameters: transferParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return getPreparedAndApproved(
        "transfer",
        params,
        TransferInput,
        (input) => getOperations().then((operations) => operations.prepareTransfer(input as TransferParameters)),
        getOperations,
        signal,
        onUpdate,
        ctx,
      );
    },
  };
}

function makeSwapTool(getOperations: () => Promise<HuskyOperationsLike>): ToolDefinition<typeof swapParameters, HuskyToolDetails> {
  return {
    name: "husky_swap",
    label: "Swap",
    description: "Swap two allowlisted tokens through the Husky-Agent AMM with fixed 0.50% slippage tolerance.",
    promptSnippet: "Swap allowlisted tokens through the Husky-Agent AMM after quote, simulation, and approval",
    promptGuidelines: [
      "Use husky_swap only when input token, output token, and amount are explicit; never invent a missing value.",
      "husky_swap computes the quote and amountOutMin deterministically; never supply slippage or calldata.",
      "husky_swap may present one combined approval for exact approve plus swap legs, then executes them sequentially.",
    ],
    parameters: swapParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return getPreparedAndApproved(
        "swap",
        params,
        SwapInput,
        (input) => getOperations().then((operations) => operations.prepareSwap(input as SwapParameters)),
        getOperations,
        signal,
        onUpdate,
        ctx,
      );
    },
  };
}

function makeWalletStatusTool(getOperations: () => Promise<HuskyOperationsLike>): ToolDefinition<typeof emptyParameters, HuskyToolDetails> {
  return {
    name: "husky_wallet_status",
    label: "Wallet status",
    description: "Show the configured testnet wallet address and Speculos Ledger connection status.",
    promptSnippet: "Show the Husky Agent testnet wallet status",
    promptGuidelines: ["Use husky_wallet_status for wallet connection status; never request or expose keys or seed phrases."],
    parameters: emptyParameters,
    async execute(_toolCallId, _params, signal) {
      if (signal?.aborted) return cancelled();
      try {
        const address = await (await getOperations()).getAddress();
        return result(`Ledger via Speculos is connected. Signing address: ${address}`, {
          status: "ready",
          message: "Ledger via Speculos is connected.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return result(`❌ Wallet unavailable: ${message}`, { status: "unavailable", reason: message });
      }
    },
  };
}

function makeBalancesTool(getOperations: () => Promise<HuskyOperationsLike>): ToolDefinition<typeof emptyParameters, HuskyToolDetails> {
  return {
    name: "husky_balances",
    label: "Balances",
    description: "Read the configured wallet's HSK and allowlisted token balances from HSK testnet.",
    promptSnippet: "Read HSK and allowlisted token balances",
    promptGuidelines: ["Use husky_balances for read-only balance checks; do not infer balances from old messages."],
    parameters: emptyParameters,
    async execute(_toolCallId, _params, signal) {
      if (signal?.aborted) return cancelled();
      try {
        const balances = await (await getOperations()).getBalances();
        const lines = balances.map(({ symbol, balance, decimals }) => `${symbol}: ${formatUnits(balance, decimals)}`);
        return result(lines.length > 0 ? lines.join("\n") : "No allowlisted tokens are configured.", {
          status: "ready",
          message: "Balances read from HSK testnet.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return result(`❌ Balances unavailable: ${message}`, { status: "unavailable", reason: message });
      }
    },
  };
}

function makePolicyStatusTool(): ToolDefinition<typeof emptyParameters, HuskyToolDetails> {
  return {
    name: "husky_policy_status",
    label: "Policy status",
    description: "Explain the deterministic Husky Agent safety policy for HSK testnet operations.",
    promptSnippet: "Show Husky Agent policy and approval requirements",
    promptGuidelines: ["Use husky_policy_status to explain fixed policy checks and mandatory human approval."],
    parameters: emptyParameters,
    async execute() {
      return result(
        "Policy ready: HSK testnet (chain 133), contacts and tokens are allowlisted, simulations are required, and every write requires explicit human approval.",
        { status: "ready", message: "Deterministic policy is enabled." },
      );
    },
  };
}

function makeTransactionStatusTool(): ToolDefinition<typeof transactionStatusParameters, HuskyToolDetails> {
  return {
    name: "husky_transaction_status",
    label: "Transaction status",
    description: "Inspect a submitted transaction identifier when a status adapter is available.",
    promptSnippet: "Inspect a submitted Husky transaction status",
    promptGuidelines: ["Use husky_transaction_status only with a submitted transaction hash; never treat preconfirmation as finality."],
    parameters: transactionStatusParameters,
    async execute(_toolCallId, params) {
      const transactionId = params.transactionId?.trim();
      if (!transactionId) return result("Provide a submitted transaction hash to inspect.", { status: "ready" });
      if (!isHash(transactionId)) return operationFailure(undefined, "Transaction identifier must be a 0x transaction hash.");
      return result(
        "Transaction status is available through the normal HSK RPC receipt path; Flashblocks preconfirmation never substitutes for final confirmation.",
        { status: "ready", message: transactionId },
      );
    },
  };
}

function makeDoctorTool(): ToolDefinition<typeof emptyParameters, HuskyToolDetails> {
  return {
    name: "husky_doctor_health",
    label: "Doctor health",
    description: "Show the Husky Agent integration health requirements for the testnet demo.",
    promptSnippet: "Check Husky Agent integration health",
    promptGuidelines: ["Use husky_doctor_health for a concise integration readiness check."],
    parameters: emptyParameters,
    async execute() {
      return result(
        "Husky Agent supports HashKey Chain Testnet (chain 133), deterministic core preparation, Ledger via Speculos, and optional Flashblocks UX feedback.",
        { status: "ready", message: "Integration requirements are configured." },
      );
    },
  };
}

export function createHuskyTools(getOperations: () => Promise<HuskyOperationsLike>): Array<ToolDefinition<any, HuskyToolDetails>> {
  return [
    makeWalletStatusTool(getOperations),
    makeBalancesTool(getOperations),
    makeTransferTool(getOperations),
    makeSwapTool(getOperations),
    makePolicyStatusTool(),
    makeTransactionStatusTool(),
    makeDoctorTool(),
  ];
}

/** Register the active Husky tools and remove Pi's built-in bypass surface. */
export function registerHuskyTools(pi: ExtensionAPI, options: HuskyToolOptions = {}): void {
  let operationsPromise: Promise<HuskyOperationsLike> | undefined;
  const getOperations = async (): Promise<HuskyOperationsLike> => {
    operationsPromise ??= Promise.resolve(options.getOperations?.() ?? new HuskyOperations());
    return operationsPromise;
  };

  const tools = createHuskyTools(getOperations);
  for (const tool of tools) pi.registerTool(tool);

  const names = tools.map((tool) => tool.name);
  pi.on("session_start", () => {
    // The active Pi app is a transaction assistant, so built-in shell/file
    // tools stay disabled even when a caller passes a broad --tools flag.
    pi.setActiveTools(names);
  });

  // Defense in depth for resumed sessions or a runtime race: a model call to a
  // built-in shell/file tool is blocked even if it was active before startup.
  pi.on("tool_call", (event) => {
    if (!BUILTIN_TOOL_NAMES.has(event.toolName)) return;
    return {
      block: true,
      terminate: true,
      reason: "Built-in shell and file tools are disabled in Husky Agent; use the deterministic Husky tools instead.",
    };
  });
}

/**
 * Tool definitions bound to the real deterministic adapter. Exported for
 * tests and for callers that want to inspect the schemas without registering
 * them into a Pi session.
 */
export const huskyTools = createHuskyTools(async () => new HuskyOperations());
