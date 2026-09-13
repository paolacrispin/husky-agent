import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";

import { registerHuskyBranding } from "./branding.js";
import { registerHuskyContext } from "./context.js";
import { registerHuskyTools } from "./tools.js";

/**
 * The whole Husky Agent extension: branding, the transaction-assistant system
 * prompt, and the deterministic Husky tools. Registered inline by
 * `src/cli.ts`, so it loads even when Pi's untrusted extension discovery is
 * disabled (`--no-extensions`).
 */
export const huskyExtension = (pi: ExtensionAPI): void => {
  registerHuskyBranding(pi);
  registerHuskyContext(pi);
  registerHuskyTools(pi);
};

export const huskyExtensionFactory: InlineExtension = {
  name: "husky-agent",
  factory: huskyExtension,
};

export { HUSKY_TAGLINE, huskyBrandingLines } from "./branding.js";
export { HUSKY_SYSTEM_PROMPT } from "./context.js";
export {
  SwapInput,
  TransferInput,
  createHuskyTools,
  huskyTools,
  registerHuskyTools,
  type HuskyOperationsLike,
  type HuskyToolDetails,
  type HuskyToolOptions,
} from "./tools.js";
