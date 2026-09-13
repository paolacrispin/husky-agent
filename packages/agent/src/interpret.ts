import {
  fauxAssistantMessage,
  validateToolCall,
  type Api,
  type AssistantMessage,
  type Message as PiMessage,
  type Model,
  type Models,
  type ToolCall,
} from "@earendil-works/pi-ai";
import { builtinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import type { z } from "zod";
import { TOOL_DEFINITIONS, TransferInput, SwapInput } from "./tools.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

export type Message = { role: "user" | "assistant"; content: string };

export type Intent =
  | { tool: "transfer"; params: z.infer<typeof TransferInput> }
  | { tool: "swap"; params: z.infer<typeof SwapInput> }
  | { needsClarification: true; message: string };

export class InterpretError extends Error {}

/** The model answered, but not with a usable intent. */
export class InterpretationFailedError extends InterpretError {}

/**
 * Which model to ask, as `<provider>:<modelId>`. Providers and the model
 * catalog come from the pi harness, so switching is a `.env` change.
 */
const MODEL_CONFIG_ENV = "HUSKY_AGENT_MODEL";
const DEFAULT_MODEL = "deepseek:deepseek-v4-flash";

let models: Models | undefined;
function getModels(): Models {
  models ??= builtinModels();
  return models;
}

function configuredModel(): string {
  return process.env[MODEL_CONFIG_ENV] ?? DEFAULT_MODEL;
}

/**
 * Resolves the `HUSKY_AGENT_MODEL` env override against the harness catalog.
 * Throws instead of falling back to the default: silently calling a different
 * model than the operator configured would be a fail-open.
 */
export function resolveModel(): Model<Api> {
  const configured = configuredModel();
  const separator = configured.indexOf(":");
  const provider = separator === -1 ? configured : configured.slice(0, separator);
  const modelId = separator === -1 ? "" : configured.slice(separator + 1);

  if (!modelId) {
    throw new InterpretError(
      `${MODEL_CONFIG_ENV} must look like "<provider>:<model>", got "${configured}"`,
    );
  }

  const knownProviders = new Set<string>(getBuiltinProviders());
  if (!knownProviders.has(provider)) {
    throw new InterpretError(
      `Unknown provider in ${MODEL_CONFIG_ENV}: "${provider}". Known providers: ` +
        getBuiltinProviders().join(", "),
    );
  }

  const model = getModels().getModel(provider, modelId);
  if (!model) {
    throw new InterpretError(
      `Unknown model for provider ${provider} in ${MODEL_CONFIG_ENV}: "${modelId}"`,
    );
  }
  return model;
}

function toPiMessages(messages: Message[]): PiMessage[] {
  const timestamp = Date.now();
  return messages.map((message) =>
    message.role === "user"
      ? { role: "user", content: message.content, timestamp }
      : fauxAssistantMessage(message.content, { timestamp }),
  );
}

function clarificationFrom(response: AssistantMessage): Intent {
  const text = response.content.find((block) => block.type === "text");
  return {
    needsClarification: true,
    message: text?.type === "text" && text.text ? text.text : "Could you clarify?",
  };
}

/**
 * Interprets the conversation so far into a tool call or a clarification
 * request. Takes the full history, not a single string — see "Conversation
 * state" in docs/03-agent-tools-spec.md: packages/cli owns appending turns
 * and clearing the array once an operation resolves or is cancelled.
 *
 * Fails closed: no tool call is ever invented locally, and this never falls
 * back to a heuristic parser (see open items in docs/03-agent-tools-spec.md).
 * The pi harness reports provider and auth failures in-band, as an
 * AssistantMessage with stopReason "error" rather than a throw, so that is
 * checked explicitly. Callers should catch InterpretError and ask the user to
 * retry.
 */
export async function interpret(messages: Message[]): Promise<Intent> {
  const model = resolveModel();

  let response: AssistantMessage;
  try {
    response = await getModels().completeSimple(model, {
      systemPrompt: SYSTEM_PROMPT,
      messages: toPiMessages(messages),
      tools: TOOL_DEFINITIONS,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InterpretError(`pi harness request to ${configuredModel()} failed: ${reason}`, {
      cause: error,
    });
  }

  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new InterpretationFailedError(
      `pi harness returned ${response.stopReason} for ${configuredModel()}: ` +
        `${response.errorMessage ?? "no error message provided"}`,
    );
  }

  const toolCall = response.content.find((block): block is ToolCall => block.type === "toolCall");
  if (!toolCall) return clarificationFrom(response);

  if (toolCall.name === "transfer") {
    return { tool: "transfer", params: TransferInput.parse(validate(toolCall)) };
  }
  if (toolCall.name === "swap") {
    return { tool: "swap", params: SwapInput.parse(validate(toolCall)) };
  }

  throw new InterpretationFailedError(`Unexpected tool: ${toolCall.name}`);
}

/** Wraps a malformed payload so it surfaces as an InterpretError. */
function validate(toolCall: ToolCall): unknown {
  try {
    return validateToolCall(TOOL_DEFINITIONS, toolCall);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InterpretationFailedError(`Malformed arguments for ${toolCall.name}: ${reason}`, {
      cause: error,
    });
  }
}
