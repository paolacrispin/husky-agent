# HSKChain networks and contract addresses

Source pages:

- [Network Info](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/network-info)
- [Token Contracts](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Token-Contracts)
- [Contract Addresses](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Contract-Addresses)
- [Oracles](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Oracle)

Addresses are network-specific unless explicitly marked common. Confirm them against the live official docs before a write, especially for bridge and oracle integrations.

## Network identities

| Network | Chain ID | RPC | Explorer | Native token |
| --- | ---: | --- | --- | --- |
| HSKChain Mainnet | 177 | `https://mainnet.hsk.xyz` | `https://hashkey.blockscout.com` | HSK |
| HSKChain Testnet | 133 | `https://testnet.hsk.xyz` | `https://testnet-explorer.hsk.xyz` | HSK |

## HSKChain Mainnet token contracts

| Token | Address | Notes |
| --- | --- | --- |
| HSK | Gas token | Native asset; no ERC-20 token address on HSKChain is listed on the source page |
| WHSK | `0xB210D2120d57b758EE163cFfb43e73728c471Cf1` | Wrapped HSK |
| WETH | `0xefd4bC9afD210517803f293ABABd701CaeeCdfd0` | OptimismMintableERC20 |
| USDT | `0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029` | OptimismMintableERC20 |
| WBTC | `0x6119ca49a79f5825c8b345f8d7ac36b272565b14` | OptimismMintableERC20 |
| USDC | `0x054ed45810DbBAb8B27668922D110669c9D88D0a` | Bridged USDC |

The source page separately lists Ethereum's HSK token at `0xE7C6BF469e97eEB0bFB74C8dbFF5BD47D4C1C98a`, which is not an HSKChain Mainnet token address.

## OP Stack L2 predeploys

The docs state these addresses are the same on HSKChain Mainnet and Testnet:

| Contract | Address |
| --- | --- |
| L2CrossDomainMessenger | `0x4200000000000000000000000000000000000007` |
| GasPriceOracle | `0x420000000000000000000000000000000000000F` |
| L2StandardBridge | `0x4200000000000000000000000000000000000010` |
| SequencerFeeVault | `0x4200000000000000000000000000000000000011` |
| OptimismMintableERC20Factory | `0x4200000000000000000000000000000000000012` |
| L2ERC721Bridge | `0x4200000000000000000000000000000000000014` |
| L1Block | `0x4200000000000000000000000000000000000015` |
| L2ToL1MessagePasser | `0x4200000000000000000000000000000000000016` |
| OptimismMintableERC721Factory | `0x4200000000000000000000000000000000000017` |
| ProxyAdmin | `0x4200000000000000000000000000000000000018` |
| BaseFeeVault | `0x4200000000000000000000000000000000000019` |
| L1FeeVault | `0x420000000000000000000000000000000000001a` |
| OperatorFeeVault | `0x420000000000000000000000000000000000001B` |
| SchemaRegistry | `0x4200000000000000000000000000000000000020` |
| EAS | `0x4200000000000000000000000000000000000021` |

These are OP Stack system contracts, not interchangeable application contracts. Use the documented ABI and verify the target network before calling them.

## Ethereum Mainnet L1 system contracts

These are the L1 addresses listed by the official HSKChain contract-address page:

