// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HuskyAgentFactory} from "../src/HuskyAgentFactory.sol";
import {HuskyAgentRouter} from "../src/HuskyAgentRouter.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Deploys Factory, Router, and the two demo MockERC20s against the
/// existing WHSK predeploy. Amounts/pairs are seeded separately by
/// Seed.s.sol — see docs/02-contracts-spec.md for the exact numbers and why.
contract Deploy is Script {
    function run()
        external
        returns (HuskyAgentFactory factory, HuskyAgentRouter router, MockERC20 usdc, MockERC20 husky)
    {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        factory = new HuskyAgentFactory(deployer);
        router = new HuskyAgentRouter(address(factory));

        usdc = new MockERC20("Mock USD Coin", "USDC", 6);
        husky = new MockERC20("Husky Token", "HUSKY", 18);

        // Enough for both pools' liquidity plus a demo-transaction buffer —
        // see docs/02-contracts-spec.md.
        usdc.mint(deployer, 60_000 * 10 ** 6);
        husky.mint(deployer, 550_000 * 10 ** 18);

        vm.stopBroadcast();

        console.log("HuskyAgentFactory:", address(factory));
        console.log("HuskyAgentRouter:", address(router));
        console.log("USDC:", address(usdc));
        console.log("HUSKY:", address(husky));
        console.log("Set HUSKY_AGENT_FACTORY_ADDRESS / HUSKY_AGENT_ROUTER_ADDRESS in .env.testnet to these values,");
        console.log("and add USDC / HUSKY addresses to tokens.json.");
    }
}
