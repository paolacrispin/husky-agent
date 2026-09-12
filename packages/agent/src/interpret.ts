import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { TOOL_DEFINITIONS, TransferInput, SwapInput } from "./tools.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

export type Message = { role: "user" | "assistant"; content: string };

export type Intent =
  | { tool: "transfer"; params: z.infer<typeof TransferInput> }
  | { tool: "swap"; params: z.infer<typeof SwapInput> }
  | { needsClarification: true; message: string };

export class InterpretError extends Error {}

const MODEL = "claude-sonnet-5";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/**
 * Interprets the conversation so far into a tool call or a clarification
 * request. Takes the full history, not a single string — see "Conversation
 * state" in docs/03-agent-tools-spec.md: packages/cli owns appending turns
 * and clearing the array once an operation resolves or is cancelled.
 *
 * Fails closed on API errors: no tool call is ever invented locally, and
 * this never falls back to a heuristic parser (see open items in
 * docs/03-agent-tools-spec.md). Callers should catch InterpretError and ask
 * the user to retry.
 */
export async function interpret(messages: Message[]): Promise<Intent> {
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      tool_choice: { type: "auto" },
      messages,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InterpretError(`Claude Messages API call failed: ${reason}`);
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    return { needsClarification: true, message: text?.text ?? "Could you clarify?" };
  }

  if (toolUse.name === "transfer") {
    return { tool: "transfer", params: TransferInput.parse(toolUse.input) };
  }
  if (toolUse.name === "swap") {
    return { tool: "swap", params: SwapInput.parse(toolUse.input) };
  }

  throw new InterpretError(`Unexpected tool: ${toolUse.name}`);
}
