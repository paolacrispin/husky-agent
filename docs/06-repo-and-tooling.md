# 06 — Repo structure and tooling

## Layout (monorepo)

```
husky-agent/
  AGENTS.md
  hskchain/                    # official HSK reference skill (already exists)
    SKILL.md
    references/
  docs/                        # this spec set
  packages/
    agent/                     # Pi harness client (provider-agnostic), tools, system prompt
    core/                      # resolver, builder, simulator, policies, summary
    signer/                    # Signer interface + Speculos implementation
    contracts/                 # AMM in Foundry
    flashblocks/               # preconfirmation websocket client (UX only)
    cli/                       # terminal, orchestration, approval prompt
  scripts/
    speculos-start.sh
    speculos-stop.sh
    seed-testnet.sh            # wrapper around Foundry's Seed.s.sol
  contacts.json.example
  tokens.json.example
  .env.testnet.example
```

## Package manager / workspaces

**Decided: pnpm workspaces.**

## Language

**Decided: English**, everywhere — the system prompt, tool descriptions,
policy rejection messages, deterministic summaries, and all CLI output.

## Token config (`tokens.json`)

Static allowlist of operable tokens, in the same spirit as `contacts.json` (see
`03-agent-tools-spec.md`): the resolver and policy engine's token allowlist check
(`preBuildCheck`, see `04-security-policy-spec.md`) both read from this file. Lives
in `packages/core`, not in the LLM.

`tokens.json.example` format:
```json
{
  "HSK": {
    "address": "0x4200000000000000000000000000000000000006",
    "decimals": 18
  },
  "USDC": {
    "address": "0x0000000000000000000000000000000000000000",
    "decimals": 6
  }
}
```
`HSK` maps to the WHSK predeploy address (see `WHSK_ADDRESS` below) since the AMM
and the resolver only ever deal in ERC-20s — native HSK transfers still use the
native asset directly for `transfer`, but any HSK leg of a `swap` goes through
wrapped HSK. Real MockERC20 addresses and symbols get filled in once
`02-contracts-spec.md`'s open items (number/names of MockERC20s) are decided and
`Deploy.s.sol` has run.

## Environment variables (`.env.testnet.example`)

```
HSK_TESTNET_RPC_URL=https://testnet.hsk.xyz
HSK_TESTNET_CHAIN_ID=133
HSK_TESTNET_EXPLORER_URL=https://testnet-explorer.hsk.xyz
WHSK_ADDRESS=0x4200000000000000000000000000000000000006
HUSKY_AGENT_FACTORY_ADDRESS=<filled in post-deploy>
HUSKY_AGENT_ROUTER_ADDRESS=<filled in post-deploy>
SPECULOS_TRANSPORT_URL=<host:port of the Speculos container>
HSK_FLASHBLOCKS_WS_URL=wss://testnet-flashblocks.hsk.xyz/ws

# Interpretation model, resolved through the Pi harness as "<provider>:<model>".
# Any provider/model in Pi's builtin catalog works, e.g. "anthropic:claude-sonnet-5"
# or "openai:gpt-5".
HUSKY_AGENT_MODEL=deepseek:deepseek-v4-flash

# Provider credential, read by the Pi harness itself. Name it after whichever
# provider HUSKY_AGENT_MODEL selects (DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, ...).
# Never commit the real value.
DEEPSEEK_API_KEY=
```

`packages/core` doesn't read `HUSKY_AGENT_MODEL` or the provider credential —
those are consumed entirely inside `packages/agent` (see
`03-agent-tools-spec.md`). `EnvConfig` in `packages/core` only covers chain,
contract, and infrastructure config.

Note on the explorer: resolved via `hskchain/references/developer-workflows.md` —
`https://testnet-explorer.hsk.xyz` is the official HSK testnet explorer (the
`hashkeychain-testnet-explorer.alt.technology` URL seen elsewhere is not the one
HashKey's own docs list). Still worth a live check before the demo in case it's
changed, per the "verification habits" section of `hskchain/SKILL.md`.

Note on WHSK: `hskchain/references/network-and-contracts.md` only lists the
**mainnet** WHSK address (`0xB210D2120d57b758EE163cFfb43e73728c471Cf1`), which
differs from the testnet one above — they are not the same contract. The testnet
address (`0x4200...0006`) was confirmed directly against the HSK testnet explorer
via source-code verification: it's the standard OP Stack `WETH9` L2 predeploy,
used as WHSK on HSK. Re-verify this on the explorer before mainnet deployment —
don't assume the mainnet WHSK sits at the same predeploy address.

## Expected commands

```
pnpm install
(cd packages/contracts && forge install foundry-rs/forge-std --no-git --no-commit)
pnpm build                                 # builds core/agent/signer/flashblocks — required before `cli dev`
pnpm speculos:start
pnpm --filter contracts deploy:testnet     # deploys AMM + test tokens
pnpm --filter contracts seed:testnet       # provides initial liquidity
pnpm --filter cli dev                      # brings up the terminal agent
```

`packages/cli` depends on the other TS packages through their compiled
`dist/` output (each package's `package.json` `main`/`types` point there), not
their `src/`. Re-run `pnpm build` after changing `core`, `agent`, `signer`, or
`flashblocks` — `cli dev` will fail to resolve the module otherwise, not with
a helpful error but a plain `Cannot find module`.

`packages/contracts/lib/` (the `forge-std` dependency) is gitignored, not vendored
— it's fetched via `forge install`, same as `node_modules` via `pnpm install`. Use
`--no-git`: the repo root already has its own `.git`, and a plain `forge install`
tries to add `forge-std` as a git submodule, which conflicts with that.

## Open items

None currently blocking scaffolding — remaining decisions live in
`02-contracts-spec.md` (MockERC20 count/names, liquidity, slippage) and
`05-signing-spec.md` (mnemonic, Ledger app version).
