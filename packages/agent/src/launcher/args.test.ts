import { describe, expect, it } from "vitest";
import { HARDENING_FLAGS, hasExplicitModelSelection, withDefaultModelSelection, withHuskyHardening } from "./args.js";
import { resolveModelSelection } from "../config/env.js";

describe("launcher arguments", () => {
  it("selects the configured provider and model when the caller names none", () => {
    expect(withDefaultModelSelection([], "deepseek", "deepseek-v4-flash")).toEqual([
      "--provider",
      "deepseek",
      "--model",
      "deepseek-v4-flash",
    ]);
  });

  it("never overrides an explicit model selection", () => {
    expect(hasExplicitModelSelection(["--model", "claude-sonnet-5"])).toBe(true);
    expect(hasExplicitModelSelection(["--provider=anthropic"])).toBe(true);
    expect(hasExplicitModelSelection(["--models", "anthropic/*"])).toBe(true);
    expect(withDefaultModelSelection(["--model", "claude-sonnet-5"], "deepseek", "deepseek-v4-flash")).toEqual([
      "--model",
      "claude-sonnet-5",
    ]);
  });

  it("disables built-in tools, untrusted extension discovery and stray context", () => {
    const args = withHuskyHardening([]);

    expect(args).toEqual(expect.arrayContaining([...HARDENING_FLAGS]));
    expect(args).toContain("--no-builtin-tools");
    expect(args).toContain("--no-extensions");
  });

  it("keeps user arguments last and does not duplicate a flag they already passed", () => {
    const args = withHuskyHardening(["--no-builtin-tools", "--model", "claude-sonnet-5"]);

    expect(args.filter((argument) => argument === "--no-builtin-tools")).toHaveLength(1);
    expect(args.at(-2)).toBe("--model");
    expect(args.at(-1)).toBe("claude-sonnet-5");
  });
});

describe("model selection parsing", () => {
  it("accepts the combined provider:model spelling used by docs/06", () => {
    expect(resolveModelSelection(undefined, "deepseek:deepseek-v4-flash")).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
  });

  it("accepts the split spelling used by .env.example", () => {
    expect(resolveModelSelection("deepseek", "deepseek-v4-flash")).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
  });

  it("lets an explicit provider win over the combined prefix", () => {
    expect(resolveModelSelection("anthropic", "deepseek:deepseek-v4-flash")).toEqual({
      provider: "anthropic",
      model: "deepseek:deepseek-v4-flash",
    });
  });

  it("falls back to the defaults and keeps a model id containing a colon intact", () => {
    expect(resolveModelSelection(undefined, undefined)).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
    expect(resolveModelSelection(undefined, "openrouter:anthropic/claude-sonnet-5")).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-5",
    });
  });
});
