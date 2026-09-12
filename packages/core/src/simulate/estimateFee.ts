import { parseAbi, type Address, type PublicClient } from "viem";
import type { UnsignedTx } from "../types/index.js";

/**
 * OP Stack GasPriceOracle predeploy — same address on HSK mainnet and
 * testnet per hskchain/references/network-and-contracts.md.
 */
const GAS_PRICE_ORACLE_ADDRESS: Address = "0x420000000000000000000000000000000000000F";

const gasPriceOracleAbi = parseAbi(["function getL1Fee(bytes _data) view returns (uint256)"]);

/**
 * HSK's total fee is L2 execution fee + L1 security fee (see
 * docs/04-security-policy-spec.md) — a plain gas*gasPrice estimate only
 * covers the L2 half. This queries the L1 component from the GasPriceOracle
 * predeploy and adds it in.
 */
export async function estimateFee(
  tx: UnsignedTx,
  gasEstimate: bigint,
  publicClient: PublicClient,
): Promise<bigint> {
  const [gasPrice, l1Fee] = await Promise.all([
    publicClient.getGasPrice(),
    publicClient
      .readContract({
        address: GAS_PRICE_ORACLE_ADDRESS,
        abi: gasPriceOracleAbi,
        functionName: "getL1Fee",
        args: [tx.data],
      })
      .catch(() => 0n), // degrade to L2-only if the oracle call itself fails
  ]);

  const l2Fee = gasEstimate * gasPrice;
  return l2Fee + l1Fee;
}
