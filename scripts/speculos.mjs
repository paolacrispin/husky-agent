#!/usr/bin/env node
/**
 * Speculos lifecycle helper — see ledger.md.
 *
 *   pnpm speculos:start   boot the emulator and make sure it is ready to sign
 *   pnpm speculos:stop    tear the stack down
 *   pnpm speculos:logs    follow the container logs
 *   pnpm speculos:status  report what the device is currently showing
 *
 * `start` is more than `docker compose up`, because three things have to be
 * handled for the emulator to be usable:
 *
 *   1. The image ships no apps, so the Ethereum firmware is downloaded into
 *      ./apps on first run.
 *   2. The seed is read from TESTNET_MNEMONIC in .env.testnet, so the emulated
 *      device derives the account this project already funds. Speculos' own
 *      default seed would silently give us a different, empty address.
 *   3. Blind signing is off in a factory-fresh device, and every contract call
 *      this project makes needs it (see the "Known issue" section of ledger.md).
 *      We turn it on over the REST API and let --save-nvram persist it, so later
 *      starts come up already enabled.
 *
 * If main_nvram.bin is missing we deliberately boot with --save-nvram only:
 * passing --load-nvram without that file makes Speculos abort during startup
 * rather than warn and continue.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS_DIR = path.join(ROOT, "apps");
const ELF_NAME = "nanox#ethereum#1.22.3.elf";
const ELF_PATH = path.join(APPS_DIR, ELF_NAME);
const ELF_URL =
  "https://github.com/LedgerHQ/app-ethereum/releases/download/1.22.3/app-1.22.3-nanox.elf";
const NVRAM_PATH = path.join(APPS_DIR, "main_nvram.bin");

const ENV_FILE = path.join(ROOT, ".env.testnet");
const DEFAULT_APDU_PORT = 40000;
const API = process.env.SPECULOS_API_URL ?? "http://127.0.0.1:5000";
const BOOT_TIMEOUT_MS = 90_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimal KEY=VALUE reader, so we do not pull in a dotenv dependency. */
function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  const env = parseEnvFile(ENV_FILE);
  const url = env.SPECULOS_TRANSPORT_URL ?? `127.0.0.1:${DEFAULT_APDU_PORT}`;
  const parsed = Number(url.split(":").pop());
  return {
    seed: env.TESTNET_MNEMONIC ?? null,
    apduPort: Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_APDU_PORT,
    present: existsSync(ENV_FILE),
  };
}

function requireSeed(env) {
  if (env.seed) return env;
  const hint = env.present
    ? `TESTNET_MNEMONIC is not set in ${path.relative(ROOT, ENV_FILE)}.`
    : `Missing ${path.relative(ROOT, ENV_FILE)}.`;
  throw new Error(`${hint} Copy .env.testnet.example to .env.testnet first.`);
}

