# Husky-Agent

A terminal agent that turns plain-English instructions — *"send 10 USDC to alice"*,
*"swap 5 HSK for USDC"* — into real DeFi operations on **HashKey Chain Testnet**
(chain ID 133).

Husky-Agent is a customized agent built on top of the **[Pi Agent
Harness](https://github.com/earendil-works/pi)**. Pi is agent- and
provider-agnostic: it exposes a unified LLM API over a catalog of agents and
providers, so this project can be driven by Claude, Codex, DeepSeek, or any other
agent Pi supports — without changing application code.

## What it does

Two operations, on one chain, with a human in the loop for every one of them:

- **Transfer** a token to a contact or a `0x` address.
- **Swap** between two tokens through the project's own AMM.

Signing happens on a **Ledger emulator (Speculos)**. Nothing is ever signed or sent
without an explicit approval at the terminal.

## How it works

```
natural language
      │
      ▼
  interpret            the model picks one tool: transfer or swap
      │
      ▼
  resolve              alias or 0x address → address, no external resolver
      │
      ▼
  build                deterministic calldata for the router
      │
      ▼
  policy + simulate    allowlists, approve rules, fee estimate
      │
      ▼
  summary              what you are about to sign, in plain English
      │
      ▼
  approve → sign       Speculos; nothing is auto-approved
      │
      ▼
  send → confirm       real receipt, with Flashblocks preconfirmations as UX only
```

**The model interprets intent and nothing else.** It never signs, never builds
calldata, and never invents an amount, an address, or a transaction parameter.
Everything downstream of the interpretation step is deterministic code with no model
in the loop, and anything the model returns is schema-validated before it reaches the
resolver.

## Packages

| Package | Role |
|---|---|
| `packages/agent` | Interpretation layer: tools, system prompt, model call |
| `packages/core` | Resolver, builder, policy engine, simulation, summary |
| `packages/signer` | Ledger/Speculos signing, transport-agnostic |
| `packages/flashblocks` | HashKey Flashblocks preconfirmation feed (UX layer) |
| `packages/contracts` | Solidity AMM (factory, pair, router) + Foundry tests |
| `packages/cli` | The terminal application that wires it all together |

## Getting started

```bash
pnpm install
pnpm run build
cp .env.testnet.example .env    # then fill it in
```

You will need a HashKey testnet RPC endpoint, the deployed router and factory
addresses, a credential for whichever provider the agent is configured to use, and
Speculos running for signing.

## Configuration

`.env.testnet.example` is the annotated list of everything the CLI reads. The
interpretation model is selected as `<provider>:<model>`, so switching agents is a
configuration change rather than a code change:

```bash
HUSKY_AGENT_MODEL=<provider>:<model>
```

## Project conventions

Contributor and agent instructions live in [`AGENTS.md`](AGENTS.md) — read it first.
The per-domain specs are in `docs/`.

## Status

Hackathon work in progress. Scope is deliberately narrow: transfer and swap on
HashKey Chain Testnet, and nothing else yet.
