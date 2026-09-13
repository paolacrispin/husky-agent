import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";

import { registerHuskyBranding } from "./branding.js";
import { registerHuskyContext } from "./context.js";
import { registerHuskyPlaceholderTools } from "./placeholder-tools.js";

export const huskyExtension = (pi: ExtensionAPI): void => {
  registerHuskyBranding(pi);
  registerHuskyContext(pi);
  registerHuskyPlaceholderTools(pi);
};

export const huskyExtensionFactory: InlineExtension = {
  name: "husky-agent",
  factory: huskyExtension,
};

export { HUSKY_TAGLINE, huskyBrandingLines } from "./branding.js";
export { HUSKY_SYSTEM_PROMPT } from "./context.js";
export { huskyPlaceholderTools } from "./placeholder-tools.js";