| Contract | Address |
| --- | --- |
| AddressManager | `0x679A65aD62972Ea3561F40A12e93CcA6f79F35E6` |
| AnchorStateRegistry | `0xE5a698154470AF2626b27fEecb684F8fb265F2E0` |
| AnchorStateRegistryProxy | `0x4deC2aA521108d78d983c0c12656c6CF8631F2ED` |
| DelayedWETH | `0xB8566D805b8DD2E2EC41542A2dc4Af96855f75d8` |
| DelayedWETHProxy | `0xBb70D595147A141e268532BFEF61A8c25054d26D` |
| DisputeGameFactory | `0x71442A5586bde0f5EfD6588D01c2B2820D9D236D` |
| DisputeGameFactoryProxy | `0x04Ec030f362CE5A0b5Fe2d4B4219f287C2EBDE50` |
| L1CrossDomainMessenger | `0x21971eCC803C30A181ee111803253C869083baF1` |
| L1CrossDomainMessengerProxy | `0x899F07862D3A03F70E07b7f01183934b485d2e97` |
| L1ERC721Bridge | `0xcD8f943e7d506cD92dE582Ac5065dE718E568580` |
| L1ERC721BridgeProxy | `0xd4C83D93c6fAE3E0804B785F9Cf465BE95449D04` |
| L1StandardBridge | `0x4634e74d04992BDd5192Cd75897CbD432971aAB6` |
| L1StandardBridgeProxy | `0x2171E6d3B7964fA9654Ce41dA8a8fFAff2Cc70be1` |
| L2OutputOracle | `0xc2DeaDc10B1D1327f1FC5fe1295Be45fCC6b2543` |
| L2OutputOracleProxy | `0x1c8D97E21f868f8b87fa9B16Fc77d46d7B0b48A2` |
| Mips | `0x7447b25b91336127042CC6899B2C15668a1Ab8BA` |
| OptimismMintableERC20Factory | `0x3FAe8259417036C02156DF91BdaF9d8F0ae5551f` |
| OptimismMintableERC20FactoryProxy | `0x0407af506d86bFA5e401099b2fC2355590638f19` |
| OptimismPortal | `0x332Ef0D30808A98144F41CA752BCbE3107e75505` |
| OptimismPortal2 | `0x18A7868ECe35A45aC9138108E5b6e021aD1038d1` |
| OptimismPortalProxy | `0xe7Aa79B59CAc06F9706D896a047fEb9d3BDA8bD3` |
| PermissionedDelayedWETHProxy | `0xd9c31D15f2c649e525C2574bC025b3CAafAaf6fe` |
| PreimageOracle | `0x5B9bEf4d8C36FB013c70d0A6F455807c6BD5270b` |
| ProtocolVersions | `0x1Db23aA684dc625152790eea13a103b02b84a200` |
| ProtocolVersionsProxy | `0x1763E96A028FD1DC11D4Da1F273944f38cafecfE` |
| ProxyAdmin | `0x7986eD289935A0F47FC434C00cDE309fE2c51f1C` |
| SafeProxyFactory | `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` |
| SafeSingleton | `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552` |
| SuperchainConfig | `0x1d31a15050DBE75c6c060D6da696332a5CB943e1` |
| SuperchainConfigProxy | `0xfd1255b6c09D939E7F3896A16C32CDBCD6F8B40A` |
| SystemConfig | `0xbc10fE919504D53953d27989CD5B48B9A7c08Be0` |
| SystemConfigProxy | `0x43F8DeFe3E9286D152E91BB16a248808E7247198` |
| SystemOwnerSafe | `0x441F31C4cdf772558D4EA31f3114de59aE145E7c` |

The page also lists a complete Ethereum Sepolia table. Read it directly when operating the testnet L1 side; do not substitute these Ethereum Mainnet values.

For convenience, the Ethereum Sepolia values from that table are reproduced below:

