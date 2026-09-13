import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * These run the compiled output, not the sources — `pnpm dev` runs tsx, so a
 * `dist` that fails to load would otherwise only show up at demo time.
 */
describe("built husky-agent CLI", () => {
  beforeAll(() => {
    if (!existsSync(cliPath)) {
      throw new Error(`Build the agent package first: ${cliPath} is missing.`);
    }
  });

  it("reports its version from the built entry point", async () => {
    const { stdout } = await run(process.execPath, [cliPath, "--version"], { cwd: repoRoot });
    expect(stdout.trim()).toBe("husky-agent 0.1.0");
  });

  it("loads the built extension and integration modules", async () => {
    const probe = `
      const agent = await import(${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)});
      const names = agent.createHuskyTools(async () => { throw new Error("unused"); }).map((t) => t.name);
      console.log(JSON.stringify({
        names,
        hardening: agent.HARDENING_FLAGS,
        model: agent.resolveModelSelection(undefined, "deepseek:deepseek-v4-flash"),
        hasPrompt: agent.HUSKY_SYSTEM_PROMPT.includes("HashKey Chain Testnet"),
      }));
    `;
    const { stdout } = await run(process.execPath, ["--input-type=module", "-e", probe], { cwd: repoRoot });
    const parsed = JSON.parse(stdout) as {
      names: string[];
      hardening: string[];
      model: { provider: string; model: string };
      hasPrompt: boolean;
    };

    // The write tools and the read-only surfaces, and nothing else.
    expect(parsed.names).toEqual([
      "husky_wallet_status",
      "husky_balances",
      "husky_transfer",
      "husky_swap",
      "husky_policy_status",
      "husky_transaction_status",
      "husky_doctor_health",
    ]);
    expect(parsed.hardening).toContain("--no-builtin-tools");
    expect(parsed.hardening).toContain("--no-extensions");
    expect(parsed.model).toEqual({ provider: "deepseek", model: "deepseek-v4-flash" });
    expect(parsed.hasPrompt).toBe(true);
  });
});
