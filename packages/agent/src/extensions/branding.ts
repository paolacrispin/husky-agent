import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { getHuskyAgentVersion } from "../config/paths.js";
import { HUSKY_LOGO_LINES } from "./husky-logo.js";

const MUTED = "[38;5;153m";
const BLUE = "[38;5;81m";
const RESET = "[0m";

export const HUSKY_TAGLINE = "Husky Agent: cool tools, clear intent.";

export { HUSKY_LOGO_LINES };

export function huskyBrandingLines(version = getHuskyAgentVersion()): string[] {
  return [
    ...HUSKY_LOGO_LINES,
    `${BLUE}Husky Agent${RESET} ${MUTED}v${version}${RESET}`,
    `${MUTED}${HUSKY_TAGLINE}${RESET}`,
    `${MUTED}Try: "show wallet status" or "show balances"${RESET}`,
  ];
}

function aboutLines(version: string): string[] {
  return [
    ...huskyBrandingLines(version),
    "",
    `${BLUE}Husky Agent${RESET} uses DeepSeek V4 Flash by default.`,
    `${MUTED}Read surfaces return not_connected until their adapters are connected.${RESET}`,
    `${MUTED}Transfer and swap are safe placeholders; they cannot sign or submit actions.${RESET}`,
    `${MUTED}Try: "explain a transfer" or "show policy status".${RESET}`,
  ];
}

export const registerHuskyBranding: ExtensionFactory = (pi) => {
  pi.on("session_start", (_event, ctx) => {
    const version = getHuskyAgentVersion();
    ctx.ui.setTitle("husky-agent");
    ctx.ui.setStatus("husky-agent", `Husky Agent v${version} · adapters pending`);

    if (ctx.mode === "tui") {
      ctx.ui.setHeader(() => new Text(huskyBrandingLines(version).join("\n"), 0, 0));
    } else {
      ctx.ui.setWidget("husky-agent-branding", huskyBrandingLines(version), {
        placement: "aboveEditor",
      });
    }
  });

  pi.registerCommand("about", {
    description: "Show Husky Agent version, examples, and adapter status.",
    handler: async (_args, ctx) => {
      ctx.ui.setWidget("husky-agent-about", aboutLines(getHuskyAgentVersion()), {
        placement: "aboveEditor",
      });
      ctx.ui.notify("Husky Agent is ready; blockchain adapters are not connected yet.", "info");
    },
  });
};
