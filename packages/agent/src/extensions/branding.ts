import type { ExtensionFactory, SessionEntry } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { getHuskyAgentVersion } from "../config/paths.js";
import { HUSKY_LOGO_LINES } from "./husky-logo.js";

const MUTED = "[38;5;245m";
const ACCENT = "[38;2;164;109;231m";
const RESET = "[0m";
const SPLASH_ENTRY_TYPE = "husky-agent-splash";

export const HUSKY_TAGLINE = "On-chain terminal agent — check balances, send tokens, and swap currencies.";

export { HUSKY_LOGO_LINES };

export function huskyBrandingLines(version = getHuskyAgentVersion()): string[] {
  return [
    ...HUSKY_LOGO_LINES,
    `${ACCENT}husky-agent${RESET} ${MUTED}v${version}${RESET}`,
    `${MUTED}${HUSKY_TAGLINE}${RESET}`,
    `${MUTED}Private keys stay in your Ledger hardware wallet.${RESET}`,
    "",
    `${MUTED}Try:${RESET}`,
    `  ${ACCENT}"Show my balances"${RESET}`,
    `  ${ACCENT}"Send 5 USDC to camila"${RESET}`,
    `  ${ACCENT}"Send 0.001 HSK to 0x8f3cA91d7B2e6F4aC5D18E0b9A73c2F61d4E8b27"${RESET}`,
    `  ${ACCENT}"Swap 10 USDC for HUSKY"${RESET}`,
    `  ${ACCENT}/doctor${RESET} ${MUTED}— health checks${RESET}    ${ACCENT}/about${RESET} ${MUTED}— what is husky-agent?${RESET}`,
  ];
}

function aboutLines(version: string): string[] {
  return [
    `${ACCENT}husky-agent${RESET} ${MUTED}v${version}${RESET}`,
    `${MUTED}${HUSKY_TAGLINE}${RESET}`,
    `${MUTED}Private keys stay in your Ledger hardware wallet.${RESET}`,
    `${MUTED}Every transfer and swap shows a deterministic summary and requires your approval.${RESET}`,
  ];
}

function shouldAddSplash(entries: readonly SessionEntry[]): boolean {
  return !entries.some((entry) => {
    switch (entry.type) {
      case "message":
      case "custom_message":
      case "compaction":
      case "branch_summary":
        return true;
      case "custom":
        return entry.customType === SPLASH_ENTRY_TYPE;
      default:
        return false;
    }
  });
}

export const registerHuskyBranding: ExtensionFactory = (pi) => {
  pi.registerEntryRenderer<string[]>(SPLASH_ENTRY_TYPE, (entry) => {
    return new Text((entry.data ?? []).join("\n"), 0, 0);
  });

  pi.on("session_start", (_event, ctx) => {
    const version = getHuskyAgentVersion();
    ctx.ui.setTitle("husky-agent");
    ctx.ui.setStatus("husky-agent", `Husky Agent v${version} · HSK testnet · approval required`);

    if (ctx.mode === "tui" && shouldAddSplash(ctx.sessionManager.getEntries())) {
      pi.appendEntry(SPLASH_ENTRY_TYPE, huskyBrandingLines(version));
    }
  });

  pi.registerCommand("about", {
    description: "Show Husky Agent version, supported operations, and approval rules.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(aboutLines(getHuskyAgentVersion()).join("\n"), "info");
    },
  });
};
