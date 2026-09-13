# Husky Agent

Husky Agent is a Husky-branded terminal assistant for clear, safe interaction
with future HSKChain integrations. The `packages/agent` workspace package is
the complete `husky-agent` CLI application shell, built on the Earendil Pi
coding-agent runtime.

The model interprets intent and can explain what an integration would need. The
Husky wallet, balances, policy, transaction, and health surfaces currently
return honest `not_connected` placeholder results. Transfer and swap are
non-executing placeholders: Husky Agent does not sign, submit, or confirm
transactions at this stage.

## Setup

Node.js 22.19 or newer is required by the Earendil Pi 0.85.1 runtime.

```bash
cp .env.example .env
$EDITOR .env                    # set DEEPSEEK_API_KEY
pnpm install
pnpm --filter @husky-agent/agent build
pnpm --filter @husky-agent/agent dev
```

The default configuration is DeepSeek V4 Flash:

```text
HUSKY_AGENT_PROVIDER=deepseek
HUSKY_AGENT_MODEL=deepseek-v4-flash
```

The CLI reads `DEEPSEEK_API_KEY`, `HUSKY_AGENT_PROVIDER`, and
`HUSKY_AGENT_MODEL` from the workspace `.env` or the process environment. Pi
CLI arguments such as `--provider` and `--model` take precedence over the
defaults. After a build, the binary is available as `husky-agent` from the
package's `dist` output.

## CLI identity

Husky Agent uses an original purple-and-white terminal mark, the `husky-agent`
title, a versioned status label, and `/about` for the current shell status and
examples. Runtime state is kept under `~/.husky-agent/agent`.

## Packages

| Package | Role |
|---|---|
| `packages/agent` | The full Husky Agent CLI application, extension registrations, prompt, and safe tool placeholders |
| `packages/core` | External chain-preparation interface for a future adapter |
| `packages/signer` | External signer and transport interface for a future adapter |
| `packages/flashblocks` | External live-status interface for a future adapter |
| `packages/contracts` | External contract package |
| `packages/cli` | Legacy chain-wiring reference; not used by `husky-agent` yet |

The chain-owned packages remain separate so their contracts and HSK behavior can
be connected in a later integration step.

## Development commands

```bash
pnpm run build
pnpm run dev
pnpm run test
pnpm run typecheck
```

The current CLI shell intentionally stops at model interpretation and adapter
status. It does not claim to execute operations.
