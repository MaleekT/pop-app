// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { PredictMarket } from "../../src/predict/PredictMarket.sol";
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

// ---------------------------------------------------------------------------
// ERC20 that fires a hook on transfer — used to test claim reentrancy
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

// Winning contract that attempts to re-enter claim when it receives its payout
contract ReentrantClaimer is ITokenReceiver {
    PredictMarket public immutable pm;
    uint256 public marketId;
    bool public armed;
    bool public reentrancyBlocked;

    constructor(address _pm) { pm = PredictMarket(_pm); }

    function approve(address token) external { IERC20(token).approve(address(pm), type(uint256).max); }
    function bet(uint256 id, uint8 outcome, uint128 amount) external { pm.deposit(id, outcome, amount); }
    function arm(uint256 id) external { marketId = id; armed = true; }
    function doClaim(uint256 id) external { pm.claim(id); }

    function onTokenReceived() external override {
        if (armed) {
            armed = false;
            try pm.claim(marketId) {} catch { reentrancyBlocked = true; }
        }
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract PredictMarketTest is Test {
    MockUSDC usdc;
    PredictMarket pm;

    address resolver = makeAddr("resolver");
    address owner    = makeAddr("owner");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");
    address dave     = makeAddr("dave");
    address stranger = makeAddr("stranger");

    uint8 constant YES  = 0;
    uint8 constant NO   = 1;
    uint8 constant HOME = 0;
    uint8 constant AWAY = 1;
    uint8 constant DRAW = 2;

    uint256 constant NOW  = 1_000_000;
    uint128 constant BET  = 10e6;
    bytes32 constant DEF  = keccak256("Will BTC be above 100k at T?");
    bytes32 constant EV   = keccak256("evidence");

    uint64 resolveAt;

    function setUp() public {
        vm.warp(NOW);
        usdc = new MockUSDC();
        pm = new PredictMarket(address(usdc), resolver, owner);
        resolveAt = uint64(NOW + 7 days);

        address[4] memory funded = [alice, bob, carol, dave];
        for (uint256 i; i < funded.length; ++i) {
            usdc.mint(funded[i], 1_000e6);
            vm.prank(funded[i]);
            usdc.approve(address(pm), type(uint256).max);
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    function _market(uint8 outcomeCount) internal returns (uint256 id) {
        vm.prank(owner);
        id = pm.createMarket(DEF, resolveAt, outcomeCount);
    }
    function _bet(uint256 id, uint8 outcome, address user, uint128 amount) internal {
        vm.prank(user);
        pm.deposit(id, outcome, amount);
    }
    function _propose(uint256 id, uint8 outcome) internal {
        vm.warp(resolveAt);
        vm.prank(resolver);
        pm.proposeOutcome(id, outcome, EV);
    }
    function _finalize(uint256 id) internal {
        vm.warp(resolveAt + pm.CHALLENGE_WINDOW() + 1);
        pm.finalize(id);
    }

    // ── constructor ────────────────────────────────────────────────────────────
    function test_constructor_setsImmutables() public view {
        assertEq(address(pm.USDC()), address(usdc));
        assertEq(pm.resolver(), resolver);
        assertEq(pm.owner(), owner);
        assertEq(pm.CHALLENGE_WINDOW(), 1 hours);
        assertEq(pm.RESOLVE_TIMEOUT(), 30 days);
        assertEq(pm.MAX_OUTCOMES(), 3);
    }

    function test_constructor_revertZeroUsdc() public {
        vm.expectRevert("zero addr");
        new PredictMarket(address(0), resolver, owner);
    }

    function test_constructor_revertZeroResolver() public {
        vm.expectRevert("zero addr");
        new PredictMarket(address(usdc), address(0), owner);
    }

    function test_constructor_revertZeroOwner() public {
        vm.expectRevert("zero addr");
        new PredictMarket(address(usdc), resolver, address(0));
    }

    // ── createMarket ─────────────────────────────────────────────────────────
    function test_createMarket_happyPath() public {
        uint256 id = _market(2);
        assertEq(id, 1);
        assertEq(pm.nextId(), 1);

        PredictMarket.Market memory m = pm.getMarket(id);
        assertEq(m.definitionHash, DEF);
        assertEq(m.resolveAt, resolveAt);
        assertEq(m.outcomeCount, 2);
        assertEq(uint8(m.status), uint8(PredictMarket.Status.Pending));
    }

    function test_createMarket_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit PredictMarket.MarketCreated(1, DEF, resolveAt, 2);
        vm.prank(owner);
        pm.createMarket(DEF, resolveAt, 2);
    }

    function test_createMarket_incrementsId() public {
        assertEq(_market(2), 1);
        assertEq(_market(2), 2);
        assertEq(_market(3), 3);
    }

    function test_createMarket_revertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(PredictMarket.NotOwner.selector);
        pm.createMarket(DEF, resolveAt, 2);
    }

    function test_createMarket_revertOutcomeCountTooLow() public {
        vm.prank(owner);
        vm.expectRevert(PredictMarket.BadOutcomeCount.selector);
        pm.createMarket(DEF, resolveAt, 1);
    }

    function test_createMarket_revertOutcomeCountTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(PredictMarket.BadOutcomeCount.selector);
        pm.createMarket(DEF, resolveAt, 4);
    }

    function test_createMarket_allowsThreeOutcomes() public {
        uint256 id = _market(3);
        assertEq(pm.getMarket(id).outcomeCount, 3);
    }

    function test_createMarket_revertResolveAtPast() public {
        vm.prank(owner);
        vm.expectRevert(PredictMarket.BadTiming.selector);
        pm.createMarket(DEF, uint64(NOW), 2);
    }

    // ── deposit ────────────────────────────────────────────────────────────────
    function test_deposit_happyPath() public {
        uint256 id = _market(2);
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, true, true, true);
        emit PredictMarket.Deposited(id, alice, YES, BET);
        _bet(id, YES, alice, BET);

        assertEq(pm.pool(id, YES), BET);
        assertEq(pm.totalPot(id), BET);
        assertEq(pm.staked(id, YES, alice), BET);
        assertEq(usdc.balanceOf(alice), aliceBefore - BET);
        assertEq(usdc.balanceOf(address(pm)), BET);
    }

    function test_deposit_multipleUsersSameOutcome() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, YES, bob, 30e6);
        assertEq(pm.pool(id, YES), 40e6);
        assertEq(pm.totalPot(id), 40e6);
        assertEq(pm.staked(id, YES, alice), BET);
        assertEq(pm.staked(id, YES, bob), 30e6);
    }

    function test_deposit_sameUserMultipleOutcomes() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, alice, 5e6);
        assertEq(pm.staked(id, YES, alice), BET);
        assertEq(pm.staked(id, NO, alice), 5e6);
        assertEq(pm.totalPot(id), 15e6);
    }

    function test_deposit_accumulates() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, YES, alice, BET);
        assertEq(pm.staked(id, YES, alice), 20e6);
    }

    function test_deposit_revertWrongStatus() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.prank(bob);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.deposit(id, NO, BET);
    }

    function test_deposit_revertBettingClosed_atResolveAt() public {
        uint256 id = _market(2);
        vm.warp(resolveAt);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.BettingClosed.selector);
        pm.deposit(id, YES, BET);
    }

    function test_deposit_revertBettingClosed_afterResolveAt() public {
        uint256 id = _market(2);
        vm.warp(resolveAt + 1);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.BettingClosed.selector);
        pm.deposit(id, YES, BET);
    }

    function test_deposit_revertBadOutcome() public {
        uint256 id = _market(2);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.BadOutcome.selector);
        pm.deposit(id, 2, BET); // only 0,1 valid
    }

    function test_deposit_revertZeroAmount() public {
        uint256 id = _market(2);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.ZeroAmount.selector);
        pm.deposit(id, YES, 0);
    }

    // ── proposeOutcome ───────────────────────────────────────────────────────
    function test_propose_happyPath() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.warp(resolveAt);

        vm.expectEmit(true, true, false, true);
        emit PredictMarket.OutcomeProposed(id, YES, EV);
        vm.prank(resolver);
        pm.proposeOutcome(id, YES, EV);

        PredictMarket.Market memory m = pm.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictMarket.Status.Proposed));
        assertEq(m.resolvedOutcome, YES);
        assertEq(m.evidenceHash, EV);
        assertEq(m.proposedAt, resolveAt);
    }

    function test_propose_revertNotResolver() public {
        uint256 id = _market(2);
        vm.warp(resolveAt);
        vm.prank(owner);
        vm.expectRevert(PredictMarket.NotResolver.selector);
        pm.proposeOutcome(id, YES, EV);
    }

    function test_propose_revertTooEarly() public {
        uint256 id = _market(2);
        vm.warp(resolveAt - 1);
        vm.prank(resolver);
        vm.expectRevert(PredictMarket.TooEarly.selector);
        pm.proposeOutcome(id, YES, EV);
    }

    function test_propose_revertWrongStatus() public {
        uint256 id = _market(2);
        _propose(id, YES);
        vm.prank(resolver);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.proposeOutcome(id, YES, EV);
    }

    function test_propose_revertBadOutcome() public {
        uint256 id = _market(2);
        vm.warp(resolveAt);
        vm.prank(resolver);
        vm.expectRevert(PredictMarket.BadOutcome.selector);
        pm.proposeOutcome(id, 2, EV);
    }

    function test_propose_atExactlyResolveAt() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.warp(resolveAt);
        vm.prank(resolver);
        pm.proposeOutcome(id, YES, EV);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Proposed));
    }

    // ── challenge ──────────────────────────────────────────────────────────────
    function test_challenge_byParticipant() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);

        vm.expectEmit(true, true, false, false);
        emit PredictMarket.MarketChallenged(id, alice);
        vm.prank(alice);
        pm.challenge(id);

        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Challenged));
    }

    function test_challenge_revertNotParticipant() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.prank(stranger);
        vm.expectRevert(PredictMarket.NotParticipant.selector);
        pm.challenge(id);
    }

    function test_challenge_revertWrongStatus() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.challenge(id);
    }

    function test_challenge_revertWindowClosed() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.warp(resolveAt + pm.CHALLENGE_WINDOW() + 1);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.WindowClosed.selector);
        pm.challenge(id);
    }

    function test_challenge_atWindowEnd_stillOpen() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.warp(resolveAt + pm.CHALLENGE_WINDOW());
        vm.prank(alice);
        pm.challenge(id); // should not revert
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Challenged));
    }

    // ── finalize ───────────────────────────────────────────────────────────────
    function test_finalize_resolves() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);

        vm.warp(resolveAt + pm.CHALLENGE_WINDOW() + 1);
        vm.expectEmit(true, true, false, false);
        emit PredictMarket.MarketResolved(id, YES);
        pm.finalize(id);

        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Resolved));
    }

    function test_finalize_revertWrongStatus() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.finalize(id);
    }

    function test_finalize_revertWindowOpen() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.warp(resolveAt + pm.CHALLENGE_WINDOW()); // boundary — still open
        vm.expectRevert(PredictMarket.WindowOpen.selector);
        pm.finalize(id);
    }

    function test_finalize_zeroWinningPool_voids() public {
        uint256 id = _market(2);
        _bet(id, NO, alice, BET); // nobody backs YES
        _propose(id, YES);

        vm.warp(resolveAt + pm.CHALLENGE_WINDOW() + 1);
        vm.expectEmit(true, false, false, true);
        emit PredictMarket.MarketVoided(id, EV);
        pm.finalize(id);

        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Voided));
    }

    function test_finalize_anyoneCanCall() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.warp(resolveAt + pm.CHALLENGE_WINDOW() + 1);
        vm.prank(stranger);
        pm.finalize(id);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Resolved));
    }

    // ── claim ──────────────────────────────────────────────────────────────────
    function test_claim_singleWinner_getsWholePot() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);
        _finalize(id);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.expectEmit(true, true, false, true);
        emit PredictMarket.Claimed(id, alice, 20e6);
        vm.prank(alice);
        pm.claim(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + 20e6);
        assertTrue(pm.claimed(id, alice));
    }

    function test_claim_twoWinners_splitProRata() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 10e6);
        _bet(id, YES, bob, 30e6);
        _bet(id, NO, carol, 20e6);
        _propose(id, YES);
        _finalize(id);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(alice);
        pm.claim(id);
        vm.prank(bob);
        pm.claim(id);

        // pot 60, YES pool 40 → alice 10*60/40=15, bob 30*60/40=45
        assertEq(usdc.balanceOf(alice), aliceBefore + 15e6);
        assertEq(usdc.balanceOf(bob), bobBefore + 45e6);
        assertEq(usdc.balanceOf(address(pm)), 0);
    }

    function test_claim_hedgedUser() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 10e6);
        _bet(id, NO, alice, 10e6);
        _bet(id, NO, bob, 10e6);
        _propose(id, YES);
        _finalize(id);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pm.claim(id); // sole YES staker → whole pot 30

        assertEq(usdc.balanceOf(alice), aliceBefore + 30e6);
    }

    function test_claim_roundingDustStaysInContract() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 10e6);
        _bet(id, YES, bob, 20e6);
        _bet(id, NO, carol, 10e6);
        _propose(id, YES);
        _finalize(id);

        vm.prank(alice);
        pm.claim(id); // 10*40/30 = 13.333.. → 13_333_333
        vm.prank(bob);
        pm.claim(id); // 20*40/30 = 26.666.. → 26_666_666

        // 39_999_999 paid out of 40_000_000 → 1 unit of dust remains
        assertEq(usdc.balanceOf(address(pm)), 1);
    }

    function test_claim_revertLoserNothingToClaim() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, carol, BET);
        _propose(id, YES);
        _finalize(id);

        vm.prank(carol);
        vm.expectRevert(PredictMarket.NothingToClaim.selector);
        pm.claim(id);
    }

    function test_claim_revertAlreadyClaimed() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);
        _finalize(id);

        vm.prank(alice);
        pm.claim(id);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.AlreadyClaimed.selector);
        pm.claim(id);
    }

    function test_claim_revertWrongStatus() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES); // Proposed, not Resolved
        vm.prank(alice);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.claim(id);
    }

    // ── claimRefund (void) ─────────────────────────────────────────────────────
    function test_claimRefund_afterVoid() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 10e6);
        _bet(id, NO, bob, 20e6);

        vm.prank(resolver);
        pm.voidMarket(id, EV);

        vm.expectEmit(true, true, false, true);
        emit PredictMarket.Refunded(id, alice, 10e6);
        vm.prank(alice);
        pm.claimRefund(id);
        vm.prank(bob);
        pm.claimRefund(id);

        assertEq(usdc.balanceOf(alice), 1_000e6);
        assertEq(usdc.balanceOf(bob), 1_000e6);
        assertEq(usdc.balanceOf(address(pm)), 0);
    }

    function test_claimRefund_hedgedUserGetsBothBack() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 10e6);
        _bet(id, NO, alice, 5e6);
        vm.prank(resolver);
        pm.voidMarket(id, EV);

        vm.prank(alice);
        pm.claimRefund(id);
        assertEq(usdc.balanceOf(alice), 1_000e6);
    }

    function test_claimRefund_revertWrongStatus() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.claimRefund(id);
    }

    function test_claimRefund_revertAlreadyClaimed() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.prank(resolver);
        pm.voidMarket(id, EV);
        vm.prank(alice);
        pm.claimRefund(id);
        vm.prank(alice);
        vm.expectRevert(PredictMarket.AlreadyClaimed.selector);
        pm.claimRefund(id);
    }

    function test_claimRefund_revertNothingToClaim() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.prank(resolver);
        pm.voidMarket(id, EV);
        vm.prank(stranger);
        vm.expectRevert(PredictMarket.NothingToClaim.selector);
        pm.claimRefund(id);
    }

    // ── voidMarket ─────────────────────────────────────────────────────────────
    function test_void_byResolver_fromPending() public {
        uint256 id = _market(2);
        vm.prank(resolver);
        pm.voidMarket(id, EV);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Voided));
    }

    function test_void_byOwner_fromProposed() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.prank(owner);
        pm.voidMarket(id, EV);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Voided));
    }

    function test_void_fromChallenged() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.prank(alice);
        pm.challenge(id);
        vm.prank(resolver);
        pm.voidMarket(id, EV);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Voided));
    }

    function test_void_revertNotAuthorized() public {
        uint256 id = _market(2);
        vm.prank(stranger);
        vm.expectRevert(PredictMarket.NotAuthorized.selector);
        pm.voidMarket(id, EV);
    }

    function test_void_revertWrongStatus_resolved() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);
        _finalize(id);
        vm.prank(resolver);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.voidMarket(id, EV);
    }

    function test_void_revertWrongStatus_voided() public {
        uint256 id = _market(2);
        vm.prank(resolver);
        pm.voidMarket(id, EV);
        vm.prank(resolver);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.voidMarket(id, EV);
    }

    // ── resolveChallenge ───────────────────────────────────────────────────────
    function test_resolveChallenge_ownerResolves() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);
        vm.prank(alice);
        pm.challenge(id);

        vm.prank(owner);
        pm.resolveChallenge(id, YES, EV);

        PredictMarket.Market memory m = pm.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictMarket.Status.Resolved));
        assertEq(m.resolvedOutcome, YES);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pm.claim(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + 20e6);
    }

    function test_resolveChallenge_revertNotOwner() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.prank(alice);
        pm.challenge(id);
        vm.prank(stranger);
        vm.expectRevert(PredictMarket.NotOwner.selector);
        pm.resolveChallenge(id, YES, EV);
    }

    function test_resolveChallenge_revertWrongStatus() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES); // Proposed, not Challenged
        vm.prank(owner);
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.resolveChallenge(id, YES, EV);
    }

    function test_resolveChallenge_revertBadOutcome() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.prank(alice);
        pm.challenge(id);
        vm.prank(owner);
        vm.expectRevert(PredictMarket.BadOutcome.selector);
        pm.resolveChallenge(id, 2, EV);
    }

    function test_resolveChallenge_zeroPoolVoids() public {
        uint256 id = _market(3);
        _bet(id, HOME, alice, BET);
        _bet(id, AWAY, bob, BET);
        _propose(id, HOME);
        vm.prank(alice);
        pm.challenge(id);

        vm.prank(owner);
        pm.resolveChallenge(id, DRAW, EV); // nobody backed DRAW

        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Voided));
    }

    // ── timeoutVoid (trustless recovery) ────────────────────────────────────────
    function test_timeoutVoid_fromPending_afterTimeout() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 10e6);
        _bet(id, NO, bob, 20e6);

        vm.warp(resolveAt + pm.RESOLVE_TIMEOUT());
        vm.prank(stranger); // permissionless
        pm.timeoutVoid(id);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Voided));

        vm.prank(alice);
        pm.claimRefund(id);
        vm.prank(bob);
        pm.claimRefund(id);
        assertEq(usdc.balanceOf(alice), 1_000e6);
        assertEq(usdc.balanceOf(bob), 1_000e6);
    }

    function test_timeoutVoid_fromChallenged_afterTimeout() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);
        vm.prank(alice);
        pm.challenge(id);

        vm.warp(resolveAt + pm.RESOLVE_TIMEOUT());
        pm.timeoutVoid(id);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Voided));
    }

    function test_timeoutVoid_revertTooEarly() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        vm.warp(resolveAt + pm.RESOLVE_TIMEOUT() - 1);
        vm.expectRevert(PredictMarket.TooEarly.selector);
        pm.timeoutVoid(id);
    }

    function test_timeoutVoid_revertWrongStatus_proposed() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _propose(id, YES);
        vm.warp(resolveAt + pm.RESOLVE_TIMEOUT());
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.timeoutVoid(id);
    }

    function test_timeoutVoid_revertWrongStatus_resolved() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);
        _finalize(id);
        vm.warp(resolveAt + pm.RESOLVE_TIMEOUT());
        vm.expectRevert(PredictMarket.WrongStatus.selector);
        pm.timeoutVoid(id);
    }

    // ── views ────────────────────────────────────────────────────────────────
    function test_poolInfo() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 10e6);
        _bet(id, NO, bob, 30e6);
        (uint256 sidePool, uint256 pot) = pm.poolInfo(id, YES);
        assertEq(sidePool, 10e6);
        assertEq(pot, 40e6);
    }

    function test_resultOf() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, BET);
        _bet(id, NO, bob, BET);
        _propose(id, YES);
        _finalize(id);
        (PredictMarket.Status status, uint8 outcome) = pm.resultOf(id);
        assertEq(uint8(status), uint8(PredictMarket.Status.Resolved));
        assertEq(outcome, YES);
    }

    function test_getMarket_nonexistent() public view {
        PredictMarket.Market memory m = pm.getMarket(999);
        assertEq(m.definitionHash, bytes32(0));
        assertEq(m.outcomeCount, 0);
        assertEq(uint8(m.status), uint8(PredictMarket.Status.Pending));
    }

    // ── enum order ─────────────────────────────────────────────────────────────
    function test_statusEnum_order() public pure {
        assertEq(uint8(PredictMarket.Status.Pending), 0);
        assertEq(uint8(PredictMarket.Status.Proposed), 1);
        assertEq(uint8(PredictMarket.Status.Challenged), 2);
        assertEq(uint8(PredictMarket.Status.Resolved), 3);
        assertEq(uint8(PredictMarket.Status.Voided), 4);
    }

    // ── reentrancy on claim ────────────────────────────────────────────────────
    function test_claim_reentrancyBlocked() public {
        HookERC20 hook = new HookERC20();
        PredictMarket hookPm = new PredictMarket(address(hook), resolver, owner);
        ReentrantClaimer attacker = new ReentrantClaimer(address(hookPm));

        hook.mint(address(attacker), 100e6);
        hook.mint(alice, 100e6);
        attacker.approve(address(hook));
        vm.prank(alice);
        hook.approve(address(hookPm), type(uint256).max);

        vm.prank(owner);
        uint256 id = hookPm.createMarket(DEF, resolveAt, 2);

        attacker.bet(id, YES, BET);          // attacker on winning side
        vm.prank(alice);
        hookPm.deposit(id, NO, BET);         // loser funds the pot

        vm.warp(resolveAt);
        vm.prank(resolver);
        hookPm.proposeOutcome(id, YES, EV);
        vm.warp(resolveAt + hookPm.CHALLENGE_WINDOW() + 1);
        hookPm.finalize(id);

        attacker.arm(id);
        attacker.doClaim(id);

        assertTrue(attacker.reentrancyBlocked());
        assertEq(hook.balanceOf(address(attacker)), 100e6 + BET); // paid exactly once
        assertTrue(hookPm.claimed(id, address(attacker)));
    }

    // ── full flows ─────────────────────────────────────────────────────────────
    function test_fullFlow_threeWay_resolveClaim() public {
        uint256 id = _market(3);
        _bet(id, HOME, alice, 40e6);
        _bet(id, AWAY, bob, 30e6);
        _bet(id, DRAW, carol, 30e6);
        _propose(id, HOME);
        _finalize(id);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pm.claim(id); // sole HOME staker → whole pot 100
        assertEq(usdc.balanceOf(alice), aliceBefore + 100e6);

        vm.prank(bob);
        vm.expectRevert(PredictMarket.NothingToClaim.selector);
        pm.claim(id);
    }

    function test_fullFlow_challengeThenOwnerResolve() public {
        uint256 id = _market(2);
        _bet(id, YES, alice, 20e6);
        _bet(id, NO, bob, 20e6);
        _propose(id, NO);

        vm.prank(alice);
        pm.challenge(id);
        assertEq(uint8(pm.getMarket(id).status), uint8(PredictMarket.Status.Challenged));

        vm.prank(owner);
        pm.resolveChallenge(id, YES, EV); // owner overturns to YES

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pm.claim(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + 40e6);
    }
}
