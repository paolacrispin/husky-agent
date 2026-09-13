# HSKChain developer workflows

Source pages:

- [Developer QuickStart](https://docs.hskchain.net/docs/Developer-QuickStart)
- [Network Info](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/network-info)
- [Explorer](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Explorer)
- [Wallet](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Wallet)
- [Faucet](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Faucet)
- [Safe](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Safe)
- [Bridges](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Bridges)
- [Fee](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Fee)
- [Flashblocks](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Flashblocks)

## Network profiles

```text
HSKChain Mainnet
  chainId: 177
  rpc: https://mainnet.hsk.xyz
  currency: HSK
  explorer: https://hashkey.blockscout.com

HSKChain Testnet
  chainId: 133
  rpc: https://testnet.hsk.xyz
  currency: HSK
  explorer: https://testnet-explorer.hsk.xyz

Ethereum Sepolia (bridge source)
  chainId: 11155111
  rpc: https://rpc2.sepolia.org
  currency: ETH
  explorer: https://sepolia.etherscan.io
```

The docs currently list `eth_chainId` responses of `0xb1` for mainnet and `0x85` for testnet. Check the endpoint at task time; do not rely on this note if an endpoint has been changed or replaced.

## Hardhat

Use the project's existing Hardhat version and secret-loading convention. The docs' testnet example is:

```ts
const config: HardhatUserConfig = {
  networks: {
    hashkeyTestnet: {
      url: "https://testnet.hsk.xyz",
      accounts: process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 133,
    },
  },
};
```

Use `https://mainnet.hsk.xyz` and `chainId: 177` for mainnet. Keep `PRIVATE_KEY` in a local secret store or environment variable; do not commit `.env` files.

## Foundry

For a deployment, set both the RPC and chain ID explicitly:

```bash
forge create <Contract>:<Contract> \
  --rpc-url https://testnet.hsk.xyz \
  --chain-id 133 \
  --private-key "$PRIVATE_KEY"
```

Use a testnet key for testnet and substitute mainnet values only when the user explicitly intends a mainnet deployment. Prefer Foundry's keystore or an external signer when available.

## Remix and wallets

Add the selected profile to MetaMask or another EVM wallet, then choose the injected provider in Remix. The docs specifically list OKX Wallet, MetaMask, TokenPocket, and imToken as compatible. For HSKChain Mainnet, the manual wallet fields are:

```text
Network name: HSKChain
RPC URL: https://mainnet.hsk.xyz
Chain ID: 177
Currency symbol: HSK
Block explorer: https://hashkey.blockscout.com
```

For testnet use the testnet profile above. Always check the wallet's displayed chain ID before signing.

## ethers.js provider

The docs show the ethers v5 form:

```ts
import { ethers } from "ethers";
const provider = new ethers.providers.JsonRpcProvider("https://testnet.hsk.xyz");
```

For ethers v6, use the version-appropriate API instead:

```ts
import { JsonRpcProvider } from "ethers";
const provider = new JsonRpcProvider("https://testnet.hsk.xyz", 133);
```

Use a signer only for an authorized write. Read `chainId`, balances, nonces, and contract state through a provider before constructing the transaction.

## Funding testnet development

The official [HSKChain Testnet Faucet](https://faucet.hsk.xyz/faucet) sends test HSK. The docs warn that it may enforce request limits; use a separate development wallet and start with small transactions.

The documented bridge fallback is:

1. Get Sepolia ETH from a faucet.
2. Wrap it through the Sepolia WETH contract at `0x7b79995e5f793a07bc00c21412e50ecae098e7f9` by calling `deposit()`.
3. Use the [HSKChain Testnet Bridge](https://testnet-bridge.hashkeychain.net/) to move WETH to HSKChain Testnet.
4. Verify both source and destination transactions and wait for the bridge UI/protocol to report completion.

Never treat a bridge URL or token address copied from a third party as authoritative without checking the official docs and current network.

## Bridges

- [Superbridge](https://bridge.hashkeychain.net) supports HSK and other supported assets from Ethereum mainnet to HSKChain; the documented testnet environment is [testnet-bridge.hashkeychain.net](https://testnet-bridge.hashkeychain.net/).
- [Orbiter Finance](https://www.orbiter.finance/en?src_chain=177&tgt_chain=1&src_token=ETH) supports cross-rollup transfers; the docs list a [testnet environment](https://test.orbiter.finance/?source=Sepolia&dest=HashKey%20Sepolia&token=HSK).

Bridge operations are external, potentially irreversible state changes. Confirm the source chain, destination chain, asset, amount, recipient, fees, and expected finality before submitting.

## Safe multisig

The official Safe instances documented by HSKChain are:

- Mainnet: [multisig.hashkeychain.net](https://multisig.hashkeychain.net/welcome?chain=HSK)
- Testnet: [testnet-safe.hsk.xyz](https://testnet-safe.hsk.xyz/welcome?chain=HSKT)
- Mainnet Safe Transaction Service: `https://safe-transaction-hashkey.safe.global`

When creating a Safe, confirm the owners and signature threshold, then fund the Safe with HSK on the same network before proposing a transaction. The required threshold must sign before an owner executes it. Keep owner keys separate and prefer hardware wallets for significant assets.

## Explorer links

BlockScout is the primary developer explorer. Construct links as follows:

```ts
const txUrl = `https://hashkey.blockscout.com/tx/${txHash}`;
const addressUrl = `https://hashkey.blockscout.com/address/${address}`;
const blockUrl = `https://hashkey.blockscout.com/block/${blockNumber}`;
```

The docs also list [OKLink](https://www.oklink.com/zh-hans/hashkey) for multi-chain analytics. Explorer APIs, GraphQL, verification, and traces may require their own current endpoint or authentication; discover those from the live explorer rather than inventing a URL.

## Fees

HSKChain documents two components:

- L2 execution fee: computation and transaction processing on HSKChain; it varies with HSKChain utilization.
- L1 security fee: transaction-data publication to Ethereum; it can be the larger and more volatile component because it depends on Ethereum gas prices and transaction data size.

The documented conceptual model is `Total Fee = L2 Execution Fee + L1 Security Fee`. Use `eth_estimateGas` plus the selected RPC's current fee data, and show users that the L1 component can move independently of the L2 gas estimate. A local gas estimate is not a guaranteed total cost; after a write, inspect the receipt and explorer's fee breakdown when available.

## Flashblocks (testnet only)

The documented endpoint is:

```text
wss://testnet-flashblocks.hsk.xyz/ws
```

It streams preconfirmed partial blocks roughly every 200 ms. A message contains an incremental block diff; the first message for a block (`index: 0`) includes the full block header. The docs say the endpoint is currently available on testnet only and follows the OP Stack Flashblocks format.

```js
import WebSocket from "ws";

const ws = new WebSocket("wss://testnet-flashblocks.hsk.xyz/ws");
ws.on("message", (data) => {
  const flashblock = JSON.parse(data.toString());
  console.log(flashblock);
});
```

Use Flashblocks for low-latency UX or observation. Reconcile with a normal RPC receipt and sealed block before treating a transaction as final.
