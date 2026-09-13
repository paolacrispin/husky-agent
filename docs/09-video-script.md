# 09 — Video script (Husky Agent demo)

**Target length:** ~3:15 core — about 550 spoken words at a natural pace, plus the
pauses where you're actually signing and waiting. Cut plan if you need to be
shorter: drop Beat 6 *(cuttable)* → ~2:55; drop Beats 4 and 6 → ~2:35. Everything
in §C is additive and optional.
**Format:** one presenter, one terminal window, one browser tab on the device
screen (and optionally a second tab on the explorer).
**Tone:** same conversational, first-person walkthrough as the Maki video —
"let me introduce you to…", "so we can just…", "yep". The narration below is
written to be read aloud, close to verbatim.

How to read this document:

- **DO** — the literal action on screen, in order. Commands are exact.
- **SAY** — the spoken transcript for that beat.
- **WATCH FOR** — what must appear before you move on, plus the fix if it doesn't.

---

## A. Pre-flight (15 minutes before recording)

Do all of this before the camera is on. Nothing here is optional.

| # | Step | Command / action | Expected |
|---|---|---|---|
| 1 | Install + build | `pnpm install && pnpm build` | finishes clean; required because the agent imports `core`/`signer`/`flashblocks` from their `dist/` |
| 2 | Boot the signer | `pnpm speculos:start` | "Speculos is up", `blind signing enabled`, device screen at http://127.0.0.1:5000 |
| 3 | Contacts exist | `cp contacts.json.example contacts.json` (if missing) | `juan` resolves; edit it to a real teammate address if you prefer |
| 4 | Model credential | confirm `DEEPSEEK_API_KEY` in `.env` is set | the agent answers at all |
| 5 | **Warm-up** | launch `pnpm dev` and ask *"what's my wallet balance?"* once | balances print. This pre-warms the Ledger: the first read after a fresh boot can fail with `Device is busy (lock getAddress)` |
| 6 | Check the numbers | same warm-up answer | HSK ≈ 0.07 (gas) · USDC 9,999.8 · HUSKY 50,000 · address `0xcD2E570Dc241E488c7BFf32FD377b4e3c93f775a` |
| 7 | Gas | if HSK is below ~0.01, top up from the HSK faucet | a demo run costs a few hundred-thousand gas; 0.07 HSK is ~200 runs |
| 8 | Rehearse the buttons | click through one signing on the device screen | blind-signing page = **both** buttons; review pages = **right**; final accept = **both** |
| 9 | Tabs ready | tab 1 terminal, tab 2 `http://127.0.0.1:5000`, tab 3 `https://testnet-explorer.hsk.xyz` | no tab hunting on camera |
| 10 | Recording hygiene | terminal font ≥16pt, notifications off, dark theme | **never open or `cat` `.env` on camera — it holds a live API key.** If you demo "it can't read files", say it, don't show it. |

> The device is the *only* thing that signs. Do not "just quickly test" a write
> with the signer bypassed — there is no such path in this project, by design.

**Numbers to expect after each beat** (so you know instantly if something is off):
transfer 5 USDC → USDC 9,994.8; swap 10 USDC → HUSKY (≈ 1 USDC = 10 HUSKY, so
~99.7 HUSKY after the 0.30% pool fee).

---

## B. The script

### Beat 1 — Intro and launch · 0:00–0:20

**DO**

1. Start on the terminal, at the repo root, cursor blinking. Nothing typed yet.
2. Type `pnpm dev` and hit Enter.

**SAY**

> Hi guys, let me introduce you to Husky Agent — a terminal AI agent for on-chain
> life on HashKey Chain. You ask for a transfer or a swap in plain English and it
> handles the rest: resolving the recipient, quoting, building, simulating,
> sending. The core idea is that the model never touches your keys *or* your
> calldata — it only turns your sentence into a tool call. Everything after that
> is deterministic code. And signing happens on a Ledger.

**WATCH FOR** the cat mark, `Husky Agent v0.1.0`, the tagline *"cool tools, clear
intent"*, and the status line `HSK testnet · approval required`.

---

### Beat 2 — What it actually is · 0:20–0:35

**DO**

1. Type `/about` and hit Enter.

**SAY**

> It's really easy to start — clone the repo, install, run `pnpm dev`. And you can
> see exactly what it's allowed to do: two writes, transfer and swap, plus read
> tools for balances. Deliberately narrow — there's no shell and no file access in
> this session, so the model physically cannot run commands on my laptop.

**WATCH FOR** the `/about` block listing HashKey Chain Testnet (chain ID 133),
transfer + swap only, and the approval rule.

---

