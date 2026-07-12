// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { PredictMarket } from "../../src/predict/PredictMarket.sol";
import { Parlay } from "../../src/predict/Parlay.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ---------------------------------------------------------------------------
// 6-decimal mock USDC
// ---------------------------------------------------------------------------
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// Minimal market stub that returns an arbitrary (sidePool, pot) — used only to exercise
// the defensive 1x floor in quote(), which the real PredictMarket can never trigger.
contract MockMarket {
    uint256 public sidePool;
    uint256 public pot;
    function set(uint256 _s, uint256 _p) external { sidePool = _s; pot = _p; }
    function poolInfo(uint256, uint8) external view returns (uint256, uint256) { return (sidePool, pot); }
}

// ---------------------------------------------------------------------------
// Hook token + reentrancy attacker for settle
// ---------------------------------------------------------------------------
interface ITokenReceiver { function onTokenReceived() external; }

contract HookERC20 is ERC20 {
    constructor() ERC20("Hook USDC", "hUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (to.code.length > 0) {
            try ITokenReceiver(to).onTokenReceived() {} catch {}
        }
        return ok;
    }
}

contract ReentrantSettler is ITokenReceiver {
    Parlay public immutable parlay;
    uint256 public ticketId;
    bool public armed;
    bool public reentrancyBlocked;

    constructor(address _parlay) { parlay = Parlay(_parlay); }
    function approve(address token) external { IERC20(token).approve(address(parlay), type(uint256).max); }
    function buy(Parlay.Leg[] calldata picks, uint128 stake) external returns (uint256 id) {
        id = parlay.buyTicket(picks, stake);
        ticketId = id;
    }
    function arm() external { armed = true; }
    function doSettle(uint256 id) external { parlay.settle(id); }
    function onTokenReceived() external override {
        if (armed) {
            armed = false;
            try parlay.settle(ticketId) {} catch { reentrancyBlocked = true; }
        }
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract ParlayTest is Test {
    MockUSDC usdc;
    PredictMarket pm;
    Parlay parlay;

    address resolver = makeAddr("resolver");
    address owner    = makeAddr("owner");
    address alice    = makeAddr("alice");   // parlay bettor
    address bob      = makeAddr("bob");      // seeds outcome 0
    address carol    = makeAddr("carol");    // seeds outcome 1
    address stranger = makeAddr("stranger");

    uint256 constant NOW  = 1_000_000;
    uint64  RESOLVE_AT;
    uint256 CW;
    bytes32 constant DEF = keccak256("market");
    bytes32 constant EV  = keccak256("evidence");

    uint128 constant HOUSE = 1_000e6;

    function setUp() public {
        vm.warp(NOW);
        usdc = new MockUSDC();
        pm = new PredictMarket(address(usdc), resolver, owner);
        parlay = new Parlay(address(usdc), address(pm), owner);
        RESOLVE_AT = uint64(NOW + 7 days);
        CW = pm.CHALLENGE_WINDOW();

        address[4] memory funded = [owner, alice, bob, carol];
        for (uint256 i; i < funded.length; ++i) {
            usdc.mint(funded[i], 10_000e6);
            vm.prank(funded[i]);
            usdc.approve(address(pm), type(uint256).max);
            vm.prank(funded[i]);
            usdc.approve(address(parlay), type(uint256).max);
        }

        vm.prank(owner);
        parlay.fundHouse(HOUSE);
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    function _market() internal returns (uint256 id) {
        vm.prank(owner);
        id = pm.createMarket(DEF, RESOLVE_AT, 2);
    }
    // Seed both sides so every outcome has liquidity (each side of an equal pool is 2x).
    function _seed(uint256 id, uint128 amt0, uint128 amt1) internal {
        vm.prank(bob);
        pm.deposit(id, 0, amt0);
        vm.prank(carol);
        pm.deposit(id, 1, amt1);
    }
    function _resolve(uint256 id, uint8 winner) internal {
        if (block.timestamp < RESOLVE_AT) vm.warp(RESOLVE_AT);
        vm.prank(resolver);
        pm.proposeOutcome(id, winner, EV);
        vm.warp(block.timestamp + CW + 1);
        pm.finalize(id);
    }
    function _void(uint256 id) internal {
        vm.prank(resolver);
        pm.voidMarket(id, EV);
    }
    function _legs(uint256 a, uint8 oa, uint256 b, uint8 ob) internal pure returns (Parlay.Leg[] memory legs) {
        legs = new Parlay.Leg[](2);
        legs[0] = Parlay.Leg({ marketId: a, outcome: oa });
        legs[1] = Parlay.Leg({ marketId: b, outcome: ob });
    }
    // Two equal-pool markets → each picked side is 2x → 2-leg parlay on outcome 0 is 4x.
    function _twoEqualMarkets() internal returns (uint256 a, uint256 b) {
        a = _market();
        b = _market();
        _seed(a, 25e6, 25e6);
        _seed(b, 25e6, 25e6);
    }

    // ── constructor ────────────────────────────────────────────────────────────
    function test_constructor_setsImmutables() public view {
        assertEq(address(parlay.USDC()), address(usdc));
        assertEq(address(parlay.market()), address(pm));
        assertEq(parlay.owner(), owner);
        assertEq(parlay.ODDS_SCALE(), 1e6);
        assertEq(parlay.MAX_MULTIPLIER(), 50e6);
        assertEq(parlay.MIN_LEGS(), 2);
        assertEq(parlay.MAX_LEGS(), 10);
    }

    function test_constructor_revertZeroUsdc() public {
        vm.expectRevert("zero addr");
        new Parlay(address(0), address(pm), owner);
    }
    function test_constructor_revertZeroMarket() public {
        vm.expectRevert("zero addr");
        new Parlay(address(usdc), address(0), owner);
    }
    function test_constructor_revertZeroOwner() public {
        vm.expectRevert("zero addr");
        new Parlay(address(usdc), address(pm), address(0));
    }

    // ── fundHouse ────────────────────────────────────────────────────────────
    function test_fundHouse_happy() public {
        assertEq(parlay.houseBalance(), HOUSE);
        assertEq(parlay.houseAvailable(), HOUSE);
        vm.prank(owner);
        parlay.fundHouse(500e6);
        assertEq(parlay.houseBalance(), HOUSE + 500e6);
        assertEq(usdc.balanceOf(address(parlay)), HOUSE + 500e6);
    }
    function test_fundHouse_revertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(Parlay.NotOwner.selector);
        parlay.fundHouse(100e6);
    }
    function test_fundHouse_revertZero() public {
        vm.prank(owner);
        vm.expectRevert(Parlay.ZeroStake.selector);
        parlay.fundHouse(0);
    }

    // ── quote ────────────────────────────────────────────────────────────────
    function test_quote_twoLegsCleanOdds() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        assertEq(parlay.quote(_legs(a, 0, b, 0)), 4e6); // 2x * 2x
    }
    function test_quote_emptyPoolLeg() public {
        uint256 a = _market();
        _seed(a, 25e6, 25e6);
        uint256 b = _market();
        vm.prank(bob);
        pm.deposit(b, 0, 25e6); // only outcome 0 seeded; outcome 1 of b stays empty
        // leg b-1 has sidePool 0 -> MAX_MULTIPLIER; combined with a-0 (2x) and capped at MAX.
        Parlay.Leg[] memory legs = _legs(a, 0, b, 1);
        assertEq(parlay.quote(legs), parlay.MAX_MULTIPLIER());
    }
    function test_quote_floorsLegOddsAtOneX() public {
        MockMarket mock = new MockMarket();
        mock.set(200, 100); // sidePool > pot -> raw legOdds 0.5x -> floored to 1x
        Parlay mockParlay = new Parlay(address(usdc), address(mock), owner);
        Parlay.Leg[] memory legs = new Parlay.Leg[](1);
        legs[0] = Parlay.Leg({ marketId: 1, outcome: 0 });
        assertEq(mockParlay.quote(legs), 1e6);
    }
    function test_quote_capsLegOddsAtMax() public {
        MockMarket mock = new MockMarket();
        mock.set(1, 1000); // tiny side vs pot -> raw legOdds 1e9 -> capped to MAX per leg
        Parlay mockParlay = new Parlay(address(usdc), address(mock), owner);
        Parlay.Leg[] memory legs = new Parlay.Leg[](1);
        legs[0] = Parlay.Leg({ marketId: 1, outcome: 0 });
        assertEq(mockParlay.quote(legs), mockParlay.MAX_MULTIPLIER());
    }

    // ── buyTicket ────────────────────────────────────────────────────────────
    function test_buyTicket_happy() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);

        (address bettor, uint128 stake, uint256 mult, Parlay.Status status) = parlay.tickets(id);
        assertEq(bettor, alice);
        assertEq(stake, 10e6);
        assertEq(mult, 4e6);
        assertEq(uint8(status), uint8(Parlay.Status.Open));

        // reserve = payout - stake = 40 - 10 = 30
        assertEq(parlay.totalReserved(), 30e6);
        assertEq(parlay.houseAvailable(), HOUSE - 30e6);
        assertEq(usdc.balanceOf(alice), aliceBefore - 10e6);
        assertEq(parlay.getLegs(id).length, 2);
    }
    function test_buyTicket_revertTooFewLegs() public {
        Parlay.Leg[] memory legs = new Parlay.Leg[](1);
        legs[0] = Parlay.Leg({ marketId: 1, outcome: 0 });
        vm.prank(alice);
        vm.expectRevert(Parlay.BadLegCount.selector);
        parlay.buyTicket(legs, 10e6);
    }
    function test_buyTicket_revertTooManyLegs() public {
        Parlay.Leg[] memory legs = new Parlay.Leg[](11);
        for (uint256 i; i < 11; ++i) legs[i] = Parlay.Leg({ marketId: i + 1, outcome: 0 });
        vm.prank(alice);
        vm.expectRevert(Parlay.BadLegCount.selector);
        parlay.buyTicket(legs, 10e6);
    }
    function test_buyTicket_revertZeroStake() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        vm.expectRevert(Parlay.ZeroStake.selector);
        parlay.buyTicket(_legs(a, 0, b, 0), 0);
    }
    function test_buyTicket_revertDuplicateMarket() public {
        uint256 a = _market();
        _seed(a, 25e6, 25e6);
        vm.prank(alice);
        vm.expectRevert(Parlay.DuplicateMarket.selector);
        parlay.buyTicket(_legs(a, 0, a, 1), 10e6);
    }
    function test_buyTicket_revertMarketNotOpen() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        _resolve(a, 0); // a is now Resolved, no longer open
        vm.prank(alice);
        vm.expectRevert(Parlay.MarketNotOpen.selector);
        parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
    }
    function test_buyTicket_revertBadOutcome() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        vm.expectRevert(Parlay.BadOutcome.selector);
        parlay.buyTicket(_legs(a, 2, b, 0), 10e6); // outcome 2 on a 2-outcome market
    }
    function test_buyTicket_revertInsufficientHouse() public {
        // Fresh parlay with a tiny house pool.
        Parlay poor = new Parlay(address(usdc), address(pm), owner);
        vm.prank(owner);
        usdc.approve(address(poor), type(uint256).max);
        vm.prank(owner);
        poor.fundHouse(5e6); // reserve for a 4x/10 stake is 30 > 5
        vm.prank(alice);
        usdc.approve(address(poor), type(uint256).max);

        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        vm.expectRevert(Parlay.InsufficientHouse.selector);
        poor.buyTicket(_legs(a, 0, b, 0), 10e6);
    }

    // ── settle ───────────────────────────────────────────────────────────────
    function test_settle_allWin() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        uint256 aliceBefore = usdc.balanceOf(alice);

        _resolve(a, 0);
        _resolve(b, 0);
        parlay.settle(id);

        (, , , Parlay.Status status) = parlay.tickets(id);
        assertEq(uint8(status), uint8(Parlay.Status.Won));
        assertEq(usdc.balanceOf(alice), aliceBefore + 40e6); // payout
        assertEq(parlay.houseBalance(), HOUSE - 30e6);        // house paid its 30 liability
        assertEq(parlay.totalReserved(), 0);
    }
    function test_settle_oneLegLost() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        uint256 aliceBefore = usdc.balanceOf(alice);

        _resolve(a, 0); // win
        _resolve(b, 1); // lose -> parlay lost
        parlay.settle(id);

        (, , , Parlay.Status status) = parlay.tickets(id);
        assertEq(uint8(status), uint8(Parlay.Status.Lost));
        assertEq(usdc.balanceOf(alice), aliceBefore);   // no payout
        assertEq(parlay.houseBalance(), HOUSE + 10e6);  // stake forfeited to house
        assertEq(parlay.totalReserved(), 0);
    }
    function test_settle_voidLegRefunds() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        uint256 aliceBefore = usdc.balanceOf(alice);

        _void(a);       // a voided
        _resolve(b, 0); // b resolved
        parlay.settle(id);

        (, , , Parlay.Status status) = parlay.tickets(id);
        assertEq(uint8(status), uint8(Parlay.Status.Refunded));
        assertEq(usdc.balanceOf(alice), aliceBefore + 10e6); // stake back
        assertEq(parlay.houseBalance(), HOUSE);              // house untouched
        assertEq(parlay.totalReserved(), 0);
    }
    function test_settle_voidPrecedenceOverLoss() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        uint256 aliceBefore = usdc.balanceOf(alice);

        _void(a);       // voided
        _resolve(b, 1); // would be a loss, but a void refunds the whole ticket
        parlay.settle(id);

        (, , , Parlay.Status status) = parlay.tickets(id);
        assertEq(uint8(status), uint8(Parlay.Status.Refunded));
        assertEq(usdc.balanceOf(alice), aliceBefore + 10e6);
    }
    function test_settle_revertLegNotTerminal() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        _resolve(a, 0); // only a resolved; b still Pending
        vm.expectRevert(Parlay.LegNotTerminal.selector);
        parlay.settle(id);
    }
    function test_settle_revertWrongStatus() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        _resolve(a, 0);
        _resolve(b, 0);
        parlay.settle(id);
        vm.expectRevert(Parlay.WrongStatus.selector);
        parlay.settle(id);
    }
    function test_settle_anyoneCanSettle() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        _resolve(a, 0);
        _resolve(b, 0);
        vm.prank(stranger); // not the bettor
        parlay.settle(id);
        assertEq(uint8(pm.getMarket(a).status), uint8(PredictMarket.Status.Resolved));
        (, , , Parlay.Status status) = parlay.tickets(id);
        assertEq(uint8(status), uint8(Parlay.Status.Won));
    }

    // ── solvency invariant ─────────────────────────────────────────────────────
    function test_solvency_houseNeverBelowReserved() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();
        vm.prank(alice);
        parlay.buyTicket(_legs(a, 0, b, 0), 10e6);
        assertGe(parlay.houseBalance(), parlay.totalReserved());
        // contract holds house + stake
        assertEq(usdc.balanceOf(address(parlay)), HOUSE + 10e6);
    }

    // ── reentrancy on settle ────────────────────────────────────────────────────
    function test_settle_reentrancyBlocked() public {
        HookERC20 hook = new HookERC20();
        PredictMarket hpm = new PredictMarket(address(hook), resolver, owner);
        Parlay hparlay = new Parlay(address(hook), address(hpm), owner);

        // fund house + seed markets with hook tokens
        hook.mint(owner, 10_000e6);
        vm.prank(owner);
        hook.approve(address(hparlay), type(uint256).max);
        vm.prank(owner);
        hparlay.fundHouse(HOUSE);

        hook.mint(bob, 1_000e6);
        hook.mint(carol, 1_000e6);
        vm.prank(bob);
        hook.approve(address(hpm), type(uint256).max);
        vm.prank(carol);
        hook.approve(address(hpm), type(uint256).max);

        vm.prank(owner);
        uint256 a = hpm.createMarket(DEF, RESOLVE_AT, 2);
        vm.prank(owner);
        uint256 b = hpm.createMarket(DEF, RESOLVE_AT, 2);
        vm.prank(bob);
        hpm.deposit(a, 0, 25e6);
        vm.prank(carol);
        hpm.deposit(a, 1, 25e6);
        vm.prank(bob);
        hpm.deposit(b, 0, 25e6);
        vm.prank(carol);
        hpm.deposit(b, 1, 25e6);

        // attacker buys a winning parlay
        ReentrantSettler attacker = new ReentrantSettler(address(hparlay));
        hook.mint(address(attacker), 100e6);
        attacker.approve(address(hook));
        uint256 id = attacker.buy(_legs(a, 0, b, 0), 10e6);

        // resolve both legs to the picked outcome
        vm.warp(RESOLVE_AT);
        vm.prank(resolver);
        hpm.proposeOutcome(a, 0, EV);
        vm.prank(resolver);
        hpm.proposeOutcome(b, 0, EV);
        vm.warp(block.timestamp + CW + 1);
        hpm.finalize(a);
        hpm.finalize(b);

        attacker.arm();
        attacker.doSettle(id);

        assertTrue(attacker.reentrancyBlocked());
        // paid exactly once: 100 - 10 stake + 40 payout = 130
        assertEq(hook.balanceOf(address(attacker)), 130e6);
        (, , , Parlay.Status status) = hparlay.tickets(id);
        assertEq(uint8(status), uint8(Parlay.Status.Won));
    }

    // ── full flow ────────────────────────────────────────────────────────────
    function test_fullFlow_winningParlay() public {
        (uint256 a, uint256 b) = _twoEqualMarkets();

        vm.prank(alice);
        uint256 id = parlay.buyTicket(_legs(a, 0, b, 0), 20e6);
        (, , uint256 mult, ) = parlay.tickets(id);
        assertEq(mult, 4e6);
        // reserve = 80 - 20 = 60
        assertEq(parlay.totalReserved(), 60e6);

        uint256 aliceBefore = usdc.balanceOf(alice);
        _resolve(a, 0);
        _resolve(b, 0);
        parlay.settle(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + 80e6);
        assertEq(parlay.totalReserved(), 0);
        assertGe(parlay.houseBalance(), 0);
    }
}
