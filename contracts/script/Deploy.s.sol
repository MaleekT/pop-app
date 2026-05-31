// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { Pop } from "../src/Pop.sol";

contract DeployPop is Script {
    function run() external returns (Pop pop) {
        address usdc     = vm.envAddress("USDC_ADDRESS");
        address resolver = vm.envAddress("RESOLVER_ADDRESS");

        console.log("Deploying Pop...");
        console.log("  USDC:    ", usdc);
        console.log("  Resolver:", resolver);
        console.log("  Deployer:", msg.sender);

        vm.startBroadcast();
        pop = new Pop(usdc, resolver);
        vm.stopBroadcast();

        console.log("Pop deployed at:", address(pop));
        console.log("Verify on-chain resolver():", pop.resolver());
    }
}
