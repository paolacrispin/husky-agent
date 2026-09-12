import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The only two tools Claude can invoke — see docs/03-agent-tools-spec.md.
 * Kept in this exact shape (Anthropic's `tools` JSON Schema format) plus a
 * parallel zod schema for independent re-validation, per CLAUDE.md's
 * convention: anything from the LLM is validated before it touches the
 * resolver in packages/core.
 */

export const TransferInput = z.object({
  token: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  recipient: z.string().min(1),
});

export const SwapInput = z.object({
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.string().regex(/^\d+(\.\d+)?$/),
});

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "transfer",
    description: "Transfer an amount of a token to a recipient",
    input_schema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token symbol, e.g. 'USDC', 'HSK'" },
        amount: { type: "string", description: "Amount in human-readable units, e.g. '10.5'" },
        recipient: { type: "string", description: "Contact alias or a 0x address" },
      },
      required: ["token", "amount", "recipient"],
    },
  },
  {
    name: "swap",
    description: "Exchange an amount of one token for another via the AMM",
    input_schema: {
      type: "object",
      properties: {
        tokenIn: { type: "string", description: "Input token symbol" },
        tokenOut: { type: "string", description: "Output token symbol" },
        amountIn: { type: "string", description: "Amount of the input token, in human-readable units" },
      },
      required: ["tokenIn", "tokenOut", "amountIn"],
    },
  },
];