function compose(args, env = {}) {
  const res = spawnSync("docker", ["compose", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    // docker-compose.yml requires SPECULOS_SEED. Commands that do not recreate
    // the container still need it to parse, so give Compose a placeholder.
    env: { SPECULOS_SEED: "-", ...process.env, ...env },
  });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

// ---------------------------------------------------------------------------
// Device REST API
// ---------------------------------------------------------------------------

async function readScreen() {
  const res = await fetch(`${API}/events?currentscreenonly=true`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { events } = await res.json();
  return events
    .map((e) => e.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function press(button) {
  await fetch(`${API}/button/${button}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "press-and-release" }),
    signal: AbortSignal.timeout(4000),
  });
  await sleep(650);
}

async function waitForApi() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await readScreen();
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Screen navigation
//
// From the app home screen:  right -> menu ("App settings") -> both -> settings
// Inside settings:           right walks the items and ends on "Back";
//                            both on "Back" -> menu; left on menu -> home.
// ---------------------------------------------------------------------------

const SETTINGS_ITEMS = [
  "blind signing",
  "nonce",
  "raw messages",
  "debug contracts",
  "smart accounts",
  "transaction hash",
];

/** Turn blind signing on if it is off. Returns the state it ended up in. */
async function ensureBlindSigning() {
  const deadline = Date.now() + 45_000;
  let last = "(no screen read)";

  while (Date.now() < deadline) {
    last = await readScreen();
    const t = last.toLowerCase();

    // "disabled" does not contain "enabled", so these two are unambiguous.
    if (t.includes("blind signing") && t.includes("enabled")) return "enabled";
    if (t.includes("blind signing") && t.includes("disabled")) {
      console.log("  blind signing is OFF — enabling it");
      await press("both");
      continue;
    }
    if (t.includes("app settings")) {
      await press("both");
      continue;
    }
    await press("right");
  }

  throw new Error(
    `could not reach the blind signing setting. Last screen: "${last}"`,
  );
}

/** Walk back out of the settings menu to the app home screen. */
async function returnToHome() {
  for (let i = 0; i < 14; i++) {
    const t = (await readScreen()).toLowerCase();
    if (t.includes("app is ready")) return true;
    if (t.includes("back")) {
      await press("both");
      continue;
    }
    if (SETTINGS_ITEMS.some((item) => t.includes(item))) {
      await press("right");
      continue;
    }
    await press("left");
  }
  return false;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function ensureElf() {
  if (existsSync(ELF_PATH)) return;
  mkdirSync(APPS_DIR, { recursive: true });
  console.log(`Downloading Ethereum app -> apps/${ELF_NAME}`);
  const res = await fetch(ELF_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100_000) {
    throw new Error(`downloaded file looks wrong (${buf.length} bytes)`);
  }
  writeFileSync(ELF_PATH, buf);
  console.log(`  ok, ${buf.length} bytes`);
}

async function start() {
  const env = requireSeed(loadEnv());
  await ensureElf();

  // A factory-fresh device has no NVRAM, and --load-nvram on a missing file
  // aborts Speculos' startup. Boot without it, enable blind signing, and let
  // --save-nvram write the file for subsequent runs.
  const hasNvram = existsSync(NVRAM_PATH);
  if (!hasNvram) {
    console.log("No NVRAM yet — first boot, will configure blind signing.");
  }

  console.log("Starting Speculos...");
  const code = compose(["up", "-d"], {
    SPECULOS_SEED: env.seed,
    SPECULOS_APDU_PORT: String(env.apduPort),
    SPECULOS_NVRAM_FLAGS: hasNvram ? "--load-nvram --save-nvram" : "--save-nvram",
  });
  if (code !== 0) throw new Error("docker compose up failed");

  if (!(await waitForApi())) {
    console.error("\nSpeculos never became reachable. Recent logs:\n");
    compose(["logs", "--tail=25"]);
    throw new Error(`no response from ${API}`);
  }

  const state = await ensureBlindSigning();
  const home = await returnToHome();

  if (!existsSync(NVRAM_PATH)) {
    console.log("  warning: main_nvram.bin was not written, settings will not persist");
  }
  if (!home) {
    console.log("  warning: left the device inside the settings menu");
  }

  console.log(`
Speculos is up.

  device screen   ${API}            (click it to press buttons)
  APDU endpoint   127.0.0.1:${env.apduPort}   (SPECULOS_TRANSPORT_URL)
  seed            TESTNET_MNEMONIC from .env.testnet
  blind signing   ${state}

Press "both" on the device to approve a transaction; "right" on the final
screen rejects it instead.`);
}

function stop() {
  process.exit(compose(["down"]));
}

function logs() {
  process.exit(compose(["logs", "-f", "--tail=50"]));
}

async function status() {
  try {
    console.log(`device screen: ${await readScreen()}`);
  } catch (err) {
    console.log(`Speculos is not reachable at ${API} (${err.message})`);
    process.exit(1);
  }
}

const commands = { start, stop, logs, status };
const command = process.argv[2] ?? "start";

if (!commands[command]) {
  console.error(`unknown command "${command}" — use: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

commands[command]().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
