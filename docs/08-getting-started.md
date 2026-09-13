# 08 — Getting started (onboarding a teammate)

This is the practical "clone it and run it" doc for the active Husky Agent shell.
For *why* things are built this way, read `AGENTS.md` and the numbered specs it
points to — this doc is just the checklist to get from a fresh clone to a running
agent that can transfer and swap on HashKey Chain Testnet.

## What's already done for you

The project shares one testnet identity and one already-deployed AMM across the
whole team — you do not need to generate a mnemonic, fund an account, or deploy
contracts. All of that lives in the committed `.env.testnet.example` and
`tokens.json.example`:

- A dedicated **testnet-only mnemonic** (`TESTNET_MNEMONIC`), safe to share by
  design — see `05-signing-spec.md`. Its address
  (`0xcD2E570Dc241E488c7BFf32FD377b4e3c93f775a`) is funded with testnet HSK and
  holds a demo balance of the project's two mock tokens.
- **Contracts already deployed** on HSK testnet (Factory, Router, `USDC` and
  `HUSKY` MockERC20s, both liquidity pools seeded) — addresses and explorer
  links are in `02-contracts-spec.md`, and already filled into
  `.env.testnet.example` / `tokens.json.example`.

**What you actually need to supply** is a credential for whichever LLM provider
the agent talks to — see step 4.

## 1. Prerequisites

- Node.js ≥ 22.19 and [pnpm](https://pnpm.io/installation) (`corepack enable`
  is enough if you have a recent Node).
