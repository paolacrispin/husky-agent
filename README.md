# Husky Agent

Husky Agent is a terminal assistant that executes two everyday DeFi operations on
**HashKey Chain Testnet (chain ID 133)** from natural language:

- `send 5 USDC to juan` — transfer native HSK or an allowlisted ERC-20 to a saved
  contact or a direct `0x` address.
- `swap 10 USDC for HUSKY` — swap two allowlisted tokens through the project's
  deployed `HuskyAgentRouter`, with an exact-amount `approve` leg when the
  allowance is short.

The active application is the Husky-branded Pi shell in `packages/agent`
(`pnpm dev`). `packages/cli` is retired — it now only prints a pointer to the
supported entry point, see "Legacy CLI" below.

## How a request is handled

```
your instruction
  → model (Pi harness) picks one tool and extracts human-readable parameters
  → deterministic resolver (@husky-agent/core): contacts.json, tokens.json, decimals
  → preBuildCheck: token/contract allowlist, non-zero amount, live balance
  → build (viem): native value + ERC-20 calldata, or router swapExactTokensForTokens
  → simulate (eth_call / eth_simulateV1 for the two-leg approve+swap plan)
  → postSimulateCheck: decode the built calldata, match it to the resolved intent
  → deterministic summary rendered from the decoded transaction
  → YOUR explicit approval in the terminal
  → sign (Ledger via Speculos) → broadcast → wait for the sealed receipt
```

**The model never signs, builds calldata, picks an address, converts amounts to
base units, sets slippage or gas, or approves anything.** It only chooses a tool
and passes `token` / `amount` / `recipient` (or `tokenIn` / `tokenOut` /
`amountIn`) as human-readable strings; both Pi's TypeBox schema and an
independent zod schema reject anything else before the resolver runs. Slippage
is fixed at 0.50% by `packages/core`. See `AGENTS.md` and `docs/` for the full
specs.

## Setup

Node.js 22.19 or newer and pnpm.

```bash
pnpm install

# 1. Interpretation model + its provider credential (never committed)
cp .env.example .env
$EDITOR .env                        # set DEEPSEEK_API_KEY (or your provider's)

# 2. Chain, contracts and Speculos settings (already filled with the shared
#    deployed AMM and the testnet-only identity)
cp .env.testnet.example .env.testnet

# 3. Operable tokens and your contacts
cp tokens.json.example tokens.json
cp contacts.json.example contacts.json

pnpm build
pnpm dev
```

`.env` and `.env.testnet` hold different things and neither replaces the other:

| File | Contents |
|---|---|
| `.env` | `DEEPSEEK_API_KEY` (or your provider's), `HUSKY_AGENT_PROVIDER`, `HUSKY_AGENT_MODEL` |
| `.env.testnet` | `HSK_TESTNET_RPC_URL`, `HSK_TESTNET_CHAIN_ID`, contract addresses, `WHSK_ADDRESS`, `SPECULOS_TRANSPORT_URL`, `HSK_FLASHBLOCKS_WS_URL`, the testnet-only mnemonic |

The model is configured either as `HUSKY_AGENT_PROVIDER` + `HUSKY_AGENT_MODEL`,
or as one combined `HUSKY_AGENT_MODEL=<provider>:<model>` value; an explicit
provider wins. Any provider/model in Pi's catalog works.

Signing goes through a Ledger Ethereum app on the Speculos emulator — there is
no path that bypasses it, including for testing:

```bash
pnpm speculos:start     # then, when done
pnpm speculos:stop
```

`docs/08-getting-started.md` covers the two Speculos setup gotchas (docker group
membership, the Ethereum app `.elf`) and troubleshooting.

## Using it

```text
send 0.001 HSK to 0xAbC…                 # native value transfer
send 5 USDC to juan                      # ERC-20 transfer to a saved contact
swap 10 USDC for HUSKY                   # swap; adds an exact approve leg if needed
```

Every write prints the deterministic summary and asks for an explicit
confirmation before anything is signed. Any answer that is not an explicit yes
rejects the operation. For a swap that needs an allowance, **one** approval
covers both legs, which are then submitted sequentially — the swap is only sent
after the approve receipt succeeds.

Read-only tools: `husky_wallet_status`, `husky_balances`, `husky_policy_status`,
`husky_transaction_status`, `husky_doctor_health`.

## What the shell disables

The shell is a transaction assistant, not a coding agent, so `packages/agent`
launches Pi with:

- `--no-builtin-tools` — no `bash`, `read`, `write`, `edit`, `grep`, `find`, `ls`.
- `--no-extensions` — untrusted extension discovery is off; only Husky's own
  inline extension loads.
- `--no-skills`, `--no-prompt-templates`, `--no-context-files` — no external
  text is injected into the session's instructions.

A `tool_call` handler additionally blocks any built-in shell/file tool by name,
so a resumed session or a runtime race cannot reintroduce them.

## Flashblocks

After a transaction is submitted, the shell subscribes to HSK's Flashblocks
websocket for a ~200ms preconfirmation. It is purely a latency-perception
layer: a preconfirmation is labelled **"NOT final"**, and success is only ever
reported from the normal RPC receipt. If Flashblocks is unavailable or
malformed, the flow continues to wait for the receipt and says so.

## Ledger clear signing

The custom `HuskyAgentRouter` has no Ledger CAL descriptor, so the swap leg is
blind-signed on the device. That is why the terminal summary is rendered from
the decoded, built calldata — it, not the device screen, is what you are
approving. `ledger.md` has the details.

## Commands

```bash
pnpm build       # core, signer, flashblocks, cli, agent
pnpm typecheck   # the same five packages, including their tests
pnpm test        # the same five packages
pnpm dev         # the Husky Agent shell
```

Solidity lives in `packages/contracts` and is built and tested with Foundry,
separately from the TypeScript workspace (see `docs/02-contracts-spec.md`).
Redeploying the AMM is **not** required to run the agent — the deployed
addresses are already in `.env.testnet.example`.

## Packages

| Package | Role |
|---|---|
| `packages/agent` | The Husky Agent application: Pi harness entry point, tool schemas, system prompt, deterministic chain adapter |
| `packages/core` | Resolver, builder, simulator, policy engine, deterministic summaries, `prepareTransfer` / `prepareSwap` |
| `packages/signer` | `Signer` interface + the Speculos transport implementation |
| `packages/flashblocks` | Flashblocks websocket client (UX only) |
| `packages/cli` | Retired terminal; prints a pointer to `pnpm dev` |
| `packages/contracts` | The AMM in Solidity (Foundry) |

## Legacy CLI

`packages/cli` used to own interpretation, approval and broadcasting. That role
moved to `packages/agent`, and the old code imported a build of the shell that
no longer exists. The package still builds, but its entry point refuses to run
and points at `pnpm dev`:

```bash
node packages/cli/dist/main.js
```
