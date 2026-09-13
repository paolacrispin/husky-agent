# HSKChain KYC integration

Official source: [HSKChain KYC Integration](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/KYC)

The HSKChain KYC system is documented as an on-chain Soul Bound Token (SBT) that exposes verification levels, verification status, ENS-name approval, and a human-verification check. This reference preserves the source page's useful interface while calling out two details that must not be guessed.

## Important source caveats

- The source page uses a placeholder `KYC_SBT_ADDRESS` but does not publish the actual KYC SBT deployment address. Never invent or silently substitute an address. Before integration, obtain the current official deployment address and verify its bytecode and network.
- The source example uses `https://hk-testnet.rpc.alt.technology`, while HSKChain's canonical Network Info page lists `https://testnet.hsk.xyz` for chain ID 133. Use the canonical RPC by default and verify `eth_chainId`; only use another provider after independently verifying it.
- The page demonstrates testnet access and does not provide a mainnet KYC deployment address. Do not assume the testnet contract or ABI is valid for Mainnet.

## Levels and statuses

KYC level values:

| Level | Value | Meaning |
| --- | ---: | --- |
| `NONE` | 0 | No KYC verification |
| `BASIC` | 1 | Basic verification |
| `ADVANCED` | 2 | Advanced verification |
| `PREMIUM` | 3 | Premium verification |
| `ULTIMATE` | 4 | Ultimate verification |

KYC status values:

| Status | Value | Meaning |
| --- | ---: | --- |
| `NONE` | 0 | No status; default |
| `APPROVED` | 1 | Verification approved |
| `REVOKED` | 2 | Verification revoked |

For an application eligibility gate, define the required minimum level explicitly and require `APPROVED`. Treat `REVOKED` and `NONE` as ineligible unless the product's policy says otherwise. `isHuman` is a useful signal but is not automatically equivalent to a legal or regulatory KYC determination.

## Contract interface documented by HSKChain

Read functions:

```solidity
function getTotalFee() external view returns (uint256);
function isHuman(address account) external view returns (bool, uint8);
function getKycInfo(address account) external view returns (
    string memory ensName,
    KycLevel level,
    KycStatus status,
    uint256 createTime
);
function isEnsNameApproved(address user, string calldata ensName)
    external view returns (bool);
```

The source page documents these state-changing or administrative functions:

```solidity
function requestKyc(string calldata ensName) external payable;
function revokeKyc(address user) external;
function restoreKyc(address user) external;
function approveEnsName(address user, string calldata ensName) external;
```

The page does not fully specify access-control roles or the exact fee policy. Treat `revokeKyc`, `restoreKyc`, and `approveEnsName` as privileged until the verified ABI and deployment configuration prove otherwise. Query `getTotalFee()` before a user requests KYC; never guess the payable amount.

## Events

The documented events are:

- `KycRequested`
- `KycLevelUpdated`
- `KycStatusUpdated`
- `KycRevoked`
- `KycRestored`
- `AddressApproved`
- `EnsNameApproved`

Use the verified ABI to obtain exact event parameter types before writing indexers or subgraph mappings.

## Read-only viem setup

The source page uses `viem`. For a testnet read, prefer the canonical HSKChain endpoint:

The following is intentionally illustrative rather than immediately runnable: `KYC_SBT_ADDRESS` must be replaced only after the official deployment has been obtained and verified.

```ts
import { createPublicClient, http, type Address } from "viem";
import { hashkeyTestnet } from "viem/chains";
import KycSBTAbi from "./abis/KycSBT.json";

const publicClient = createPublicClient({
  chain: hashkeyTestnet,
  transport: http("https://testnet.hsk.xyz"),
});

const kycInfo = await publicClient.readContract({
  address: KYC_SBT_ADDRESS, // obtain and verify; do not invent
  abi: KycSBTAbi,
  functionName: "getKycInfo",
  args: [userAddress as Address],
});
```

If the installed viem version does not export `hashkeyTestnet`, define or import a chain profile with chain ID 133, native symbol HSK, the canonical RPC, and the official testnet explorer. Verify the resulting `chain.id` and live RPC response before use.

For wallet-backed writes, use a wallet client only after the user has reviewed the target network, KYC contract address, function, ENS name, and payable fee. Keep private keys out of browser bundles and logs.

## Product and compliance safeguards

- Treat KYC state and ENS names as sensitive identity-related data even though the chain makes contract state and event history observable. Do not put personally identifying information in calldata or event fields unless the design explicitly requires it.
- Do not claim that holding the SBT proves compliance for every jurisdiction or product. Map the on-chain level/status to the application's legal and compliance policy.
- Decide how the application handles a revoked status, missing record, RPC outage, stale reads, and a KYC contract upgrade before putting the check on a critical path.
- Because the documented response includes `createTime` but no expiry field, do not invent an expiry rule; obtain the governing policy or current contract interface.

## Testing checklist

Test all five levels and all three statuses, including transitions to and from `REVOKED`. Also test ENS approval, insufficient payable value, failed transactions, network/RPC errors, ABI mismatch, and delayed confirmation. Compare indexed events with direct JSON-RPC reads and the explorer when diagnosing discrepancies.

For the complete source, implementation examples, and support portal, use the [original KYC documentation](https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/KYC).
