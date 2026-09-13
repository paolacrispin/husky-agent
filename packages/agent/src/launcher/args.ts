const MODEL_FLAGS = new Set(["--model", "--provider", "--models"]);

/**
 * Hardening flags the Husky Agent shell always applies. Each one is matched in
 * both spellings (`--flag` and `--flag=value` where applicable) so a
 * user-supplied copy is never sent twice. Documented in README.md under
 * "What the shell disables".
 */
export const HARDENING_FLAGS = [
  // Only the inline Husky extension loads. Untrusted extension discovery
  // (settings, packages, .pi/extensions) is off, so no other extension can
  // register tools, commands, or providers into this session.
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  // AGENTS.md / CLAUDE.md are instructions for coding agents in this repo,
  // not for the transaction assistant. Keeping them out of the session keeps
  // the model's instructions limited to this project's own system prompt.
  "--no-context-files",
  // Pi's shell/file tools (bash, read, write, edit, grep, find, ls) are not
  // part of the transaction pipeline. Husky's tools are extension tools, so
  // this leaves exactly the Husky tool set active.
  "--no-builtin-tools",
] as const;

function isModelSelectionFlag(argument: string): boolean {
  if (MODEL_FLAGS.has(argument)) return true;
  return [...MODEL_FLAGS].some((flag) => argument.startsWith(`${flag}=`));
}

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.some((argument) => argument === flag || argument.startsWith(`${flag}=`));
}

export function hasExplicitModelSelection(args: readonly string[]): boolean {
  return args.some(isModelSelectionFlag);
}

/** Add defaults while preserving every argument supplied to the Pi CLI. */
export function withDefaultModelSelection(
  args: readonly string[],
  provider: string,
  model: string,
): string[] {
  const forwarded = [...args];
  if (hasExplicitModelSelection(forwarded)) return forwarded;

  return ["--provider", provider, "--model", model, ...forwarded];
}

/**
 * Apply the shell's hardening flags. User arguments are appended afterwards so
 * anything they pass explicitly still wins, and a flag they already supplied
 * is not duplicated.
 */
export function withHuskyHardening(args: readonly string[]): string[] {
  const missing = HARDENING_FLAGS.filter((flag) => !hasFlag(args, flag));
  return [...missing, ...args];
}
