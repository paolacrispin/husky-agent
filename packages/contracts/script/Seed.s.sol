// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HuskyAgentRouter} from "../src/HuskyAgentRouter.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {IWHSK} from "../src/interfaces/IWHSK.sol";

/// @notice Wraps native HSK and seeds both demo pools. Amounts are picked
/// per docs/02-contracts-spec.md: small enough to keep the deployer's
/// required testnet HSK modest, large enough that the demo script's "swap 10
/// USDC" scenario moves the pool by ~0.02% — negligible slippage regardless
/// of the default 0.5% tolerance.
///
/// Requires the deployer to hold at least 0.05 testnet HSK (from the faucet)
/// plus gas before running, to wrap into WHSK for the WHSK/USDC pool.
contract Seed is Script {
    // WHSK/USDC: 0.02 WHSK : 0.2 USDC (1 HSK = 10 USDC). Not used by any demo
    // script scenario directly — exists to prove the official WHSK
    // integration on the explorer. Kept tiny since the shared testnet
    // account only carries faucet-sized HSK balances.
    uint256 constant WHSK_LIQUIDITY = 0.02 ether;
    uint256 constant USDC_LIQUIDITY_FOR_WHSK_PAIR = 2 * 10 ** 5; // 0.2 USDC (6 decimals)

    // USDC/HUSKY: 50,000 USDC : 500,000 HUSKY (1 USDC = 10 HUSKY). This is
    // the pair used by the demo script's swap scenario.
    uint256 constant USDC_LIQUIDITY_FOR_HUSKY_PAIR = 50_000 * 10 ** 6;
    uint256 constant HUSKY_LIQUIDITY = 500_000 * 10 ** 18;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address router = vm.envAddress("HUSKY_AGENT_ROUTER_ADDRESS");
        address whsk = vm.envAddress("WHSK_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address husky = vm.envAddress("HUSKY_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);

        IWHSK(whsk).deposit{value: WHSK_LIQUIDITY}();

        IWHSK(whsk).approve(router, WHSK_LIQUIDITY);
        MockERC20(usdc).approve(router, USDC_LIQUIDITY_FOR_WHSK_PAIR + USDC_LIQUIDITY_FOR_HUSKY_PAIR);
        MockERC20(husky).approve(router, HUSKY_LIQUIDITY);

        HuskyAgentRouter(router).addLiquidity(
            whsk,
            usdc,
            WHSK_LIQUIDITY,
            USDC_LIQUIDITY_FOR_WHSK_PAIR,
            0,
            0,
            deployer,
            block.timestamp + 1 hours
        );

        HuskyAgentRouter(router).addLiquidity(
            usdc,
            husky,
            USDC_LIQUIDITY_FOR_HUSKY_PAIR,
            HUSKY_LIQUIDITY,
            0,
            0,
            deployer,
            block.timestamp + 1 hours
        );

        vm.stopBroadcast();

        console.log("Seeded WHSK/USDC and USDC/HUSKY pools.");
        console.log("Remaining deployer balances are the demo buffer for transfer/swap testing.");
    }
}