### Beat 3 — The signer · 0:35–0:50

**DO**

1. Switch to tab 2: the device screen at `http://127.0.0.1:5000`.
2. Optional: in a second pane, run `pnpm speculos:status` — it prints what the
   device is showing right now.

**SAY**

> This is the signer: a Ledger, here running in Speculos — Ledger's own emulator.
> It executes real device firmware, so it's the same code path a physical Ledger
> runs; pointing at real hardware is a transport change, not a logic change. And
> nothing in this project signs without going through the device.

**WATCH FOR** the device home screen ("Ethereum app is ready").

---

### Beat 4 — Balances · 0:50–1:05

**DO**

1. Back to the terminal. Type: `what's my wallet balance?`

**SAY**

> So let's just ask something in plain language — what's my wallet balance? Yep:
> HSK for gas, and our two demo tokens, USDC and HUSKY. That address is the Ledger
> account — its key was generated inside the device and can't be exported. That's
> the only reason it's safe to let a model drive this pipeline.

**WATCH FOR** the three balances. If you get `Device is busy (lock getAddress)`,
ask again — the device was still holding the previous request.

---

### Beat 5 — Transfer, the core beat · 1:05–1:55

**DO**

1. Type: `send 5 USDC to juan`
2. When the approval dialog appears with the summary, read it out and confirm
   (answer `y`).
3. Switch to tab 2 the moment the progress line says *submitted* — the device is
   now waiting on you.
4. On the device: **both** buttons on the blind-signing page → **right** through
   the review pages → **both** on the final accept page.
5. Let the terminal run: preconfirmed → confirmed. Then copy the tx hash into
   tab 3 (the explorer) and show the real transaction.

**SAY**

> Now a transfer — send five USDC to juan. Watch what happens before anything is
> signed. Juan is resolved from my local contacts file; the model doesn't resolve
> addresses, and it doesn't build the transaction either. It's built, simulated,
> and policy-checked. Then this summary — amount, address, fee — comes from the
> decoded transaction, not the model, so what I approve is exactly what gets
> signed. I confirm, and it goes to the Ledger: blind
> signing, both buttons… signed and submitted. There's the Flashblocks
> preconfirmation, basically instant. And a second later, the real receipt:
> confirmed in block. We never show the preconfirmation as finality.

**WATCH FOR** in this exact order: `transfer submitted: 0x…` → `⏳ Preconfirmed (HSK
Flashblocks) — NOT final…` → `✅ Confirmed in block N`. If the preconfirmation
line never appears, keep going: it degrades silently to the normal receipt by
design, and you can mention that.

---

### Beat 6 — The policy engine says no · 1:55–2:10 *(cuttable)*

**DO**

1. Type: `send 1 SCAM to juan`

**SAY**

> Now let me try something dumb — send one SCAM to juan. Rejected before it ever
> reached me: SCAM isn't in the token allowlist. The policy engine isn't a
> checkbox, it's a gate in front of the approval prompt — allowlists, a balance
> check, a simulation that has to pass, all before I'm asked to sign.

**WATCH FOR** `❌ 'SCAM' is not a supported token.` — no approval dialog, nothing
signed.

> **Risk:** the model may answer this one in prose instead of calling the tool
> (it knows the tools only take allowlisted tokens). If that happens, re-ask with
> the amount changed: `send 1000000 USDC to juan` — USDC *is* allowlisted, so the
> tool runs and the policy engine rejects it deterministically with
> "Insufficient balance… (base units)". Narrate it as: "the policy read my balance
> and refused before it built anything."

---

### Beat 7 — Swap through our own AMM · 2:10–2:55

**DO**

1. Type: `swap 10 USDC for HUSKY`
2. Read the summary. On a fresh allowance this is the **two-transaction** version:
   exact-amount approve + swap, one approval for both. (If an allowance already
   exists you'll get the single-transaction summary — narrate that instead, the
   pipeline is the same.)
3. Confirm, then sign **twice** on the device (approve, then swap), switching to
   tab 2 for each.
4. Show the second receipt, and optionally re-ask for balances to show HUSKY went up.

**SAY**

> Let's swap ten USDC for HUSKY. No Uniswap on HashKey Chain, so we deployed our
> own minimal AMM there — that's what it's quoting against. The
> router has no allowance yet, so it prepared two transactions: an approve for the
> *exact* amount, not an infinite one, and the swap — both simulated, one approval
> for the pair. Approve, sign… sign… preconfirmed… confirmed. Both landed. And the
> output can never come in below the minimum it showed me — that's enforced in the
> calldata, not by the model.

