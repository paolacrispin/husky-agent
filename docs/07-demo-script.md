# 07 — Demo script and acceptance criteria

## Why this document matters

Without concrete scenarios, "it works" is subjective. These scenarios are the
project's real acceptance criteria — if all of them pass end-to-end against HSK
testnet, the project is demo-ready.

## Setup before any recording/live demo

1. Speculos running (`pnpm speculos:start`), health check green.
2. AMM deployed and seeded with liquidity on HSK testnet (addresses confirmed on
   the explorer).
3. `contacts.json` with at least 2 test aliases.
4. Demo EOA account funded with testnet HSK (faucet) and a balance of the test
   MockERC20s.

## Scenarios

Tokens per `02-contracts-spec.md`: `USDC` (mock, 6 decimals) and `HUSKY` (mock,
18 decimals), paired directly with 50,000 USDC : 500,000 HUSKY liquidity.

### Scenario 1 — Happy-path transfer (known contact)
- Input: `"send 5 USDC to juan"`
- Expected: summary shows "Juan (0x...)", correct amount and fee → approve → tx
  confirmed on the HSK testnet explorer.

### Scenario 2 — Transfer to a direct 0x address
- Input: `"send 2 USDC to 0x..."`
- Expected: summary shows the address as-is (no alias) → approve → confirmed.

### Scenario 3 — Happy-path swap
- Input: `"swap 10 USDC for HUSKY"`
- Expected: summary shows `amountOutMin` and an estimate consistent with the pool's
  real state → approve → confirmed, balances updated. (10 USDC against a 50,000
  USDC pool is a 0.02% trade — slippage should be negligible and the swap should
  never hit the 0.5% tolerance.)

### Scenario 4 — Policy rejection (token outside allowlist)
- Input: `"send 1 SCAM to juan"` (any symbol not present in `tokens.json` works —
  no contract needs to actually be deployed for this scenario, since `SCAM`
  fails to resolve before any policy check runs)
- Expected: rejection **before** reaching human approval, with a clear message.
  This scenario is key to showing the judges that the policy engine actually does
  something real, not a decorative checkbox.

### Scenario 5 — User rejection at approval
- Input: any valid operation, but the user answers "no" at the prompt.
- Expected: nothing gets signed or sent; clear cancellation message.

### Scenario 6 — Flashblocks feedback (a demo highlight)
- During Scenario 1 or 3, point out live the moment "⏳ Preconfirmed (HSK
  Flashblocks)" appears almost immediately after approval, followed seconds later
  by "✅ Confirmed in block N." Worth narrating explicitly to the judges ("this is
  a preconfirmation via HSK Flashblocks, not finality — finality lands here") so
  it's clear this is a real integration of chain technology, not a cosmetic detail.

### Scenario 7 — Ambiguous instruction
- Input: `"send something to juan"`
- Expected: the agent asks for clarification (amount and token) instead of
  inventing values or failing in a confusing way.

## Contingency plan

Record a backup video of scenarios 1–4 running successfully against HSK testnet,
in case there are RPC/faucet/network issues live on presentation day.

## Open items

- Whether to add an explicit "insufficient balance" scenario before the final demo.
