// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";

/// @notice Mints test tokens and seeds initial liquidity for each pair.
/// STUB: exact tokens, amounts, and ratios are open items in
/// docs/02-contracts-spec.md (avoid ratios that produce absurd slippage with
/// small demo swap amounts). Wire this up once MockERC20s are deployed.
contract Seed is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address router = vm.envAddress("HUSKY_AGENT_ROUTER_ADDRESS");

        vm.startBroadcast(deployerKey);

        // Example shape once tokens exist:
        // IERC20(tokenA).approve(router, amountA);
        // IERC20(tokenB).approve(router, amountB);
        // HuskyAgentRouter(router).addLiquidity(
        //     tokenA, tokenB, amountA, amountB, 0, 0, deployer, block.timestamp + 1 hours
        // );

        vm.stopBroadcast();

        console.log("Seed.s.sol is a stub - fill in tokens/amounts once docs/02-contracts-spec.md is closed.");
        console.log("Router:", router);
    }
}
