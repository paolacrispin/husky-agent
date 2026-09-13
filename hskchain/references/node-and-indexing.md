# HSKChain node and subgraph operations

Source pages:

- [RPC & Node Provider](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/RPC-Node-Provider)
- [Jovian Network Upgrade](https://docs.hskchain.net/docs/Notices/Jovian-Upgrade)
- [Subgraph](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Subgraph)

These are optional workflows. For ordinary dApp development, use a managed RPC and skip node operation.

Before provisioning or repairing a self-hosted node, read [network-upgrades.md](network-upgrades.md). It records the Jovian hardfork requirements and the node-divergence checks that supplement this generic setup runbook.

## Self-hosted node outline

The official node guide describes an OP Stack-style full node using Docker.

Prerequisites:

- Git, Docker/Compose, OpenSSL
- Ethereum L1 execution RPC and Beacon endpoint
- At least 16 GB RAM, 4 CPU cores, and 500 GB SSD for a full node; the docs list 1 TB SSD for archive mode

Bootstrap:

```bash
git clone https://github.com/HSKChain/fullnode-sync
cd fullnode-sync
openssl rand -hex 32 > ./jwt/jwt.txt
docker compose up -d
docker compose logs -f
```

Create `.env` from the current official template. The stable network-specific values documented there are:

| Variable | Mainnet | Testnet |
| --- | --- | --- |
| `GENESIS_URL` | `https://hashkeychain.s3.ap-southeast-1.amazonaws.com/mainnet/genesis.json` | `https://hashkeychain.s3.ap-southeast-1.amazonaws.com/testnet/genesis.json` |
| `SEQUENCER_HTTP` | `https://mainnet.hsk.xyz` | `https://testnet.hsk.xyz` |
| `ROLLUP_CONFIG_URL` | `https://hashkeychain.s3.ap-southeast-1.amazonaws.com/mainnet/rollup.json` | `https://hashkeychain.s3.ap-southeast-1.amazonaws.com/testnet/rollup.json` |
| `GETH_SYNC_MODE` | `full` or `snap` during setup | `full` or `snap` during setup |
| `GC_MODE` | `archive` or `full` | `archive` or `full` |

The docs also provide current op-geth/op-node image tags, L2 and libp2p bootnodes, API settings, and L1 RPC variables. Read the official page immediately before provisioning; do not hardcode bootnodes or credentials from this reference.

### Snapshot bootstrap

The official archive snapshots are Zstandard-compressed `.tar.zst` files. The guide publishes the latest URLs through:

```text
https://snapshot.hashkeychain.net/mainnet/latest.txt
https://snapshot.hashkeychain.net/testnet/latest.txt
```

The documented sequence is:

```bash
docker compose down
curl -fL -o <network>-archive-chaindata.tar.zst "$(curl -fsSL https://snapshot.hashkeychain.net/<network>/latest.txt)"
tar --use-compress-program=zstd -tvf <network>-archive-chaindata.tar.zst | head
tar --use-compress-program=zstd -xvf <network>-archive-chaindata.tar.zst -C <GETH_DATA_DIR>
docker compose up -d
docker compose logs -f
```

Confirm the archive layout first. Data must end up under `<GETH_DATA_DIR>/geth/chaindata`; keep `GETH_SYNC_MODE=full` when resuming from the snapshot. A snapshot contains large chain data and should only be downloaded to a deliberately chosen data directory with enough space.

## The Graph subgraph

The HSKChain docs document the Graph hosted-service flow for Mainnet:

```text
protocol: ethereum
network: hashkeychain
chain ID: eip155:177
native currency: HSK
```

Install prerequisites:

```bash
npm install -g @graphprotocol/graph-cli
npm install @graphprotocol/graph-ts
```

Initialize with the documented network identifier:

```bash
graph init --product hosted-service \
  --from-example \
  --protocol ethereum \
  --network hashkeychain \
  --contract-name YourContract \
  --index-events
```

The manifest needs an HSKChain contract address, matching ABI, appropriate `startBlock`, and event handlers. Use a real deployment block rather than leaving `startBlock: 1` in production; verify the address and ABI before indexing.

Deploying to the hosted service uses an access token and project identifier:

```bash
graph auth --product hosted-service <YOUR_ACCESS_TOKEN>
graph deploy --product hosted-service <GITHUB_USER>/<SUBGRAPH_NAME>
```

Never put the access token in a committed manifest or paste it into chat. The docs' example GraphQL query is only a shape; the exact endpoint and schema depend on the hosted service/provider. For Testnet, verify provider support before assuming the Mainnet `hashkeychain` network identifier applies.

## Indexing checks

- Check the contract address and network before debugging mappings.
- Use the deployment block to avoid unnecessary historical work.
- Confirm ABI event signatures and generated types.
- Minimize entity loads/saves and monitor indexing status.
- When data is missing, compare the subgraph with direct JSON-RPC logs and the explorer before changing mappings.