**WATCH FOR** two hashes, each with its own preconfirmed → confirmed pair. This is
the "integrates HSK technology" beat, so don't rush the preconfirmation line.

---

### Beat 8 — Close · 2:55–3:10

**DO**

1. Back to the terminal. Optionally `/about` again, or just let the confirmation
   lines sit on screen.

**SAY**

> So that's Husky Agent. The model interprets, deterministic code executes, the
> policy engine can refuse before you're ever asked, and the key never leaves the
> device. HashKey Chain testnet, transfers and swaps — a small surface, done
> properly. The kind of agent a compliance team can reason about. Husky Agent:
> cool tools, clear intent.

---

## C. Optional beats (add ~45s, or use as B-roll)

### C1 — It refuses to invent (best "agents usually fail here" beat) · +15s

**DO** — type: `send something to juan`

**SAY**
> And here's the thing that usually breaks agents: "send something to juan". It
> doesn't guess. If a value is missing, the rule is ask — never invent an amount,
> a token, or an address.

### C2 — No shell, no files · +10s

**DO** — type: `can you read my .env file?` (do **not** open the file)

**SAY**
> It can't. There's no file tool and no shell in this session, so there's nothing
> for a prompt injection to reach.

### C3 — Blind signing, told honestly · +20s (recommended if technical judges are present)

**DO** — go back to the device screen during Beat 5 or 7 and pause on the
blind-signing page.

**SAY**
> One honest detail for anyone who knows Ledger: our router has no clear-signing
> descriptor in Ledger's registry, so the device shows the raw fields and a hash —
> it can't decode our swap. The real fix is an ERC-7730 descriptor, which is a
> registry PR and a review cycle, not hackathon work. So the human-readable layer
> here is *our* summary, and what makes it checkable is that the device displays
> the hash independently of the model.

---

## D. Fallbacks

| Failure | What to do on camera |
|---|---|
| Speculos down / `Connection refused` | `pnpm speculos:start` in a second pane; say the CLI health-checks it at startup |
| `Device is busy (lock getAddress)` | ask the same question again — it's a stale lock, not a failure |
| Model/API error | re-ask the same sentence once; if it persists, cut to the pre-recorded run |
| Flashblocks line missing | keep narrating the receipt; the silent degradation is intended behaviour |
| RPC/faucet trouble | use the backup recording (docs/07 §Contingency) |
| You fumble the device buttons | the last page rejects with **right** — press **both**; nothing is signed until you do, so just re-ask |

Record a full backup run before the live one. The demo is a sequence of dependent
on-chain actions; a backup costs five minutes and removes the only real risk.

---

## E. Honest-claims card

Say this | Not this
---|---
"a Ledger, running in Speculos, Ledger's emulator" | "Secure Enclave", "Apple Secure Enclave"
"the same signing code path as a physical device; transport is a config change" | "we're using a hardware wallet" (unqualified)
"transfer and swap on HashKey Chain testnet" | "it can do anything", "lending", "staking", "multi-chain"
"the model never builds calldata and never signs" | "the model is sandboxed" (it's narrower than that — it has 2 write tools and no shell)
"preconfirmed — not final" | "instant finality"
"policy checks run before approval" | "auto-approval under a limit" (there is no auto-approval, by decision)

Also fair to volunteer: the interpretation stage runs on the Pi agent harness
(`@earendil-works/pi-ai`), provider-agnostic through `HUSKY_AGENT_MODEL` —
swap the model in `.env`, not in the code.

---

## F. If they've seen the Maki video

Same DNA, different project. Maki is the general on-chain agent with smart-account
signing and a proof-of-humanity layer. Husky Agent is deliberately narrower and
built around where it runs:

| | Maki | Husky Agent |
|---|---|---|
| Signing | Secure Enclave + Ledger | Ledger only (Speculos in dev) |
| Chain | multi-chain | HashKey Chain testnet (133) only |
| Operations | broad DeFi surface | transfer + swap, nothing else |
| Swaps | external venues | our own AMM deployed on HSK |
| Chain tech | — | HSK Flashblocks preconfirmations (~200ms), never shown as finality |
| Recipients | ENS + contacts | local `contacts.json`, then a raw `0x` |
| Policy | local policy + human approval | two-checkpoint policy engine (pre-build, post-simulate) + human approval, no auto-approval |

One-liner if asked "how is this different from what we saw before?":

> Maki's claim is that the keys are unreachable. Husky Agent's claim is narrower
> and harder: the model can't *build the transaction* either, and every approval
> is a summary decoded from calldata — plus it's built on HSK, quoting an AMM we
> deployed there, with preconfirmations from HSK Flashblocks.
