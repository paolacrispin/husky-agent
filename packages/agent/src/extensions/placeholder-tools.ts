import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionFactory, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import type { Static, TSchema } from "typebox";

type PlaceholderDetails = {
  status: "not_connected";
  surface: string;
  message: string;
};

type PlaceholderTool<TParams extends TSchema> = ToolDefinition<TParams, PlaceholderDetails>;

const emptyParameters = Type.Object({}, { additionalProperties: false });
const transactionStatusParameters = Type.Object(
  {
    transactionId: Type.Optional(
      Type.String({ minLength: 1, description: "An identifier to inspect when an adapter is connected." }),
    ),
  },
  { additionalProperties: false },
);
const transferParameters = Type.Object(
  {
    token: Type.String({ minLength: 1, description: "Token symbol or known token label." }),
    amount: Type.String({ minLength: 1, description: "Decimal amount as text." }),
    recipient: Type.String({ minLength: 1, description: "Recipient label or address for a future adapter." }),
  },
  { additionalProperties: false },
);
const swapParameters = Type.Object(
  {
    tokenIn: Type.String({ minLength: 1, description: "Input token symbol or known token label." }),
    tokenOut: Type.String({ minLength: 1, description: "Output token symbol or known token label." }),
    amountIn: Type.String({ minLength: 1, description: "Input amount as text." }),
  },
  { additionalProperties: false },
);

type EmptyParameters = Static<typeof emptyParameters>;
type TransactionStatusParameters = Static<typeof transactionStatusParameters>;
type TransferParameters = Static<typeof transferParameters>;
type SwapParameters = Static<typeof swapParameters>;

function notConnected(
  surface: string,
  message: string,
): AgentToolResult<PlaceholderDetails> {
  return {
    content: [{ type: "text", text: message }],
    details: { status: "not_connected", surface, message },
  };
}

function readPlaceholder<TParams extends TSchema>(
  name: string,
  label: string,
  description: string,
  parameters: TParams,
  surface: string,
): PlaceholderTool<TParams> {
  return {
    name,
    label,
    description,
    promptSnippet: `${label} (Husky Agent adapter status)`,
    promptGuidelines: ["Treat a not_connected result as definitive; do not infer live chain state."],
    parameters,
    execute: async () =>
      notConnected(surface, `Husky Agent’s ${surface} adapter is not connected yet.`),
  };
}

function writePlaceholder<TParams extends TSchema>(
  name: string,
  label: string,
  description: string,
  parameters: TParams,
  surface: string,
): PlaceholderTool<TParams> {
  return {
    name,
    label,
    description,
    promptSnippet: `${label} (Husky Agent placeholder; no action)`,
    promptGuidelines: [
      "This is a non-executing placeholder. Never describe a signature, submission, or confirmation.",
    ],
    parameters,
    execute: async () =>
      notConnected(surface, `Husky Agent’s ${surface} adapter is not connected yet.`),
  };
}

/*
 * Future adapters are intentionally referenced here without imports:
 * - transfer and swap preparation: packages/core/src/pipeline.ts (prepareTransfer/prepareSwap)
 * - signer boundary and transports: packages/signer/src/types.ts and transports.ts
 * - live status stream: packages/flashblocks/src/subscribe.ts
 * - final operation wiring: packages/cli/src/sendOperation.ts and txAssembly.ts
 */
export const huskyPlaceholderTools: Array<PlaceholderTool<TSchema>> = [
  readPlaceholder(
    "husky_wallet_status",
    "Wallet status",
    "Report Husky Agent wallet connection status without exposing credentials.",
    emptyParameters,
    "wallet",
  ),
  readPlaceholder(
    "husky_balances",
    "Balances",
    "Report Husky Agent balances when a read adapter is connected.",
    emptyParameters,
    "balances",
  ),
  writePlaceholder(
    "husky_transfer",
    "Transfer placeholder",
    "Describe a future Husky Agent transfer request without signing or submitting it.",
    transferParameters,
    "transfer",
  ),
  writePlaceholder(
    "husky_swap",
    "Swap placeholder",
    "Describe a future Husky Agent swap request without building or submitting it.",
    swapParameters,
    "swap",
  ),
  readPlaceholder(
    "husky_policy_status",
    "Policy status",
    "Report Husky Agent policy readiness when a policy adapter is connected.",
    emptyParameters,
    "policy",
  ),
  readPlaceholder(
    "husky_transaction_status",
    "Transaction status",
    "Inspect a transaction through a future Husky Agent status adapter.",
    transactionStatusParameters,
    "transaction",
  ),
  readPlaceholder(
    "husky_doctor_health",
    "Doctor health",
    "Report Husky Agent integration health without probing external services yet.",
    emptyParameters,
    "doctor",
  ),
];

export const registerHuskyPlaceholderTools: ExtensionFactory = (pi) => {
  for (const tool of huskyPlaceholderTools) {
    pi.registerTool(tool);
  }
};

export type {
  EmptyParameters,
  PlaceholderDetails,
  SwapParameters,
  TransactionStatusParameters,
  TransferParameters,
};
