import { describe, expect, it, vi, afterEach } from "vitest";
import { LEGACY_CLI_MESSAGE, isDirectInvocation, runLegacyCli } from "./main.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("legacy CLI compatibility entry point", () => {
  it("refuses to run and points at the supported shell", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const code = runLegacyCli();

    expect(code).toBe(1);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("pnpm dev"));
    expect(LEGACY_CLI_MESSAGE).toContain("retired");
    // The retired path must not advertise a second way to reach signing.
    expect(LEGACY_CLI_MESSAGE).not.toContain("--filter @husky-agent/cli dev");
  });

  it("only announces itself when run as the entry point", () => {
    expect(isDirectInvocation(undefined, import.meta.url)).toBe(false);
    expect(isDirectInvocation("/somewhere/else.js", import.meta.url)).toBe(false);
  });
});
