import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const DEFAULT_PROVIDER = "deepseek";
export const DEFAULT_MODEL = "deepseek-v4-flash";

export type HuskyEnvironment = {
  provider: string;
  model: string;
};

function findWorkspaceEnvPath(): string {
  let directory = resolve(process.cwd());

  while (true) {
    const candidate = join(directory, ".env");
    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);
    if (parent === directory) return join(process.cwd(), ".env");
    directory = parent;
  }
}

function readSetting(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Husky Agent configuration error: ${name} must be non-empty.`);
  }
  return trimmed;
}

/**
 * Resolve the interpretation model. Both documented spellings work:
 *
 *   HUSKY_AGENT_MODEL=deepseek:deepseek-v4-flash   (combined, per docs/06)
 *   HUSKY_AGENT_PROVIDER=deepseek
 *   HUSKY_AGENT_MODEL=deepseek-v4-flash            (split, per .env.example)
 *
 * An explicit HUSKY_AGENT_PROVIDER always wins over the combined prefix.
 */
export function resolveModelSelection(
  provider: string | undefined,
  model: string | undefined,
): { provider: string; model: string } {
  const combinedSeparator = model?.indexOf(":") ?? -1;
  if (provider === undefined && model !== undefined && combinedSeparator > 0) {
    const [providerPart, ...modelParts] = model.split(":");
    const modelPart = modelParts.join(":").trim();
    if (providerPart.trim() && modelPart) {
      return { provider: providerPart.trim(), model: modelPart };
    }
  }

  return {
    provider: provider ?? DEFAULT_PROVIDER,
    model: model ?? DEFAULT_MODEL,
  };
}

/**
 * Load the workspace `.env` without replacing values supplied by the shell.
 * Only the interpretation model lives here — chain, contract and Speculos
 * settings come from `.env.testnet` via `integration/config.ts`, and the
 * provider credential is read by the Pi harness itself.
 */
export function loadHuskyEnvironment(): HuskyEnvironment {
  loadDotenv({ path: findWorkspaceEnvPath() });

  return resolveModelSelection(
    readSetting("HUSKY_AGENT_PROVIDER"),
    readSetting("HUSKY_AGENT_MODEL"),
  );
}
