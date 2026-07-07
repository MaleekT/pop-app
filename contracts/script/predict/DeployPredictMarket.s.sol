// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { PredictMarket } from "../../src/predict/PredictMarket.sol";

contract DeployPredictMarket is Script {
    function run() external returns (PredictMarket market) {
        address usdc     = vm.envAddress("USDC_ADDRESS");
        address resolver = vm.envAddress("RESOLVER_ADDRESS");
        address owner    = vm.envAddress("OWNER_ADDRESS");

        console.log("Deploying PredictMarket...");
        console.log("  USDC:    ", usdc);
        console.log("  Resolver:", resolver);
        console.log("  Owner:   ", owner);
        console.log("  Deployer:", msg.sender);

        vm.startBroadcast();
        market = new PredictMarket(usdc, resolver, owner);
        vm.stopBroadcast();

        console.log("PredictMarket deployed at:", address(market));
        console.log("Verify resolver():", market.resolver());
        console.log("Verify owner():   ", market.owner());
    }
}
