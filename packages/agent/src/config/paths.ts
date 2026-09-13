import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HUSKY_CONFIG_ROOT = join(homedir(), ".husky-agent");

export function getPackageRoot(): string {
  return PACKAGE_ROOT;
}

export function getHuskyAgentDir(): string {
  return join(HUSKY_CONFIG_ROOT, "agent");
}

export function getHuskySessionDir(): string {
  return join(getHuskyAgentDir(), "sessions");
}

export function getHuskyAgentVersion(): string {
  const packageJsonPath = join(getPackageRoot(), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown;
  };

  return typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version
    : "0.1.0";
}
