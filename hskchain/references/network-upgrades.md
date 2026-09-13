# HSKChain Jovian network upgrade

Original notice: [Jovian Network Upgrade](https://docs.hskchain.net/docs/Notices/Jovian-Upgrade)

## What Jovian means

Jovian is a protocol hardfork, not a wallet, bridge, or application framework. HSKChain's notice describes a single coordinated upgrade from Fjord through several OP Stack hardforks:

```text
Fjord → Granite → Holocene → Isthmus → Jovian
```

It is mainly operationally important for RPC, full-node, and archive-node operators. A node that is not upgraded can diverge from the network and require a re-sync. Application developers should still know the upgrade because it changes fee behavior, supported EVM features, and the node/runtime versions used by their infrastructure.

## Activation schedule from the notice

All times are UTC and the documented activation times are five minutes apart:

| Hardfork | Testnet | Testnet Unix | Mainnet | Mainnet Unix |
| --- | --- | ---: | --- | ---: |
| Granite | 2026-07-09 06:30:00 | 1783578600 | Already active | — |
| Holocene | 2026-07-09 06:35:00 | 1783578900 | 2026-07-29 06:30:00 | 1785306600 |
| Isthmus | 2026-07-09 06:40:00 | 1783579200 | 2026-07-29 06:35:00 | 1785306900 |
| Jovian | 2026-07-09 06:45:00 | 1783579500 | 2026-07-29 06:40:00 | 1785307200 |

These dates are a record of the notice, not a reason to schedule a new future upgrade. When operating a node now, read the original notice and current repository templates, then verify the node is following the live chain head.

## Required node versions

The notice requires:

| Component | Version | Image |
| --- | --- | --- |
| `op-geth` | `v1.101605.0` | `us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101605.0` |
| `op-node` | `v1.16.5` | `public.ecr.aws/x7e7q5l8/op-node:v1.16.5` |

The `op-node` image moved to the public ECR registry shown above. Confirm the current official notice before pinning versions because future upgrades may supersede these tags.

## Operator actions

1. Update the `GETH_IMAGE` and `NODE_IMAGE` values in `.env`/Docker Compose.
2. Pull the current `rollup.json`:

```bash
# Testnet
curl -o rollup.json "https://hashkeychain.s3.ap-southeast-1.amazonaws.com/testnet/rollup.json"

# Mainnet
curl -o rollup.json "https://hashkeychain.s3.ap-southeast-1.amazonaws.com/mainnet/rollup.json"
```

If using `ROLLUP_CONFIG_URL`, the notice says the URL remains the same and the contents are updated in place; restart `op-node` so it reloads the file.

3. Supply hardfork override flags to `op-geth` (not `op-node`) when required by the build:

```bash
# Testnet
op-geth \
  --override.granite=1783578600 \
  --override.holocene=1783578900 \
  --override.isthmus=1783579200 \
  --override.jovian=1783579500

# Mainnet; Granite is already active
op-geth \
  --override.holocene=1785306600 \
  --override.isthmus=1785306900 \
  --override.jovian=1785307200
```

Confirm the exact flags supported by the installed build with `op-geth --help | grep override`. Then restart and inspect logs:

```bash
docker compose up -d
docker compose logs -f
```

The `op-node` and `op-geth` logs should agree on activation times, and the node should continue following the chain head without divergence or an unexpected reorg.

## Protocol features introduced

- Granite: fault-proof hardening, including a cap on `bn256Pairing` precompile input and a shorter channel timeout.
- Holocene: stricter block derivation/strict batch ordering, configurable EIP-1559 elasticity and denominator through the L1 `SystemConfig`, and a fault-proof MIPS/FPVM update.
- Isthmus: Ethereum Pectra/Prague parity features including EIP-7702 set-code transactions, EIP-2537 BLS12-381 precompiles, EIP-2935 historical block hashes, EIP-7623 increased calldata cost, an L2 Withdrawals Root in the block header, and a configurable operator fee.
- Jovian: improved rollup fee calculation with a configurable minimum base fee through `SystemConfig`, related block-header changes, and an FPVM maintenance update.

Do not assume that every wallet, SDK, or RPC provider supports newer transaction types or precompiles merely because the network does. Check the target toolchain and live RPC behavior before relying on EIP-7702 or other hardfork-specific features.

## When an application or node behaves unexpectedly

For a node: check the image tags, `rollup.json`, override flags, startup logs, and chain-head progress in that order. For a dApp: verify the chain ID, fee estimation, transaction type support, and receipt on the correct explorer; then consult the [original upgrade notice](https://docs.hskchain.net/docs/Notices/Jovian-Upgrade) for superseding instructions.