- [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash
  && foundryup`) — only needed if you'll touch `packages/contracts`; not
  required just to run the agent against the already-deployed contracts.
- Docker, for Speculos (the Ledger emulator) — see step 6, there's a
  permissions gotcha.
- An API key for the model provider in `HUSKY_AGENT_MODEL` (default:
  DeepSeek — see step 4).

## 2. Install and build

```bash
git clone <this repo> husky-agent
cd husky-agent
pnpm install
pnpm build     # core, signer, flashblocks, cli, agent — required before `pnpm dev`
```

If you'll touch `packages/contracts`, also fetch its one dependency (gitignored,
not vendored — see `06-repo-and-tooling.md` for why `--no-git` matters here):

```bash
(cd packages/contracts && forge install foundry-rs/forge-std --no-git --no-commit)
```

## 3. Copy the config templates — three files, two purposes

```bash
cp .env.example .env                    # interpretation model + provider credential
cp .env.testnet.example .env.testnet    # chain, contracts, Speculos, Flashblocks
cp tokens.json.example tokens.json
cp contacts.json.example contacts.json
```

`.env` and `.env.testnet` are both loaded at startup and neither replaces the
other:

| File | Loaded by | Contents |
|---|---|---|
| `.env` | `packages/agent/src/config/env.ts` | `HUSKY_AGENT_PROVIDER`, `HUSKY_AGENT_MODEL`, the provider credential (`DEEPSEEK_API_KEY`, …) |
| `.env.testnet` | `packages/agent/src/integration/config.ts` | `HSK_TESTNET_RPC_URL`, `HSK_TESTNET_CHAIN_ID`, `HUSKY_AGENT_ROUTER_ADDRESS`, `HUSKY_AGENT_FACTORY_ADDRESS`, `WHSK_ADDRESS`, `SPECULOS_TRANSPORT_URL`, `HSK_FLASHBLOCKS_WS_URL`, `TESTNET_MNEMONIC` |

Shell-exported variables win over both files, so `HSK_TESTNET_CHAIN_ID=133 pnpm dev`
behaves as expected. `HUSKY_AGENT_ROOT` overrides the repo root used to find
these files, and `HUSKY_TESTNET_ENV_PATH` points at a different `.env.testnet`.

`tokens.json` and `contacts.json` are yours to edit freely (add your own test
contacts) — they're gitignored, so nothing you put there leaks. Add at least
one alias to `contacts.json` if you want to test transfers by name instead of
by raw address (the demo script's Scenario 1 uses `"juan"`).

## 4. Fill in the one thing that's actually missing: the model credential

Open `.env` and set the credential matching your model — with the default,
`DEEPSEEK_API_KEY`. Two accepted spellings for the model:

```bash
HUSKY_AGENT_PROVIDER=deepseek
HUSKY_AGENT_MODEL=deepseek-v4-flash
# — or, equivalently —
HUSKY_AGENT_MODEL=deepseek:deepseek-v4-flash
```

An explicit `HUSKY_AGENT_PROVIDER` wins over a combined prefix. Any
provider/model in Pi's catalog works; the deterministic pipeline downstream does
not care which one answered. Everything else in `.env.testnet` can stay as-is.

## 5. Speculos (Ledger emulator)

The agent signs every transaction through Speculos — there's no path that
bypasses it, even for testing. Two one-time setup steps, both outside this
repo's control:

**a. Docker group membership.** If `docker ps` gives you a permission error
even after being added to the `docker` group, that's expected — group
membership is read at login, so a group change doesn't apply to your current
shell/session. Open a **new terminal** (or fully log out and back in) and
re-check `docker ps`. `newgrp docker` sometimes works as a faster alternative,
but isn't available on every system.

**b. The Ethereum app binary.** Speculos needs a real Ledger Ethereum app
`.elf` at `assets/app.elf` — Ledger doesn't bundle this in the base Speculos
image, since Ledger apps are versioned/signed per device model. If
`assets/app.elf` is missing or empty, get one from
[LedgerHQ/app-ethereum](https://github.com/LedgerHQ/app-ethereum) (a compiled
release artifact for the Nano X, or build it yourself) and place it there
before starting Speculos.

Once both are sorted:

```bash
pnpm speculos:start
pnpm speculos:status
# ...
pnpm speculos:stop
```

## 6. Run the agent

```bash
pnpm dev
```

On startup it prints the Husky banner, then drops into a prompt. The signing
address comes from Speculos the first time a write is prepared (and via
`husky_wallet_status`). Try:

```
send 5 USDC to juan
swap 10 USDC for HUSKY
```

Every operation shows a deterministic, plain-English summary built from the
decoded transaction and asks for explicit confirmation before anything is
signed or sent — see `04-security-policy-spec.md` for exactly what that summary
is built from. An answer that isn't an explicit yes rejects the operation.

## 7. Verify the workspace

```bash
pnpm build      # five TypeScript packages, including the retired-cli stub
pnpm typecheck  # the same packages, tests included
pnpm test       # same packages; core/signer/flashblocks/agent/cli
```

Foundry tests for the AMM are separate: `cd packages/contracts && forge test`.

## Troubleshooting

- **`Cannot find module '@husky-agent/...'`** — you skipped `pnpm build` (step
  2), or edited `core`/`signer`/`flashblocks`/`agent` and need to rebuild. The
  agent consumes those packages' compiled `dist/`, not their `src/`.
- **`Missing .../.env.testnet. Copy .env.testnet.example to .env.testnet first.`**
  — step 3 was skipped, or you ran from a directory whose repo root isn't the
  one holding the file (set `HUSKY_AGENT_ROOT` if so).
- **`Husky Agent only supports HashKey Chain Testnet (chain ID 133)`** — an
  exported `HSK_TESTNET_CHAIN_ID` (or one in `.env.testnet`) is not `133`. The
  agent deliberately refuses any other chain.
- **`forge script` prints "Some transactions were discarded by the RPC
  node"`** — seen against the real HSK testnet RPC and appears benign (every
  transaction we checked afterward was actually mined). Don't trust the
  console log alone either way — verify with `cast code <address>` and
  `cast call` against the actual chain state, the way `02-contracts-spec.md`'s
  deployment record was verified.
- **Speculos won't start** — almost always one of the two setup steps in
  section 5, not a code issue. Confirm `docker ps` works in a *fresh* shell
  first, then confirm `assets/app.elf` is non-empty.
- **"Speculos isn't running"** even though the container is up — check
  `SPECULOS_TRANSPORT_URL` in `.env.testnet` matches the port Speculos actually
  bound (default `127.0.0.1:40000`).
- **`node packages/cli/dist/main.js` prints a retirement notice** — expected.
  `packages/cli` is no longer an entry point; use `pnpm dev`.
