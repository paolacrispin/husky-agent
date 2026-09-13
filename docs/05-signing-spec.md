# 05 — Signing spec (Ledger via Speculos)

## Goal

Sign EOA transactions for HSK testnet using Ledger's Ethereum app running on the
Speculos emulator, in a way that keeps application code agnostic to whether the
transport is Speculos or a real physical device (a configuration change, not a
business-logic change).

## Abstraction

`packages/signer/` exposes a single interface, e.g.:

```ts
interface Signer {
  getAddress(): Promise<Address>;
  signTransaction(tx: UnsignedTx): Promise<SignedTx>;
}
```

The concrete implementation (`LedgerSpeculosSigner`) uses the Speculos transport
(`@ledgerhq/hw-transport-node-speculos` or equivalent) + `@ledgerhq/hw-app-eth`. The
rest of the code (`packages/core`, `packages/cli`) only knows the `Signer`
interface, never the concrete transport.

## Speculos — automated in the repo

Decision: Speculos is started and stopped via repo scripts, not manually.

- `scripts/speculos-start.sh` (or an equivalent package.json script): starts the
  Speculos container/binary with the Ethereum app loaded, using the testnet
  mnemonic documented below.
- `scripts/speculos-stop.sh`: shuts it down cleanly.
- The Husky-Agent CLI must health-check the Speculos transport on startup and fail
  with a clear message ("Speculos isn't running, run `npm run speculos:start`")
  instead of a cryptic connection error.

## Testnet mnemonic

**Decided.** A fresh, dedicated testnet-only mnemonic is committed in
`.env.testnet.example` as `TESTNET_MNEMONIC`. This is the one case where
committing a "secret" is correct: the whole point of this mnemonic is that
it's public, shared across the team/repo, and safe to publish — same
convention as Anvil's or Hardhat's default test accounts. Rules:

- Must never hold real funds or be used outside testnets. If it's ever funded
  with anything beyond faucet dust, treat those funds as burned.
- Derivation path: standard Ethereum default, `m/44'/60'/0'/0/0`.
- Address: `0xcD2E570Dc241E488c7BFf32FD377b4e3c93f775a`. This is loaded into
  Speculos as its seed (`scripts/speculos-start.sh`) and is the address the
  CLI signs with. `PRIVATE_KEY` in `.env.testnet.example` is the same
  account's raw key, derived from this same mnemonic — used only by the
  Foundry deploy/seed scripts (`packages/contracts`), never by the CLI/signer
  path, which always goes through Speculos.
- This account needs testnet HSK from the faucet (see
  `hskchain/references/developer-workflows.md`) before deploying, seeding, or
  running any demo scenario — at least 10 HSK to cover `Seed.s.sol`'s WHSK
  wrap (see `02-contracts-spec.md`) plus gas.

A real hardware Ledger obviously has no equivalent "documented mnemonic" —
this section only applies to the Speculos emulator path.

## Path to physical hardware (out of scope for v1, but must remain viable)

If a physical Ledger is connected in the future, the only expected change is the
transport (`@ledgerhq/hw-transport-node-hid` instead of the Speculos transport); the
`Signer` interface and everything else shouldn't need changes. If implementing this
turns out not to be the case, that's a sign the abstraction was poorly designed —
review it before the demo so you can answer confidently if a judge asks.

## Open items

- Confirm the exact Ledger Ethereum app version that supports Speculos + HSK
  testnet (chain ID 133) without "unknown chain" issues during tx confirmation
  — blocked on actually running Speculos, see `scripts/speculos-start.sh`.
