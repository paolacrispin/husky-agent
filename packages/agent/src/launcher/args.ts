const MODEL_FLAGS = new Set(["--model", "--provider", "--models"]);

function isModelSelectionFlag(argument: string): boolean {
  if (MODEL_FLAGS.has(argument)) return true;
  return [...MODEL_FLAGS].some((flag) => argument.startsWith(`${flag}=`));
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
