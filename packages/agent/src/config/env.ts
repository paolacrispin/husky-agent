import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const DEFAULT_PROVIDER = "deepseek";
export const DEFAULT_MODEL = "deepseek-v4-flash";

export type HuskyEnvironment = {
  provider: string;
  model: string;
  apiKey?: string;
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

function readRequiredSetting(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Husky Agent configuration error: ${name} must be non-empty.`);
  }
  return trimmed;
}

/** Load the workspace .env without replacing values supplied by the shell. */
export function loadHuskyEnvironment(): HuskyEnvironment {
  loadDotenv({ path: findWorkspaceEnvPath() });

  return {
    provider: readRequiredSetting("HUSKY_AGENT_PROVIDER", DEFAULT_PROVIDER),
    model: readRequiredSetting("HUSKY_AGENT_MODEL", DEFAULT_MODEL),
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() || undefined,
  };
}
