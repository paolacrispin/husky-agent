import { describe, expect, it } from "vitest";
import { matchesTxHash, type FlashblockMessage } from "./types.js";

const baseMessage: Omit<FlashblockMessage, "diff"> = { index: 1 };

describe("matchesTxHash", () => {
  it("matches a plain string tx hash, case-insensitively", () => {
    const message: FlashblockMessage = {
      ...baseMessage,
      diff: { transactions: ["0xABC123"] },
    };
    expect(matchesTxHash(message, "0xabc123")).toBe(true);
  });

  it("matches an object with a hash field", () => {
    const message: FlashblockMessage = {
      ...baseMessage,
      diff: { transactions: [{ hash: "0xdef456" }] },
    };
    expect(matchesTxHash(message, "0xDEF456")).toBe(true);
  });

  it("returns false when the tx hash isn't present", () => {
    const message: FlashblockMessage = {
      ...baseMessage,
      diff: { transactions: ["0x111111", { hash: "0x222222" }] },
    };
    expect(matchesTxHash(message, "0x333333")).toBe(false);
  });
});
