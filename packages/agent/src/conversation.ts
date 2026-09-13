import type { Message } from "./interpret.js";

/**
 * Owns the Message[] array for one operation. packages/cli creates one of
 * these per user instruction and discards it once interpret() returns a
 * tool call or the user cancels — history never carries over into the next,
 * unrelated instruction. See "Conversation state" in
 * docs/03-agent-tools-spec.md.
 */
export class Conversation {
  private messages: Message[] = [];

  constructor(firstUserMessage: string) {
    this.messages.push({ role: "user", content: firstUserMessage });
  }

  /** Call after a `needsClarification` result, with the model's question and the user's reply. */
  addClarificationTurn(assistantMessage: string, userReply: string): void {
    this.messages.push({ role: "assistant", content: assistantMessage });
    this.messages.push({ role: "user", content: userReply });
  }

  history(): Message[] {
    return [...this.messages];
  }
}
