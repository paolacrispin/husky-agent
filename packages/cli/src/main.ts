/**
 * Compatibility entry point for `@husky-agent/cli`.
 *
 * This package used to be the terminal that owned interpretation, approval and
 * broadcasting. That role moved to the Husky Agent shell in `packages/agent`,
 * which runs the same deterministic pipeline from `@husky-agent/core` and
 * `@husky-agent/signer` inside the Pi harness. The old code here imported
 * `Conversation` / `interpret` / `InterpretError` from a build of the shell
 * that no longer exists, so it could not even compile.
 *
 * Rather than resurrect a second interpreter — which would be a second path to
 * signing, and a second thing to keep safe — this entry point refuses to run
 * and points at the supported one.
 */
import { fileURLToPath } from "node:url";

export const LEGACY_CLI_MESSAGE = `husky-agent: this legacy CLI has been retired.

The supported entry point is the Husky Agent Pi shell:

  pnpm dev                     # from the repository root

It runs the same deterministic prepare/approve/sign pipeline (transfer and swap
on HashKey Chain Testnet, chain ID 133) with the terminal approval prompt and
Ledger-via-Speculos signing. See README.md and docs/08-getting-started.md.
`;

export function runLegacyCli(): number {
  process.stderr.write(LEGACY_CLI_MESSAGE);
  return 1;
}

/** True when this module is the process entry point rather than an import. */
export function isDirectInvocation(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try {
    return fileURLToPath(moduleUrl) === argv1;
  } catch {
    return false;
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  process.exitCode = runLegacyCli();
}
