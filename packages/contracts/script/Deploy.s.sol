// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HuskyAgentFactory} from "../src/HuskyAgentFactory.sol";
import {HuskyAgentRouter} from "../src/HuskyAgentRouter.sol";

/// @notice Deploys Factory + Router against the existing WHSK predeploy.
/// MockERC20 deployment and pair creation are intentionally left out until
/// docs/02-contracts-spec.md's open items (token count/names, initial
/// liquidity) are decided — this script only stands up the AMM skeleton.
contract Deploy is Script {
    function run() external returns (HuskyAgentFactory factory, HuskyAgentRouter router) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        factory = new HuskyAgentFactory(deployer);
        router = new HuskyAgentRouter(address(factory));

        vm.stopBroadcast();

        console.log("HuskyAgentFactory:", address(factory));
        console.log("HuskyAgentRouter:", address(router));
        console.log("Set HUSKY_AGENT_FACTORY_ADDRESS / HUSKY_AGENT_ROUTER_ADDRESS in .env.testnet to these values.");
    }
}
