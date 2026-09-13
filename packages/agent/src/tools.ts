import { Type, type Static, type Tool } from "@earendil-works/pi-ai";
import { z } from "zod";

/**
 * The only two tools the model can invoke — see docs/03-agent-tools-spec.md.
 * TypeBox for the pi harness, plus a parallel zod schema for independent
 * re-validation, per AGENTS.md's convention: anything from the LLM is
 * validated before it touches the resolver in packages/core.
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

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "transfer",
    description: "Transfer an amount of a token to a recipient",
    parameters: Type.Object({
      token: Type.String({ description: "Token symbol, e.g. 'USDC', 'HSK'" }),
      amount: Type.String({ description: "Amount in human-readable units, e.g. '10.5'" }),
      recipient: Type.String({ description: "Contact alias or a 0x address" }),
    }),
  },
  {
    name: "swap",
    description: "Exchange an amount of one token for another via the AMM",
    parameters: Type.Object({
      tokenIn: Type.String({ description: "Input token symbol" }),
      tokenOut: Type.String({ description: "Output token symbol" }),
      amountIn: Type.String({
        description: "Amount of the input token, in human-readable units",
      }),
    }),
  },
];