| Contract | Address |
| --- | --- |
| AddressManager | `0xe86c31fFAc7A394698208c8015CC5892b0268d6D` |
| AnchorStateRegistry | `0x2fC9168Fc84Bd68d0EaB3148357aC6f0B3757764` |
| AnchorStateRegistryProxy | `0x04281Ef5FE221834dc3b6d0b0C87Ef360909C0C3` |
| DelayedWETH | `0xC6f42F73F90Eb76d61223402E4531228b2F1f191` |
| DelayedWETHProxy | `0x7a17DC8067fA46fC6FbD9A11CB90db54e4e25Bbb` |
| DisputeGameFactory | `0x1DBcA6Dc6dE91ff60F8316745b8209E6532d7A41` |
| DisputeGameFactoryProxy | `0x799E013e33d05E48c8b774bFD83aaA82E92049b2` |
| L1CrossDomainMessenger | `0x959ea0fbED4e4cab68Aa337B80CB04D31F0ba4e0` |
| L1CrossDomainMessengerProxy | `0x4c90888DBe6277160CC5846e605C121C1B12e0eE` |
| L1ERC721Bridge | `0x7a618bA3b232886bdb585C18f7029bcf6D66Ef72` |
| L1ERC721BridgeProxy | `0x4209cF769EaF4063b3f37572E54FA41CA4914c2C` |
| L1StandardBridge | `0xA4fc18BCF670d3E2fb368030747d6216fB5a0B72` |
| L1StandardBridgeProxy | `0xC8331F01f556b342C960CaaAABB94924FD4c9d5F` |
| L2OutputOracle | `0xa331f0d13A1D1eFaed34D537bF6852D83Ef7ff13` |
| L2OutputOracleProxy | `0x8650B8deED202306b475986974E2C3749bcFC7dE` |
| Mips | `0xAf4872040bDC11e0322aAf5Af71c16Bf91572EbF` |
| OptimismMintableERC20Factory | `0x6bfF19a3F44D13272EE35D286dbC5CcB5FeDE3a5` |
| OptimismMintableERC20FactoryProxy | `0x8895569849Eded52123e41d3f2A528BED9E3d3F1` |
| OptimismPortal | `0xC5CECA1dC0BD01944E9A665E01634C7d31f80d31` |
| OptimismPortal2 | `0x5b28e0CB4bDe2fD86Ed29D0ded2837eA24c5276a` |
| OptimismPortalProxy | `0x8dc71d4d25c415C0a9F11EF57Bd64ca208531645` |
| PreimageOracle | `0x6151d57fCCe133Abf86c60Ff4DDaBc1C24396495` |
| ProtocolVersions | `0xb3df6404EcE4698795bE27E6c6d73665a68Fcb1d` |
| ProtocolVersionsProxy | `0xebFbf7ebcc0C0449E3F9FA430927a642D35E047c` |
| ProxyAdmin | `0x659c166D3f4DD2e4F6E218B0eD0C6321Dc68619f` |
| SafeProxyFactory | `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` |
| SafeSingleton | `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552` |
| SuperchainConfig | `0xACE8e28573521e2464c55599036E47E3DDe49Caa` |
| SuperchainConfigProxy | `0x8C40a3847301926eC17de95602216758eEe25a71` |
| SystemConfig | `0xDD18788B75048fF45A6D6D4f752ff2Ea2bC58068` |
| SystemConfigProxy | `0x62163c0C9479b4b202eFa52bF8bd9cBBEdd9042F` |
| SystemOwnerSafe | `0xe9a1a112965B4e00577d6028c5116B388581a81e` |

## Oracle addresses

### SUPRA Pull Oracle

| Network | Pull contract | Storage contract |
| --- | --- | --- |
| HSKChain Mainnet | `0x16f70cAD28dd621b0072B5A8a8c392970E87C3dD` | `0x58e158c74DF7Ad6396C0dcbadc4878faC9e93d57` |
| HSKChain Testnet | `0x443A0f4Da5d2fdC47de3eeD45Af41d399F0E5702` | `0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917` |

The docs' example uses `getIndexedPrice(0)` for BTC/USD. Confirm pair IDs and response semantics in the current [SUPRA Pull Oracle documentation](https://docs.supra.com/oracles/data-feeds/pull-oracle).

### APRO price feeds

| Network | Pair | Deviation | Heartbeat | Address |
| --- | --- | ---: | ---: | --- |
| Testnet | BTC/USD | 0.5% | 4h | `0x64697A6Abb508079687465FA9EF99D2Da955D791` |
| Testnet | USDT/USD | 0.5% | 4h | `0xC45D520D18A465Ec23eE99A58Dc4cB96b357E744` |
| Testnet | USDC/USD | 0.1% | 24h | `0xCdB10dC9dB30B6ef2a63aB4460263655808fAE27` |
| Mainnet | BTC/USD | 0.5% | 1h | `0x204ED500ab56A2E19B051561258E3A45c850360F` |
| Mainnet | HSK/USD | 0.5% | 1h | `0x86CE42c1b714149Dc3A7b17169EF67b5F78A224b` |
| Mainnet | USDT/USD | 0.1% | 24h | `0x823d7f90f7A3498DB6595886b6B5dC95E6B0B7f3` |
| Mainnet | USDC/USD | 0.1% | 24h | `0x244Ce344df8837c9d938867E2Ffbf0E4B0169B56` |

Use `latestRoundData()` according to the APRO ABI and validate timestamp, decimals, and freshness before consuming a value.

### Chainlink Streams verifier proxies

| Network | Verifier proxy |
| --- | --- |
| HSKChain Mainnet | `0x3278e7a582B94d82487d4B99b31A511CbAe2Cd54` |
| HSKChain Testnet | `0xE02A72Be64DA496797821f1c4BB500851C286C6c` |

See the [oracle docs](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Oracle) and the provider documentation for the current ABI and feed semantics. For critical applications, use redundant oracle providers as the HSKChain docs recommend.
