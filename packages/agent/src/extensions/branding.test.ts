import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { HUSKY_TAGLINE, huskyBrandingLines, registerHuskyBranding } from "./branding.js";

const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;

function plainBranding(): string {
  return huskyBrandingLines("1.2.3").join("\n").replace(ANSI_ESCAPE, "");
}

function brandingHarness(entries: Array<{ type: string; customType?: string }> = []) {
  let sessionStart: ((event: SessionStartEvent, ctx: ExtensionContext) => unknown) | undefined;
  let about: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
  const appendEntry = vi.fn();
  const registerEntryRenderer = vi.fn();
  const pi = {
    appendEntry,
    registerEntryRenderer,
    on: vi.fn((event: string, handler: typeof sessionStart) => {
      if (event === "session_start") sessionStart = handler;
    }),
    registerCommand: vi.fn((name: string, command: { handler: typeof about }) => {
      if (name === "about") about = command.handler;
    }),
  } as unknown as ExtensionAPI;

  registerHuskyBranding(pi);

  const ui = {
    notify: vi.fn(),
    setStatus: vi.fn(),
    setTitle: vi.fn(),
    setHeader: vi.fn(),
    setWidget: vi.fn(),
  };
  const ctx = {
    mode: "tui",
    sessionManager: { getEntries: () => entries },
    ui,
  } as unknown as ExtensionContext;

  return { about, appendEntry, ctx, registerEntryRenderer, sessionStart, ui };
}

describe("Husky branding", () => {
  it("uses the requested Ledger-focused startup structure and examples", () => {
    const output = plainBranding();

    expect(output).toContain("husky-agent v1.2.3");
    expect(output).toContain(HUSKY_TAGLINE);
    expect(output).toContain("Private keys stay in your Ledger hardware wallet.");
    expect(output).toContain('"Show my balances"');
    expect(output).toContain('"Send 5 USDC to camila"');
    expect(output).toContain('"Send 0.001 HSK to 0x8f3cA91d7B2e6F4aC5D18E0b9A73c2F61d4E8b27"');
    expect(output).toContain('"Swap 10 USDC for HUSKY"');
    expect(output).not.toMatch(/smart contract|uniswap|enclave/i);
  });

  it("adds the splash once despite Pi's new-session metadata entries", () => {
    const { appendEntry, ctx, registerEntryRenderer, sessionStart, ui } = brandingHarness([
      { type: "model_change" },
      { type: "thinking_level_change" },
    ]);

    expect(registerEntryRenderer).toHaveBeenCalledWith("husky-agent-splash", expect.any(Function));
    sessionStart?.({ type: "session_start", reason: "startup" }, ctx);

    expect(appendEntry).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalledWith("husky-agent-splash", expect.any(Array));
    expect(ui.setHeader).not.toHaveBeenCalled();
    expect(ui.setWidget).not.toHaveBeenCalled();
  });

  it("does not add another splash when the session already has a conversation", () => {
    const { appendEntry, ctx, sessionStart } = brandingHarness([{ type: "message" }]);

    sessionStart?.({ type: "session_start", reason: "reload" }, ctx);

    expect(appendEntry).not.toHaveBeenCalled();
  });

  it("does not duplicate a splash already stored in the transcript", () => {
    const { appendEntry, ctx, sessionStart } = brandingHarness([
      { type: "custom", customType: "husky-agent-splash" },
    ]);

    sessionStart?.({ type: "session_start", reason: "reload" }, ctx);

    expect(appendEntry).not.toHaveBeenCalled();
  });

  it("shows /about as a temporary notification without repeating the logo", async () => {
    const { about, ctx, ui } = brandingHarness();

    await about?.("", ctx);

    expect(ui.notify).toHaveBeenCalledOnce();
    expect(ui.notify.mock.calls[0]?.[0]).toContain("husky-agent");
    expect(ui.setWidget).not.toHaveBeenCalled();
  });
});
