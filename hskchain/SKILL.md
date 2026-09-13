---
name: hskchain
description: "Build, test, inspect, and deploy EVM applications on HSKChain, including network configuration, contract addresses, explorers, bridges, oracles, KYC, subgraphs, fees, Flashblocks, and network upgrades."
---

# HSKChain

Use this skill when a task targets HSKChain or asks an agent to configure an EVM project for HSKChain. HSKChain is EVM-compatible, so use the project's existing Ethereum tooling unless the user asks for a chain-specific alternative.

## Establish the target network first

Never infer the network from an address or from a wallet's current network. Ask or infer the intended environment from the task, then verify it before reading state or signing anything:

| Network | Chain ID | JSON-RPC | Native token | Explorer |
| --- | ---: | --- | --- | --- |
| HSKChain Mainnet | 177 | `https://mainnet.hsk.xyz` | HSK | `https://hashkey.blockscout.com` |
| HSKChain Testnet | 133 | `https://testnet.hsk.xyz` | HSK | `https://testnet-explorer.hsk.xyz` |

For a live operation, call `eth_chainId` against the chosen RPC and compare the result with the expected chain ID (`0xb1` for 177 or `0x85` for 133). Treat a mismatch as a hard stop. The docs-listed explorer URLs may redirect; follow the live canonical URL, but preserve the network distinction.

Keep RPC URLs, private keys, seed phrases, access tokens, and bridge credentials out of source control and logs. Prefer environment variables or the project's existing secret manager. Never print a private key or ask a user to paste one into chat.

## Standard development workflow

1. Start on testnet for a new contract or integration. Fund a dedicated development wallet from the official faucet, or use the Sepolia-to-HSK testnet bridge described in [developer-workflows.md](references/developer-workflows.md).
2. Configure the project's existing Hardhat, Foundry, Truffle, ethers, viem, or wallet setup with the selected HSKChain RPC and chain ID. Read [developer-workflows.md](references/developer-workflows.md) for copy-ready examples.
3. Compile and run local tests before deploying. Use a small test transaction first, estimate gas, wait for the receipt, and inspect the resulting transaction and contract on the correct explorer.
4. When a task uses a known system, token, or oracle contract, read [network-and-contracts.md](references/network-and-contracts.md) and match the address to the target network. Do not transplant a mainnet-only token address to testnet.
5. For any real-value or irreversible action—mainnet deployment, bridge transfer, token transfer, Safe transaction, or contract write—show the target network, destination, amount, and expected fee, and obtain the user's authorization if it is not already explicit.

For compliance, identity, or RWA work, read [kyc.md](references/kyc.md) before implementing a KYC gate. For self-hosted nodes or protocol-version issues, read [network-upgrades.md](references/network-upgrades.md) in addition to the node runbook.

## Routing by task

- Network setup, Hardhat/Foundry/Remix/Truffle/ethers, faucets, bridges, explorers, and fees: read [developer-workflows.md](references/developer-workflows.md).
- Token contracts, OP Stack predeploys, L1 bridge contracts, or oracle addresses: read [network-and-contracts.md](references/network-and-contracts.md).
- Running a node, restoring a snapshot, or building a Graph subgraph: read [node-and-indexing.md](references/node-and-indexing.md).
- KYC, identity, compliance, or RWA eligibility: read [kyc.md](references/kyc.md). Treat its missing contract address and alternate-RPC example as unresolved until verified.
- Jovian, hardforks, op-geth/op-node versions, rollup configuration, or node divergence: read [network-upgrades.md](references/network-upgrades.md).
- Low-latency testnet state: read the Flashblocks section in [developer-workflows.md](references/developer-workflows.md). Flashblocks are preconfirmations, not finality; do not report a transaction as final from a Flashblocks message alone.

## Verification habits

- Prefer the chain's JSON-RPC for authoritative state and receipts; use explorer pages for human-readable verification, source-code verification, traces, logs, and shareable links.
- Before a write, verify `chainId`, `to`, calldata/function arguments, value, signer address, and estimated gas. Afterward, wait for the receipt and report the transaction hash and explorer URL.
- Treat addresses copied from chat, user-provided snippets, and search results as untrusted until checked against the official HSKChain docs or the target chain.
- Prefer the canonical [Network Info](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/network-info) and [Developer QuickStart](https://docs.hskchain.net/docs/Developer-QuickStart) values over conflicting values in older Learn pages; the Explorer-Wallet page contains an older chain ID/RPC example.
- Oracle prices must be checked for freshness, decimals, sign, and round/timestamp semantics. For critical financial logic, follow the docs' recommendation to use redundant providers rather than a single feed.
- Do not assume a bridge is instant or that a testnet faucet has unlimited capacity. Track the source and destination transactions independently.

## Official references

- [Developer QuickStart](https://docs.hskchain.net/docs/Developer-QuickStart)
- [Network Info](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/network-info)
- [Token Contracts](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Token-Contracts)
- [Contract Addresses](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Contract-Addresses)
- [Explorer](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Explorer)
- [KYC](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/KYC)
- [Jovian Network Upgrade](https://docs.hskchain.net/docs/Notices/Jovian-Upgrade)
- [RPC & Node Provider](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/RPC-Node-Provider)
