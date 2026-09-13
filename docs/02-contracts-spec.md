# 02 — Contracts spec (AMM)

## Goal

A minimal, Uniswap V2–style AMM (constant product, `x*y=k`), deployed directly on
HashKey Chain Testnet, to support Husky-Agent's swap operation. The goal isn't AMM
design innovation — it's correctness, simplicity, and being 100% functional on HSK
testnet in time for the demo.

## Toolchain

Foundry. Validated as a working pattern on HSK testnet by other previous HashKey
hackathon projects (compilation, deploy with `forge script --broadcast --legacy`,
verification on the explorer).

## Contracts

1. **`HuskyAgentFactory.sol`** — creates and tracks pairs via CREATE2. One pair per
   token combination. No fee switch for v1 (keep it simple; the `feeTo` field may
   exist but isn't activated).
2. **`HuskyAgentPair.sol`** — constant-product pool for two ERC-20s. The contract
   itself is the LP token (ERC-20). Swap fee: **0.30%**, accrued to LPs. Includes
   basic reentrancy protection and `reserve0/reserve1` with `sync()`.
3. **`HuskyAgentRouter.sol`** — stateless entry point: `swapExactTokensForTokens`,
   `addLiquidity`, `removeLiquidity`, read-only `quote`/`getAmountOut` functions.
   Multi-hop isn't needed for v1 (direct pairs are sufficient given the scope).
4. **Wrapped native**: **don't create a new one.** HashKey Chain Testnet already has
   an official WHSK deployed at `0x4200000000000000000000000000000000000006` (the
   standard OP Stack `WETH9` L2 predeploy, confirmed via explorer source-code
   verification — see `WHSK_ADDRESS` in `06-repo-and-tooling.md`). Note this is a
   different address from the WHSK listed for HSK **mainnet**
   (`0xB210D2120d57b758EE163cFfb43e73728c471Cf1`) — don't reuse one for the other.
5. **`MockERC20.sol`** — test tokens for the demo (mintable, configurable decimals).
   **Decided: two tokens.**
   - `USDC` ("Mock USD Coin", 6 decimals) — the everyday demo token, used in the
     transfer scenarios (`07-demo-script.md` Scenarios 1–2).
   - `HUSKY` ("Husky Token", 18 decimals) — the project's own demo token, paired
     directly with USDC for the swap scenario (Scenario 3).

   Two pools are seeded (see `Seed.s.sol` below):
   - **WHSK/USDC** (0.02 WHSK : 0.2 USDC, implying 1 HSK = 10 USDC) — not used
     by any demo script scenario directly; exists to put a real WHSK-backed
     pool on the explorer, since Flashblocks aside, this is the most concrete
     proof of "integrates HSK technology" a judge can click into.
   - **USDC/HUSKY** (50,000 USDC : 500,000 HUSKY, implying 1 USDC = 10 HUSKY) —
     the pair the demo script's swap scenario uses.

## Deployment and seed scripts

- `Deploy.s.sol` — deploys Factory, Router, and both MockERC20s, and mints the
  deployer 60,000 USDC / 550,000 HUSKY (pool liquidity + a demo-transaction
  buffer left over for live transfer/swap testing).
- `Seed.s.sol` — wraps 0.02 native testnet HSK into WHSK (`IWHSK.deposit()`) and
  calls `addLiquidity` for both pools above via the Router (which creates each
  pair automatically on first liquidity add). **Requires the deployer account to
  hold at least 0.05 testnet HSK plus gas before running** — get this from the
  HSK testnet faucet first (see `hskchain/references/developer-workflows.md`).

  Sizing rationale: the demo script's swap scenario trades 10 USDC against the
  50,000 USDC / 500,000 HUSKY pool — a 0.02% pool share, so slippage stays
  negligible regardless of the default tolerance below. The WHSK/USDC pool is
  kept tiny (0.02 WHSK) because the shared testnet account only ever carries
  faucet-sized HSK balances — no demo scenario actually swaps against this
  pair, so its absolute size doesn't matter, only that it exists.

**Actually deployed** (HSK testnet, from the shared account
`0xcD2E570Dc241E488c7BFf32FD377b4e3c93f775a` — see `05-signing-spec.md`).
Verified on-chain (bytecode present, reserves matching the amounts above),
not just trusted from script output — a teammate does not need to redeploy,
`.env.testnet.example` already has these:

| Contract | Address | Explorer |
|---|---|---|
| `HuskyAgentFactory` | `0x1A962CA6a2D056008982AB04DA5494D04d5297D4` | [view](https://testnet-explorer.hsk.xyz/address/0x1A962CA6a2D056008982AB04DA5494D04d5297D4) |
| `HuskyAgentRouter` | `0x66eCbf42534a2309C9880F3C76cbaA51cC9a2D49` | [view](https://testnet-explorer.hsk.xyz/address/0x66eCbf42534a2309C9880F3C76cbaA51cC9a2D49) |
| `USDC` (MockERC20) | `0xBCf27FB0A18111e0D21b1Fb4677F9Bc6285fA75d` | [view](https://testnet-explorer.hsk.xyz/address/0xBCf27FB0A18111e0D21b1Fb4677F9Bc6285fA75d) |
| `HUSKY` (MockERC20) | `0xc686b87dC49Ecd59Fd6d39a878F0964D152cB212` | [view](https://testnet-explorer.hsk.xyz/address/0xc686b87dC49Ecd59Fd6d39a878F0964D152cB212) |

Both pools are seeded (WHSK/USDC and USDC/HUSKY, per the amounts above), and
the shared deployer account still holds the demo buffer: 9,999.8 USDC,
550,000 HUSKY, and ~0.073 testnet HSK at time of writing.

## Slippage and protection

`swapExactTokensForTokens` must receive an `amountOutMin` computed by the resolver
(not by the LLM) using a fixed, configurable slippage tolerance. **Decided: 0.5%**
(`DEFAULT_SLIPPAGE_BPS = 50` in `packages/core/src/builder/build.ts`) — the
conservative end of the originally proposed 0.5%–1% range, since the seeded pool
sizes above make the demo swap's actual price impact far smaller than the
tolerance anyway; there was no reason to loosen it further.

## Open items

None — all three items below are closed as of this revision:

- ~~Number and names of the MockERC20s for the demo~~ → USDC + HUSKY, above.
- ~~Initial liquidity amounts per pair~~ → above.
- ~~Exact default slippage tolerance value~~ → 0.5%, above.
