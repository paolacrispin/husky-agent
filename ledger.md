# Ledger integration

Signing in Husky-Agent happens on a Ledger. This document covers how that fits
into the project, what we run locally, and one known issue with contract calls
that we have deliberately not fixed yet.

## The shape of it

Husky-Agent never holds a private key. The agent builds a transaction, the device
signs it, and only the signature comes back. The key is generated inside the
device's Secure Element and is not exportable — that property is the only reason
it is safe to let a language model drive this pipeline at all.

Two transports exist, and they construct the same signer:

| Transport | Talks to | Used for |
|---|---|---|
| `createSpeculosSigner()` — TCP | Speculos, a Ledger emulator | **Development** |
| `createNodeHidSigner()` — USB | A physical Ledger | Not used yet |

Pointing the project at real hardware is a transport change, not a logic change.
Derivation path, signing, policy and everything downstream are identical.

The device is passive: it waits for a command, performs one secure operation and
replies. The command format is an APDU. Two of them matter:

| APDU | Meaning | Needs a human? |
|---|---|---|
| `e0020000…` | `GET PUBLIC KEY` | No — returns immediately |
| `e0040000…` | `SIGN TRANSACTION` | **Yes** — blocks until buttons are pressed |

Replies end in a status word: `9000` is success, `6a80` is a refusal. A `6a80`
on a contract call is the failure mode described further down.

An **app** here means firmware running on the device, not software on the host.
The Ethereum app is what understands transactions and produces signatures. It is
not optional, and it is not in the Speculos image.

## What runs locally

Speculos emulates the device. It is an emulator rather than a mock: it executes
the real ARM firmware binary under QEMU, so the code path exercised is the one a
physical device runs.

| File | Role |
|---|---|
| `docker-compose.yml` | The emulator container |
| `scripts/speculos.mjs` | Start/stop/logs/status, and first-run setup |
| `apps/*.elf` | Ethereum firmware, downloaded on first start (gitignored) |
| `apps/main_nvram.bin` | The device's persisted app settings (gitignored) |

```bash
pnpm speculos:start     # boot it and wait until it can actually sign
pnpm speculos:status    # what is on the device screen right now
pnpm speculos:logs
pnpm speculos:stop
```

Two endpoints come out of it:

| Endpoint | What |
|---|---|
| `127.0.0.1:40000` | APDU — what `packages/signer` connects to |
| `http://127.0.0.1:5000` | REST API and the device screen; click it to press buttons |

`start` does more than `docker compose up`, because three things have to be true
before the device is usable:

