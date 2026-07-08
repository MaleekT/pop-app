// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { Parlay } from "../../src/predict/Parlay.sol";

contract DeployParlay is Script {
    function run() external returns (Parlay parlay) {
        address usdc   = vm.envAddress("USDC_ADDRESS");
        address market = vm.envAddress("PREDICT_MARKET_ADDRESS");
        address owner  = vm.envAddress("OWNER_ADDRESS");

        console.log("Deploying Parlay...");
        console.log("  USDC:         ", usdc);
        console.log("  PredictMarket:", market);
        console.log("  Owner:        ", owner);
        console.log("  Deployer:     ", msg.sender);

        vm.startBroadcast();
        parlay = new Parlay(usdc, market, owner);
        vm.stopBroadcast();

        console.log("Parlay deployed at:", address(parlay));
        console.log("Verify market():", address(parlay.market()));
        console.log("Verify owner():", parlay.owner());
    }
}
