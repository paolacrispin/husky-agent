# 00 — Vision and scope

## Problem

Interacting with DeFi today requires knowing contract addresses, token decimals,
slippage, gas, and building transactions by hand or through interfaces that don't
explain what will actually happen upon signing. This produces two simultaneous
failures: usage friction for the everyday user, and a trust problem when that
friction is "solved" with AI agents that have direct signing authority (risk of
hallucination, prompt injection, manipulation of intent).

## What Husky-Agent is

A terminal agent that translates natural-language instructions into safe DeFi
operations, maintaining a strict separation between interpretation (non-deterministic,
via LLM) and execution (deterministic, no LLM). See `01-architecture.md` for the
full pipeline.

## Track: HSK Chain (HashKey Group)

HashKey Chain positions itself as a "compliance-by-design" EVM L2, aimed at
institutional finance and RWA, with native permission/allowlist hooks. This isn't a
marketing detail — it's directly relevant to Husky-Agent's pitch: a pipeline with an
explicit policy engine and mandatory human approval before signing is exactly the
kind of control an institutional/compliance audience expects from an autonomous
agent. This fit must be explicit in the demo and the pitch, not implicit.

### Track requirements
- Built on HSK, deployed on HSK (testnet acceptable).
- Integrate HSK technology.
- Repo on GitHub, working demo.

### Judging criteria and how we cover them
| Criterion | How we cover it |
|---|---|
| Feasibility / real implementation | The entire pipeline runs end-to-end on HSK testnet: EOA transfers + our own AMM deployed on HSK (see `02-contracts-spec.md`). Nothing in the demo depends on another chain. |
| Solving a real user problem | DeFi UX friction (natural language → operation) + the trust problem in agents handling real money (LLM/execution separation). |
| Technical/product innovation | The `interpret→resolve→build→simulate→policy→summary→approval→sign→send` pipeline, with a deterministic summary generated from decoded calldata (not from the LLM), is the defensible technical differentiator. |
| Integrating HSK technology | Flashblocks (websocket preconfirmations, specific to HSK testnet) used for near-instant UX feedback — not a generic "any EVM" integration. |

## Architecture decisions already made (with justification)

1. **EOA instead of Account Abstraction on HSK testnet.** The ERC-4337 EntryPoint on
   HSK testnet was investigated; it exists on-chain, but reviewing transactions on
   the explorer showed that most bundler usage attempts failed — there's no reliable
   public bundler within the hackathon timeline. Note: proprietary infrastructure
   offerings exist (e.g. thirdweb) that advertise 4337/7702 support on HSK testnet
   via their own bundler; their reliability wasn't validated given the time
   available. Decision: standard EOA.
2. **Own AMM on HSK instead of using Avalanche.** Uniswap has no official deployment
   on HSK. Instead of resolving swaps on another chain (breaking the "deployed on
   HSK" requirement), a minimal Uniswap V2–style AMM (Factory/Pair/Router) is built
   and deployed directly on HSK testnet, with test tokens (MockERC20) and seeded
   liquidity. HashKey Chain Testnet already has an official WHSK (wrapped native)
   deployed — that one is used instead of creating a new one.
3. **Ledger via Speculos only, no Secure Enclave.** Scope cut for the hackathon; the
   transport code must be isolated so that pointing at a physical Ledger is a
   configuration change, not a logic change.
4. **World AgentKit dropped.** Tangential to the core problem and the track; cut to
   stay focused.
5. **HSK Flashblocks for UX feedback (testnet only).** HSK exposes preconfirmed
   blocks every ~200ms via websocket. This is used to show the user a near-instant
   "operation preconfirmed" state while waiting for real finality in the sealed
   block — making it explicit in the UX at all times that this is a preconfirmation,
   not finality. See `01-architecture.md` for where it fits in the pipeline and
   `06-repo-and-tooling.md` for the endpoint. This is also the piece that most
   directly covers the "integrate HSK technology" requirement with something chain-
   specific (not generic to any EVM), and it's worth highlighting in the pitch for
   that reason.

## Non-goals (see also AGENTS.md)

Multi-chain, Account Abstraction, auto-approval, physical hardware, proof of
humanity, any operation outside transfer + swap.