1. The firmware exists in `apps/`. The image ships no apps at all — its
   `.dockerignore` excludes `apps/` — so the Ethereum app is fetched from the
   [app-ethereum release](https://github.com/LedgerHQ/app-ethereum/releases) on
   first run.
2. The seed comes from `TESTNET_MNEMONIC`. Speculos has a built-in default seed,
   which would silently give us a *different, empty* account.
3. Blind signing is enabled (see below), and the setting is persisted to NVRAM so
   later starts come up ready.

## The account

`TESTNET_MNEMONIC` in `.env.testnet`, at the Ethereum default path
`m/44'/60'/0'/0/0`, derives:

```
0xcD2E570Dc241E488c7BFf32FD377b4e3c93f775a
```

This is the account the project funds and the one the CLI signs with. It is
testnet-only by design and must never hold real value.

`PRIVATE_KEY` in the same file derives from the same mnemonic and is used only by
the Foundry deploy/seed scripts in `packages/contracts`.

## Known issue: every contract call needs blind signing

**Status: the custom router remains unresolved; we are proceeding with blind
signing enabled.** The signer now requests ERC-20 metadata where Ledger's
registry supports it, but that does not cover this router's swap method.

### Background

When the device signs, it is supposed to show you what you are approving.
Decoding a transaction into readable fields is **clear signing**. When the device
cannot decode it, the fallback is **blind signing**, where it shows the raw
transaction fields and a hash instead. Blind signing is off by default because
approving something you cannot read is exactly the attack it protects against.

To decode a contract call, the device has to be told what the contract is. That
metadata is not on any blockchain. `@ledgerhq/hw-app-eth` fetches it from
Ledger's CAL service (`https://crypto-assets-service.api.ledger.com`) and pushes
it into the device before signing. The descriptors follow the open ERC-7730
standard and live in a public registry.

### What we tested

Using the project's own installed `@ledgerhq/hw-app-eth`, four cases:

| # | Transaction | Resolution config | Result |
|---|---|---|---|
| A | AMM swap (`0x38ed1739`) | `{}` — the signer's **old** config | empty, and **no network call was attempted** |
| B | AMM swap (`0x38ed1739`) | `erc20`, `nft`, `externalPlugins`, `uniswapV3` all on | empty — `no infos for selector 0x38ed1739` |
| C | **Mainnet USDC** `transfer` | `{}` | empty |
| D | **Mainnet USDC** `transfer` | `{ erc20: true }` | `loaded erc20token info … (USDC)` |

C and D are the control. USDC is a token the CAL definitely knows about, and it
still resolves to nothing under `{}`. So the CAL service is reachable and working
from this machine — the empty result is not a network or configuration failure.

### What the device does

Signing a plain HSK transfer works normally. Signing anything with calldata to
our router fails:

```
SIGN FAILED: Please enable Blind signing or Contract data in the Ethereum app Settings
APDU response: 6a80
```

With blind signing enabled, the device shows:

```
Blind signing ahead — To accept risk, press both buttons
Review transaction
  From / To / Max fees / Network 133
  Tx hash (1/2), Tx hash (2/2)
  Accept risk and sign transaction
```

Note what is missing: the function being called and its arguments. The device
never decoded the swap.

### Why this is a problem

**1. The signer now requests token metadata.** `ledgerSigner.ts` calls
`resolveTransaction(rawTxHex, {}, { erc20: true })`, which allows
registry-known ERC-20 calls to be clear-signed (case D). The previous empty
configuration was a bug, but this does not add metadata for the custom router.

**2. Fixing it would not remove blind signing.** Case B shows that with
everything enabled a swap still resolves to nothing. Two independent reasons: the
token selectors only cover ERC-20 `approve`/`transfer`/`transferFrom`, so a swap
selector is never resolved through that path; and our router is registered in no
registry anywhere. Blind signing here is structural, not a misconfiguration.

**3. It weakens the security story we are telling.** The project's premise is
that a human approves every operation. Under blind signing the human approves a
transaction hash they cannot read, so the device is *not* actually protecting
them. What makes the approval meaningful is our own deterministic plain-English
summary, and what makes it checkable is the hash the device displays
independently. That is a defensible position, but it should be stated honestly
rather than implying the hardware is explaining the transaction. Judges who know
Ledger will ask.

**4. It is friction for everyone running the project.** Blind signing is off on a
factory-fresh device, so without the handling in `scripts/speculos.mjs` every
developer would have to navigate the device menus by hand — and would have to do
it again after every container restart.

### What would fix it properly

- **Register an ERC-7730 descriptor** for the AMM router in the
  [Clear Signing Registry](https://github.com/ethereum/clear-signing-erc7730-registry).
  This is the real fix, and it is a PR plus a review cycle — not hackathon work.
- **Write an app-ethereum plugin** for the router. Heavier, and it only helps
  devices that install it.
- **Live with blind signing**, which is what we are doing, and be explicit about
  it in the demo.

## Operational notes

| Symptom | Cause |
|---|---|
| Container exits immediately at startup | `--load-nvram` was passed with no `main_nvram.bin`. Speculos aborts rather than warning. `scripts/speculos.mjs` handles this. |
| Blind signing reverts after a restart | NVRAM was not persisted — the container's working directory must be the mounted `apps/` folder. |
| `Connection refused` on the APDU port | Speculos is not running, or the port does not match `SPECULOS_TRANSPORT_URL`. |
| Web screen unreachable on 5000 | The port must be published *and* Speculos told `--api-port 5000`. |
| Ticker renders as `???` | HSK is not in Ledger's CAL. Cosmetic; the amount still renders. |
| The final confirm needs **both** buttons | Pressing `right` on "Sign transaction" moves the selection to *Reject transaction* instead. |

## References

- [Speculos quickstart](https://speculos.ledger.com/user/quickstart.html) · [Docker](https://speculos.ledger.com/user/docker.html) · [Troubleshooting](https://speculos.ledger.com/user/troubleshooting.html)
- [What is a device app?](https://developers.ledger.com/docs/device-app/explanation/device-app-role)
- [Application structure and I/O (APDU)](https://developers.ledger.com/docs/device-app/explanation/io)
- [Clear Signing / ERC-7730](https://developers.ledger.com/docs/clear-signing/for-dapps/get-started)
- [app-ethereum releases](https://github.com/LedgerHQ/app-ethereum/releases)
