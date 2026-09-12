import { describe, expect, it } from "vitest";
import { resolveRecipient, resolveToken, resolveAmount, resolveTransfer, ResolutionError } from "./resolve.js";
import type { Contacts, Tokens } from "../types/index.js";

const contacts: Contacts = {
  juan: "0x0000000000000000000000000000000000000001",
  maria: "0x0000000000000000000000000000000000000002",
};

const tokens: Tokens = {
  HSK: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  USDC: { address: "0x0000000000000000000000000000000000000009", decimals: 6 },
};

describe("resolveRecipient", () => {
  it("resolves a known alias case-insensitively", () => {
    const result = resolveRecipient("Juan", contacts);
    expect(result.address).toBe(contacts.juan);
    expect(result.label).toBe("juan");
  });

  it("falls back to a direct 0x address", () => {
    const address = "0x00000000000000000000000000000000000000aa";
    const result = resolveRecipient(address, contacts);
    expect(result.address).toBe(address);
    expect(result.label).toBe("address");
  });

  it("rejects an unknown alias that isn't a valid address", () => {
    expect(() => resolveRecipient("nobody", contacts)).toThrow(ResolutionError);
  });
});

describe("resolveToken", () => {
  it("resolves a symbol case-insensitively", () => {
    const token = resolveToken("usdc", tokens);
    expect(token.symbol).toBe("USDC");
    expect(token.decimals).toBe(6);
  });

  it("rejects a token outside the allowlist", () => {
    expect(() => resolveToken("SCAM", tokens)).toThrow(ResolutionError);
  });
});

describe("resolveAmount", () => {
  it("converts a human-readable amount to base units", () => {
    expect(resolveAmount("10.5", 18)).toBe(10_500_000_000_000_000_000n);
    expect(resolveAmount("10.5", 6)).toBe(10_500_000n);
  });

  it("rejects a malformed amount", () => {
    expect(() => resolveAmount("not-a-number", 18)).toThrow(ResolutionError);
  });
});

describe("resolveTransfer", () => {
  it("resolves token, amount, and recipient together", () => {
    const resolved = resolveTransfer({ token: "USDC", amount: "5", recipient: "juan" }, tokens, contacts);
    expect(resolved.kind).toBe("transfer");
    expect(resolved.amount).toBe(5_000_000n);
    expect(resolved.recipient).toBe(contacts.juan);
    expect(resolved.recipientLabel).toBe("juan");
  });
});
