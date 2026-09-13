# 04 — Policy engine and deterministic summary

## Policy engine

Product decision: **every transaction requires human approval, with no
auto-approval threshold.** The v1 policy engine doesn't decide "auto-approve" —
its job is to **reject, before reaching human approval,** cases that should never
be presented to the user at all. This is different from a spending-limit engine;
it's a pre-validation layer.

### Two checkpoints (not a single stage)

The policy engine is split into two explicit functions, called from different
points in the pipeline (see `01-architecture.md`):

- **`preBuildCheck()`** — runs before transaction assembly, on the resolved intent
  (token, amount, recipient/tokenOut). Validates the token allowlist, the contract
  allowlist, parameter bounds (e.g. non-zero amount), and a static balance check
  (current on-chain balance vs the requested amount, before any tx object exists).
  This is what lets rule 1/2/4 below reject cheaply, without ever building or
  simulating a tx.
- **`postSimulateCheck()`** — runs after `eth_call`/trace simulation, on the built
  tx and its simulation result. Validates that the simulation didn't revert and
  that the resulting state change matches what was requested (e.g. the swap's
  simulated output isn't below `amountOutMin`).

### v1 rules

1. **Token allowlist** (`preBuildCheck`): only tokens defined in `tokens.json`
   (official WHSK + the deployed MockERC20s) are operable. Any token address
   outside that list is rejected.
2. **Contract allowlist** (`preBuildCheck` for the target; re-checked in
   `postSimulateCheck` against the actual built calldata): the tx may only
   interact with `HuskyAgentRouter`, `HuskyAgentFactory`/known pairs, or direct
   transfers of an allowlisted token. An `approve()` call is only allowed when
   `target` is in `tokens.json` **and** `spender === HuskyAgentRouter` — no other
   approve target/spender combination is ever built, let alone approved by policy.
3. **Failed simulation** (`postSimulateCheck`): if the simulation reverts or
   produces an unexpected result, it's rejected before the summary — there's no
   point asking the user to approve something that's going to fail on-chain.
4. **Insufficient balance** (`preBuildCheck`): early rejection with a clear
   message, using a static balance read, before build/simulate ever run.

Note: there's no "maximum amount" logic in v1 because no limit was decided — if one
is added later, it's an additive change to this list, not a redesign.

## Swap with insufficient allowance: one prompt, two transactions

When a swap needs an `approve()` first (current allowance < `amountIn`), the user
sees **one combined approval prompt**, but the pipeline executes it as **two
transactions in sequence**:

1. Build **and** simulate both the `approve` tx and the `swap` tx before showing
   anything to the user. If either simulation fails, abort before any prompt is
   shown — the user is never asked to approve a plan where the second leg is
   already known to fail.
2. Show one combined summary (see the "Approve + swap" template below) and get a
   single yes/no.
3. On "yes": sign and send the `approve` tx, wait for its receipt, then sign and
   send the `swap` tx. If the `approve` tx fails on-chain despite a successful
   simulation (e.g. a reorg or a race), abort before sending the `swap` tx and
   report the failure — do not silently retry or partially proceed.

The `approve()` amount is set to the exact `amountIn` of the swap, not
`type(uint256).max` — this avoids leaving a standing unlimited allowance on the
Router between operations, consistent with the project's compliance-oriented
positioning (see `00-vision.md`). Each future swap re-approves its own exact
amount.

## Deterministic summary

Generated **from the already-built and decoded transaction object**, never from the
user's original intent or from the LLM. This is what prevents a "pretty" but
incorrect summary from misleading the user about what they're about to sign.

### Templates per operation type

**Transfer:**
```
You are about to transfer {amount} {tokenSymbol} to {recipientLabel} ({recipientAddress}).
Estimated network fee: ~{estimatedFee} HSK.
```
`recipientLabel` is the alias if it came from contacts, or "address" if it was a
direct 0x.

**Swap (sufficient allowance already):**
```
You are about to swap {amountIn} {tokenInSymbol} for a minimum of {amountOutMin}
{tokenOutSymbol} (estimated: ~{amountOutEstimate} {tokenOutSymbol}, max slippage
{slippagePercent}%). Estimated network fee: ~{estimatedFee} HSK.
```

**Approve + swap (insufficient allowance, combined prompt):**
```
This requires two on-chain transactions:
  1. Approve {amountIn} {tokenInSymbol} for the Husky-Agent Router.
  2. Swap {amountIn} {tokenInSymbol} for a minimum of {amountOutMin} {tokenOutSymbol}
     (estimated: ~{amountOutEstimate} {tokenOutSymbol}, max slippage {slippagePercent}%).
Estimated total network fee: ~{estimatedFee} HSK.
```
Both transactions are built and simulated before this summary is shown — approving
here signs and sends both, in order.

All values in these templates come from: (a) the simulation, (b) decoding the
built calldata, (c) the slippage config — never from an LLM text response.

`estimatedFee` note: per `hskchain/references/developer-workflows.md`, HSK's fee is
`L2 execution fee + L1 security fee`, and the L1 component (data publication to
Ethereum) can move independently of the L2 gas estimate. A plain `eth_estimateGas`
× gas price is not the full picture — factor in HSK's fee model before treating
this estimate as authoritative in the summary.

## Human approval flow

Terminal, blocking `[y/N]`-style prompt showing the full summary beforehand. Any
response that isn't explicitly affirmative is treated as a rejection (fail-closed).

## Open items

- Exact rejection message for each policy engine rule (so they're informative
  rather than a generic "operation rejected").
- Whether to log rejected transactions locally for the demo (useful to show the
  judges that the policy check actually does something, not just decoration).
