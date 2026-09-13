# Husky-Agent — Project instructions for coding agents

Husky-Agent is a terminal-based AI agent that interprets natural-language instructions
("send X to Y", "swap A for B") into everyday DeFi operations on HashKey Chain
Testnet. This file is the entry point — always read it first. The details for each
domain live in `docs/`; load them based on the task at hand:

| Task you're working on | Read |
|---|---|
| Understanding the problem, the pitch, the judging criteria | `docs/00-vision.md` |
| Touching any part of the pipeline (interpret→send) | `docs/01-architecture.md` |
| Writing/editing Solidity contracts (AMM) | `docs/02-contracts-spec.md` |
| Touching the tools the LLM can invoke | `docs/03-agent-tools-spec.md` |
| Touching the policy engine or the deterministic summary | `docs/04-security-policy-spec.md` |
| Touching signing, transport, Ledger/Speculos | `docs/05-signing-spec.md` |
| Touching repo structure, scripts, env vars | `docs/06-repo-and-tooling.md` |
| Preparing or validating the demo | `docs/07-demo-script.md` |
| HashKey Chain–specific data (RPC, chain ID, official docs) | `hskchain/SKILL.md` and `hskchain/references/` (already exist, don't touch without confirming) |

## Non-negotiable principle

**The LLM never signs or builds calldata.** The model only interprets intent and
chooses which tool to invoke with which parameters extracted from natural language.
Everything else — address resolution, transaction construction, policy checking,
signing — is deterministic code, with no LLM in the loop. If a task requires the LLM
to "decide" an amount, an address, or a transaction parameter without it passing
through the deterministic resolver, stop and ask before implementing it that way.

## v1 scope (hackathon) — non-negotiable except by explicit instruction

- Supported operations: **token transfer** and **swap** (via the project's own AMM).
  Nothing else (no lending, no staking, no NFTs, no multi-step composability).
- A single chain: **HashKey Chain Testnet (chain ID 133)**. No multi-chain.
- Signing: **Ledger via Speculos only** (emulator). No Secure Enclave, no other
  signers.
- No World AgentKit and no "proof of humanity" layer of any kind. Out of scope.
- Human approval: **always required**, no exceptions and no auto-approval thresholds.
  Do not implement auto-approval logic even if it seems like a reasonable
  improvement — it's an explicit product decision, not an oversight.
- Address resolution: local contacts (`contacts.json`) first, falling back to a
  directly supplied `0x...` address. Do not implement ENS or any external resolver.
- UX feedback via HSK testnet Flashblocks (~200ms preconfirmations over websocket)
  is in scope, as a UX layer isolated from the security pipeline (see
  `docs/01-architecture.md`). Hard rule: the "preconfirmed" state must never be presented
  as equivalent to "confirmed/final" — they must be visually and textually distinct
  throughout the UI.

## Explicit non-goals (to avoid scope creep)

- World AgentKit / proof of humanity — cut from the project.
- Account Abstraction (ERC-4337) — dropped due to the lack of a reliable bundler on
  HSK testnet (see `docs/00-vision.md` for the research details).
- Any chain other than HashKey Chain Testnet.
- Auto-approval of transactions under any threshold.
- Physical hardware wallet — the project uses Speculos exclusively; the signing code
  must be written so that pointing at a physical Ledger is a transport configuration
  change, not a logic change (see `docs/05-signing-spec.md`).

## Conventions

- Strict TypeScript (`strict: true`) across all agent/wallet code.
- Contracts in Solidity with Foundry (see `docs/02-contracts-spec.md`).
- Any function that receives an amount or an address coming from the LLM must be
  validated with a schema (zod or similar) before it touches the resolver.
- Never commit real private keys or mnemonics. Only the testnet mnemonic documented
  in `docs/05-signing-spec.md`.
- Before considering a task that touches the policy engine or signing as done,
  explicitly state what was tested and what wasn't — that code is the highest-risk
  code in the project.
