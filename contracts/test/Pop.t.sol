// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { Pop } from "../src/Pop.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ---------------------------------------------------------------------------
// Mock 6-decimal USDC
// ---------------------------------------------------------------------------
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ---------------------------------------------------------------------------
// Reentrancy attacker for finalize
// ---------------------------------------------------------------------------
contract ReentrantFinalize {
    Pop public pop;
    uint256 public betId;
    uint8 public calls;

    constructor(address _pop) { pop = Pop(_pop); }

    function setBetId(uint256 id) external { betId = id; }

    // ERC-20 transfer hook — called when USDC is sent to this contract
    function onERC20Received() external {
        if (calls < 2) {
            calls++;
            try pop.finalize(betId) {} catch {}
        }
    }
}

// ---------------------------------------------------------------------------
// ERC20 that fires onTokenReceived on the recipient — for reentrancy tests
// ---------------------------------------------------------------------------
interface ITokenReceiver {
    function onTokenReceived() external;
}

contract HookERC20 is ERC20 {
    constructor() ERC20("Hook Token", "HTK") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external { _mint(to, amount); }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool result = super.transfer(to, amount);
        if (to.code.length > 0) {
            try ITokenReceiver(to).onTokenReceived() {} catch {}
        }
        return result;
    }
}

// Recipient that attempts to re-enter voidBet when tokens arrive
contract ReentrantVoidReceiver is ITokenReceiver {
    Pop public immutable pop;
    uint256 public betId;
    bool public armed;
    bool public reentrancyBlocked;

    constructor(address _pop) { pop = Pop(_pop); }

    function setup(uint256 id) external { betId = id; armed = true; }

    function onTokenReceived() external override {
        if (armed) {
            armed = false;
            try pop.voidBet(betId, bytes32(0)) {
                // should never get here
            } catch {
                reentrancyBlocked = true;
            }
        }
    }

    function approvePop(address token) external {
        IERC20(token).approve(address(pop), type(uint256).max);
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract PopTest is Test {
    MockUSDC usdc;
    Pop pop;

    address resolver  = makeAddr("resolver");
    address creator   = makeAddr("creator");
    address opponent  = makeAddr("opponent");
    address stranger  = makeAddr("stranger");
    address claimant  = makeAddr("claimant");
    address claimant2 = makeAddr("claimant2");

    uint128 constant STAKE = 10e6; // 10 USDC
    uint256 constant NOW   = 1_000_000;

    // Convenience time offsets
    uint64 joinDeadline;
    uint64 resolveAt;
    uint64 claimDeadline;   // open-bet claim window
    uint64 resolveAtOpen;   // open-bet resolve time (>= claimDeadline + 24h)

    function setUp() public {
        vm.warp(NOW);
        usdc = new MockUSDC();
        pop  = new Pop(address(usdc), resolver);

        // Fund and approve
        usdc.mint(creator,   100e6);
        usdc.mint(opponent,  100e6);
        usdc.mint(claimant,  100e6);
        usdc.mint(claimant2, 100e6);

        vm.prank(creator);
        usdc.approve(address(pop), type(uint256).max);
        vm.prank(opponent);
        usdc.approve(address(pop), type(uint256).max);
        vm.prank(claimant);
        usdc.approve(address(pop), type(uint256).max);
        vm.prank(claimant2);
        usdc.approve(address(pop), type(uint256).max);

        joinDeadline  = uint64(NOW + 1 days);
        resolveAt     = uint64(NOW + 7 days);
        claimDeadline = uint64(NOW + 3 days);
        resolveAtOpen = uint64(NOW + 7 days); // 4-day gap > 24h
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function _createBet() internal returns (uint256 id) {
        bytes32 defHash = keccak256("BTC > $100k by NYE");
        vm.prank(creator);
        id = pop.createBet(opponent, STAKE, defHash, joinDeadline, resolveAt);
    }

    function _createAndAccept() internal returns (uint256 id) {
        id = _createBet();
        vm.prank(opponent);
        pop.acceptBet(id);
    }

    function _createAcceptPropose(address winner) internal returns (uint256 id) {
        id = _createAndAccept();
        vm.warp(resolveAt);
        bytes32 evHash = keccak256("evidence");
        vm.prank(resolver);
        pop.proposeResolution(id, winner, evHash);
    }

    function _createOpenBet() internal returns (uint256 id) {
        bytes32 defHash = keccak256("BTC over $100k by end of month");
        vm.prank(creator);
        id = pop.createOpenBet(STAKE, defHash, claimDeadline, resolveAtOpen);
    }

    function _createAndClaimOpen() internal returns (uint256 id) {
        id = _createOpenBet();
        vm.prank(claimant);
        pop.claimOpenBet(id);
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------
    function test_constructor_setsImmutables() public view {
        assertEq(address(pop.USDC()), address(usdc));
        assertEq(pop.resolver(), resolver);
        assertEq(pop.CHALLENGE_WINDOW(), 1 hours);
        assertEq(pop.RESOLUTION_TIMEOUT(), 30 days);
    }

    function test_constructor_revertZeroUsdc() public {
        vm.expectRevert("zero addr");
        new Pop(address(0), resolver);
    }

    function test_constructor_revertZeroResolver() public {
        vm.expectRevert("zero addr");
        new Pop(address(usdc), address(0));
    }

    // -----------------------------------------------------------------------
    // createBet
    // -----------------------------------------------------------------------
    function test_createBet_happyPath() public {
        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 id = _createBet();
        assertEq(id, 1);
        assertEq(pop.nextId(), 1);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(b.creator,  creator);
        assertEq(b.opponent, opponent);
        assertEq(b.stake,    STAKE);
        assertEq(b.joinDeadline, joinDeadline);
        assertEq(b.resolveAt,    resolveAt);
        assertEq(uint8(b.status), uint8(Pop.Status.Pending));

        assertEq(usdc.balanceOf(creator), creatorBefore - STAKE);
        assertEq(usdc.balanceOf(address(pop)), STAKE);
    }

    function test_createBet_emitsEvent() public {
        bytes32 defHash = keccak256("BTC > $100k by NYE");
        vm.expectEmit(true, true, true, true);
        emit Pop.BetCreated(1, creator, opponent, STAKE, joinDeadline, resolveAt, defHash);
        vm.prank(creator);
        pop.createBet(opponent, STAKE, defHash, joinDeadline, resolveAt);
    }

    function test_createBet_incrementsId() public {
        assertEq(_createBet(), 1);
        assertEq(_createBet(), 2);
        assertEq(_createBet(), 3);
    }

    function test_createBet_revertZeroOpponent() public {
        vm.prank(creator);
        vm.expectRevert("bad opponent");
        pop.createBet(address(0), STAKE, bytes32(0), joinDeadline, resolveAt);
    }

    function test_createBet_revertSelfOpponent() public {
        vm.prank(creator);
        vm.expectRevert("bad opponent");
        pop.createBet(creator, STAKE, bytes32(0), joinDeadline, resolveAt);
    }

    function test_createBet_revertZeroStake() public {
        vm.prank(creator);
        vm.expectRevert("bad stake");
        pop.createBet(opponent, 0, bytes32(0), joinDeadline, resolveAt);
    }

    function test_createBet_revertJoinDeadlineNotFuture() public {
        vm.prank(creator);
        vm.expectRevert("bad timing");
        pop.createBet(opponent, STAKE, bytes32(0), uint64(NOW), resolveAt);
    }

    function test_createBet_revertResolveAtNotAfterJoin() public {
        vm.prank(creator);
        vm.expectRevert("bad timing");
        pop.createBet(opponent, STAKE, bytes32(0), joinDeadline, joinDeadline);
    }

    // -----------------------------------------------------------------------
    // acceptBet
    // -----------------------------------------------------------------------
    function test_acceptBet_happyPath() public {
        uint256 id = _createBet();
        uint256 opponentBefore = usdc.balanceOf(opponent);

        vm.expectEmit(true, false, false, false);
        emit Pop.BetAccepted(id);
        vm.prank(opponent);
        pop.acceptBet(id);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(uint8(b.status), uint8(Pop.Status.Locked));
        assertEq(b.acceptedAt, uint64(NOW));
        assertEq(usdc.balanceOf(opponent), opponentBefore - STAKE);
        assertEq(usdc.balanceOf(address(pop)), STAKE * 2);
    }

    function test_acceptBet_revertNotOpponent() public {
        uint256 id = _createBet();
        vm.prank(stranger);
        vm.expectRevert(Pop.NotParticipant.selector);
        pop.acceptBet(id);
    }

    function test_acceptBet_revertWrongStatus() public {
        uint256 id = _createBet();
        vm.prank(opponent);
        pop.acceptBet(id);
        vm.prank(opponent);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.acceptBet(id);
    }

    function test_acceptBet_revertPastDeadline() public {
        uint256 id = _createBet();
        vm.warp(joinDeadline);
        vm.prank(opponent);
        vm.expectRevert(Pop.PastDeadline.selector);
        pop.acceptBet(id);
    }

    // -----------------------------------------------------------------------
    // declineBet
    // -----------------------------------------------------------------------
    function test_declineBet_refundsCreator() public {
        uint256 id = _createBet();
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.expectEmit(true, false, false, false);
        emit Pop.BetDeclined(id);
        vm.prank(opponent);
        pop.declineBet(id);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(uint8(b.status), uint8(Pop.Status.Cancelled));
        assertEq(usdc.balanceOf(creator), creatorBefore + STAKE);
        assertEq(usdc.balanceOf(address(pop)), 0);
    }

    function test_declineBet_revertNotOpponent() public {
        uint256 id = _createBet();
        vm.prank(stranger);
        vm.expectRevert(Pop.NotParticipant.selector);
        pop.declineBet(id);
    }

    function test_declineBet_revertWrongStatus() public {
        uint256 id = _createAndAccept();
        vm.prank(opponent);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.declineBet(id);
    }

    // -----------------------------------------------------------------------
    // cancelBet
    // -----------------------------------------------------------------------
    function test_cancelBet_refundsCreator() public {
        uint256 id = _createBet();
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.expectEmit(true, false, false, false);
        emit Pop.BetCancelled(id);
        vm.prank(creator);
        pop.cancelBet(id);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(uint8(b.status), uint8(Pop.Status.Cancelled));
        assertEq(usdc.balanceOf(creator), creatorBefore + STAKE);
    }

    function test_cancelBet_revertNotCreator() public {
        uint256 id = _createBet();
        vm.prank(opponent);
        vm.expectRevert(Pop.NotParticipant.selector);
        pop.cancelBet(id);
    }

    function test_cancelBet_revertWrongStatus() public {
        uint256 id = _createAndAccept();
        vm.prank(creator);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.cancelBet(id);
    }

    // -----------------------------------------------------------------------
    // proposeResolution — core safety property
    // -----------------------------------------------------------------------
    function test_proposeResolution_creatorWins() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        bytes32 evHash = keccak256("ev");

        vm.expectEmit(true, true, false, true);
        emit Pop.ResolutionProposed(id, creator, evHash);
        vm.prank(resolver);
        pop.proposeResolution(id, creator, evHash);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(uint8(b.status), uint8(Pop.Status.Proposed));
        assertEq(b.proposedWinner, creator);
        assertEq(b.evidenceHash,   evHash);
        assertEq(b.proposedAt,     uint64(resolveAt));
    }

    function test_proposeResolution_opponentWins() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        vm.prank(resolver);
        pop.proposeResolution(id, opponent, keccak256("ev"));
        assertEq(pop.getBet(id).proposedWinner, opponent);
    }

    // SAFETY PROPERTY 1: only resolver may call
    function test_proposeResolution_revertNotResolver() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        vm.prank(stranger);
        vm.expectRevert(Pop.NotResolver.selector);
        pop.proposeResolution(id, creator, bytes32(0));
    }

    function test_proposeResolution_revertCreatorCannotResolve() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        vm.prank(creator);
        vm.expectRevert(Pop.NotResolver.selector);
        pop.proposeResolution(id, creator, bytes32(0));
    }

    function test_proposeResolution_revertOpponentCannotResolve() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        vm.prank(opponent);
        vm.expectRevert(Pop.NotResolver.selector);
        pop.proposeResolution(id, opponent, bytes32(0));
    }

    // SAFETY PROPERTY 2: winner must be a participant
    function test_proposeResolution_revertThirdAddressWinner() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        vm.prank(resolver);
        vm.expectRevert(Pop.InvalidWinner.selector);
        pop.proposeResolution(id, stranger, bytes32(0));
    }

    function test_proposeResolution_revertAddressZeroWinner() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        vm.prank(resolver);
        vm.expectRevert(Pop.InvalidWinner.selector);
        pop.proposeResolution(id, address(0), bytes32(0));
    }

    function test_proposeResolution_revertWrongStatus() public {
        uint256 id = _createBet(); // still Pending
        vm.warp(resolveAt);
        vm.prank(resolver);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.proposeResolution(id, creator, bytes32(0));
    }

    function test_proposeResolution_revertTooEarly() public {
        uint256 id = _createAndAccept();
        vm.warp(resolveAt - 1);
        vm.prank(resolver);
        vm.expectRevert(Pop.TooEarly.selector);
        pop.proposeResolution(id, creator, bytes32(0));
    }

    // -----------------------------------------------------------------------
    // challenge
    // -----------------------------------------------------------------------
    function test_challenge_byCreator() public {
        uint256 id = _createAcceptPropose(creator);

        vm.expectEmit(true, true, false, false);
        emit Pop.BetChallenged(id, creator);
        vm.prank(creator);
        pop.challenge(id);

        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Disputed));
    }

    function test_challenge_byOpponent() public {
        uint256 id = _createAcceptPropose(creator);
        vm.prank(opponent);
        pop.challenge(id);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Disputed));
    }

    function test_challenge_revertNotParticipant() public {
        uint256 id = _createAcceptPropose(creator);
        vm.prank(stranger);
        vm.expectRevert(Pop.NotParticipant.selector);
        pop.challenge(id);
    }

    function test_challenge_revertWrongStatus() public {
        uint256 id = _createAndAccept();
        vm.prank(creator);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.challenge(id);
    }

    function test_challenge_revertWindowClosed() public {
        uint256 id = _createAcceptPropose(creator);
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);
        vm.prank(creator);
        vm.expectRevert(Pop.WindowClosed.selector);
        pop.challenge(id);
    }

    function test_challenge_exactlyAtWindowEnd_stillOpen() public {
        uint256 id = _createAcceptPropose(creator);
        // at proposedAt + CHALLENGE_WINDOW the window is still open (>)
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW());
        vm.prank(creator);
        pop.challenge(id); // should NOT revert
    }

    // -----------------------------------------------------------------------
    // finalize
    // -----------------------------------------------------------------------
    function test_finalize_paysWinnerCreator() public {
        uint256 id = _createAcceptPropose(creator);
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);

        uint256 creatorBefore = usdc.balanceOf(creator);
        vm.expectEmit(true, true, false, true);
        emit Pop.BetResolved(id, creator, STAKE * 2);
        pop.finalize(id);

        assertEq(usdc.balanceOf(creator), creatorBefore + STAKE * 2);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Resolved));
    }

    function test_finalize_paysWinnerOpponent() public {
        uint256 id = _createAcceptPropose(opponent);
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);

        uint256 opponentBefore = usdc.balanceOf(opponent);
        pop.finalize(id);
        assertEq(usdc.balanceOf(opponent), opponentBefore + STAKE * 2);
    }

    function test_finalize_revertWrongStatus() public {
        uint256 id = _createAndAccept();
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.finalize(id);
    }

    function test_finalize_revertWindowStillOpen() public {
        uint256 id = _createAcceptPropose(creator);
        // exactly at proposedAt + CHALLENGE_WINDOW — still open
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW());
        vm.expectRevert(Pop.WindowOpen.selector);
        pop.finalize(id);
    }

    function test_finalize_revertWindowJustOpen() public {
        uint256 id = _createAcceptPropose(creator);
        vm.warp(resolveAt); // well within window
        vm.expectRevert(Pop.WindowOpen.selector);
        pop.finalize(id);
    }

    function test_finalize_anyoneCanCall() public {
        uint256 id = _createAcceptPropose(creator);
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);
        vm.prank(stranger); // not a participant
        pop.finalize(id);   // should succeed
    }

    // -----------------------------------------------------------------------
    // voteWinner — dispute resolution
    // -----------------------------------------------------------------------
    function _setupDisputed() internal returns (uint256 id) {
        id = _createAcceptPropose(creator);
        vm.prank(creator);
        pop.challenge(id);
    }

    function test_vote_bothAgree_creatorWins() public {
        uint256 id = _setupDisputed();
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.prank(creator);
        pop.voteWinner(id, creator);
        vm.prank(opponent);

        vm.expectEmit(true, true, false, true);
        emit Pop.BetResolved(id, creator, STAKE * 2);
        pop.voteWinner(id, creator);

        assertEq(usdc.balanceOf(creator), creatorBefore + STAKE * 2);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Resolved));
    }

    function test_vote_bothAgree_opponentWins() public {
        uint256 id = _setupDisputed();
        uint256 opponentBefore = usdc.balanceOf(opponent);

        vm.prank(creator);
        pop.voteWinner(id, opponent);
        vm.prank(opponent);
        pop.voteWinner(id, opponent);

        assertEq(usdc.balanceOf(opponent), opponentBefore + STAKE * 2);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Resolved));
    }

    function test_vote_disagree_remainsDisputed() public {
        uint256 id = _setupDisputed();

        vm.prank(creator);
        pop.voteWinner(id, creator);

        vm.expectEmit(true, true, false, true);
        emit Pop.VoteCast(id, opponent, opponent);
        vm.prank(opponent);
        pop.voteWinner(id, opponent); // disagree — no resolution yet

        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Disputed));
    }

    function test_vote_emitsVoteCast() public {
        uint256 id = _setupDisputed();
        vm.expectEmit(true, true, false, true);
        emit Pop.VoteCast(id, creator, creator);
        vm.prank(creator);
        pop.voteWinner(id, creator);
    }

    function test_vote_revertWrongStatus() public {
        uint256 id = _createAndAccept(); // Locked
        vm.prank(creator);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.voteWinner(id, creator);
    }

    function test_vote_revertNotParticipant() public {
        uint256 id = _setupDisputed();
        vm.prank(stranger);
        vm.expectRevert(Pop.NotParticipant.selector);
        pop.voteWinner(id, creator);
    }

    function test_vote_revertInvalidWinner_zero() public {
        uint256 id = _setupDisputed();
        vm.prank(creator);
        vm.expectRevert(Pop.InvalidWinner.selector);
        pop.voteWinner(id, address(0));
    }

    function test_vote_revertInvalidWinner_third() public {
        uint256 id = _setupDisputed();
        vm.prank(creator);
        vm.expectRevert(Pop.InvalidWinner.selector);
        pop.voteWinner(id, stranger);
    }

    function test_vote_revertAlreadyVoted_creator() public {
        uint256 id = _setupDisputed();
        vm.prank(creator);
        pop.voteWinner(id, creator);
        vm.prank(creator);
        vm.expectRevert(Pop.AlreadyVoted.selector);
        pop.voteWinner(id, creator);
    }

    function test_vote_revertAlreadyVoted_opponent() public {
        uint256 id = _setupDisputed();
        vm.prank(opponent);
        pop.voteWinner(id, opponent);
        vm.prank(opponent);
        vm.expectRevert(Pop.AlreadyVoted.selector);
        pop.voteWinner(id, opponent);
    }

    function test_vote_revertAfterResolutionTimeout() public {
        uint256 id = _setupDisputed();
        Pop.Bet memory b = pop.getBet(id);
        vm.warp(b.acceptedAt + pop.RESOLUTION_TIMEOUT());
        vm.prank(creator);
        vm.expectRevert(Pop.TooEarly.selector);
        pop.voteWinner(id, creator);
    }

    // -----------------------------------------------------------------------
    // claimExpired
    // -----------------------------------------------------------------------
    function test_claimExpired_pendingBet_refundsCreator() public {
        uint256 id = _createBet();
        vm.warp(joinDeadline + 1);
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.expectEmit(true, false, false, false);
        emit Pop.BetExpired(id);
        pop.claimExpired(id);

        assertEq(usdc.balanceOf(creator), creatorBefore + STAKE);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Expired));
    }

    function test_claimExpired_pendingBet_revertTooEarly() public {
        uint256 id = _createBet();
        vm.warp(joinDeadline - 1);
        vm.expectRevert(Pop.TooEarly.selector);
        pop.claimExpired(id);
    }

    function test_claimExpired_lockedBet_refundsBoth() public {
        uint256 id = _createAndAccept();
        Pop.Bet memory b = pop.getBet(id);
        vm.warp(b.acceptedAt + pop.RESOLUTION_TIMEOUT() + 1);

        uint256 creatorBefore  = usdc.balanceOf(creator);
        uint256 opponentBefore = usdc.balanceOf(opponent);

        vm.expectEmit(true, false, false, false);
        emit Pop.BetExpired(id);
        pop.claimExpired(id);

        assertEq(usdc.balanceOf(creator),  creatorBefore  + STAKE);
        assertEq(usdc.balanceOf(opponent), opponentBefore + STAKE);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Expired));
    }

    function test_claimExpired_lockedBet_revertTooEarly() public {
        uint256 id = _createAndAccept();
        Pop.Bet memory b = pop.getBet(id);
        vm.warp(b.acceptedAt + pop.RESOLUTION_TIMEOUT() - 1);
        vm.expectRevert(Pop.TooEarly.selector);
        pop.claimExpired(id);
    }

    function test_claimExpired_disputedBet_refundsBoth() public {
        uint256 id = _setupDisputed();
        Pop.Bet memory b = pop.getBet(id);
        vm.warp(b.acceptedAt + pop.RESOLUTION_TIMEOUT() + 1);

        uint256 creatorBefore  = usdc.balanceOf(creator);
        uint256 opponentBefore = usdc.balanceOf(opponent);

        pop.claimExpired(id);

        assertEq(usdc.balanceOf(creator),  creatorBefore  + STAKE);
        assertEq(usdc.balanceOf(opponent), opponentBefore + STAKE);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Expired));
    }

    function test_claimExpired_disputedBet_revertTooEarly() public {
        uint256 id = _setupDisputed();
        Pop.Bet memory b = pop.getBet(id);
        vm.warp(b.acceptedAt + pop.RESOLUTION_TIMEOUT() - 1);
        vm.expectRevert(Pop.TooEarly.selector);
        pop.claimExpired(id);
    }

    function test_claimExpired_revertWrongStatus_resolved() public {
        uint256 id = _createAcceptPropose(creator);
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);
        pop.finalize(id);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.claimExpired(id);
    }

    function test_claimExpired_revertWrongStatus_cancelled() public {
        uint256 id = _createBet();
        vm.prank(creator);
        pop.cancelBet(id);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.claimExpired(id);
    }

    function test_claimExpired_revertWrongStatus_proposed() public {
        uint256 id = _createAcceptPropose(creator);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.claimExpired(id);
    }

    // -----------------------------------------------------------------------
    // Full happy-path flow
    // -----------------------------------------------------------------------
    function test_fullFlow_createAcceptProposeFinalize() public {
        uint256 id = _createBet();
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Pending));

        vm.prank(opponent);
        pop.acceptBet(id);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Locked));

        vm.warp(resolveAt);
        vm.prank(resolver);
        pop.proposeResolution(id, creator, keccak256("proof"));
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Proposed));

        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);
        uint256 winnerBalance = usdc.balanceOf(creator);
        pop.finalize(id);

        assertEq(usdc.balanceOf(creator), winnerBalance + STAKE * 2);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Resolved));
    }

    function test_fullFlow_disputeAgree() public {
        uint256 id = _createAcceptPropose(creator);

        vm.prank(opponent);
        pop.challenge(id);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Disputed));

        uint256 winnerBalance = usdc.balanceOf(creator);
        vm.prank(creator);
        pop.voteWinner(id, creator);
        vm.prank(opponent);
        pop.voteWinner(id, creator);

        assertEq(usdc.balanceOf(creator), winnerBalance + STAKE * 2);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Resolved));
    }

    function test_fullFlow_disputeDisagreeThenExpire() public {
        uint256 id = _setupDisputed();
        Pop.Bet memory b = pop.getBet(id);

        vm.prank(creator);
        pop.voteWinner(id, creator);
        vm.prank(opponent);
        pop.voteWinner(id, opponent);
        // Disagree — still disputed

        vm.warp(b.acceptedAt + pop.RESOLUTION_TIMEOUT() + 1);

        uint256 creatorBefore  = usdc.balanceOf(creator);
        uint256 opponentBefore = usdc.balanceOf(opponent);
        pop.claimExpired(id);

        assertEq(usdc.balanceOf(creator),  creatorBefore  + STAKE);
        assertEq(usdc.balanceOf(opponent), opponentBefore + STAKE);
    }

    // -----------------------------------------------------------------------
    // Overflow safety: max uint128 stake
    // -----------------------------------------------------------------------
    function test_finalize_maxStakeNoOverflow() public {
        uint128 bigStake = type(uint128).max / 2;
        usdc.mint(creator,  bigStake);
        usdc.mint(opponent, bigStake);

        bytes32 defHash = keccak256("max stake bet");
        vm.prank(creator);
        uint256 id = pop.createBet(opponent, bigStake, defHash, joinDeadline, resolveAt);

        vm.prank(opponent);
        pop.acceptBet(id);

        vm.warp(resolveAt);
        vm.prank(resolver);
        pop.proposeResolution(id, creator, keccak256("ev"));

        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);
        uint256 creatorBefore = usdc.balanceOf(creator);
        pop.finalize(id);

        assertEq(usdc.balanceOf(creator), creatorBefore + uint256(bigStake) * 2);
    }

    // -----------------------------------------------------------------------
    // getBet view
    // -----------------------------------------------------------------------
    function test_getBet_returnsZeroForNonexistent() public view {
        Pop.Bet memory b = pop.getBet(999);
        assertEq(b.creator,  address(0));
        assertEq(b.stake,    0);
        assertEq(uint8(b.status), 0); // Pending default
    }

    // -----------------------------------------------------------------------
    // createOpenBet
    // -----------------------------------------------------------------------
    function test_createOpenBet_happyPath() public {
        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 id = _createOpenBet();
        assertEq(id, 1);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(b.creator,      creator);
        assertEq(b.opponent,     address(0));
        assertEq(b.stake,        STAKE);
        assertEq(b.joinDeadline, claimDeadline);
        assertEq(b.resolveAt,    resolveAtOpen);
        assertEq(uint8(b.status), uint8(Pop.Status.Open));

        assertEq(usdc.balanceOf(creator),      creatorBefore - STAKE);
        assertEq(usdc.balanceOf(address(pop)), STAKE);
    }

    function test_createOpenBet_emitsEvent() public {
        bytes32 defHash = keccak256("BTC over $100k by end of month");
        vm.expectEmit(true, true, false, true);
        emit Pop.OpenBetPosted(1, creator, STAKE, claimDeadline, resolveAtOpen, defHash);
        vm.prank(creator);
        pop.createOpenBet(STAKE, defHash, claimDeadline, resolveAtOpen);
    }

    function test_createOpenBet_revertGapTooShort() public {
        // resolveAt exactly at claimDeadline + 24h - 1 → GapTooShort
        uint64 tightResolve = claimDeadline + uint64(pop.MIN_CLAIM_TO_RESOLVE_GAP()) - 1;
        vm.prank(creator);
        vm.expectRevert(Pop.GapTooShort.selector);
        pop.createOpenBet(STAKE, bytes32(0), claimDeadline, tightResolve);
    }

    function test_createOpenBet_gapExactly24h_succeeds() public {
        uint64 exactResolve = claimDeadline + uint64(pop.MIN_CLAIM_TO_RESOLVE_GAP());
        vm.prank(creator);
        uint256 id = pop.createOpenBet(STAKE, bytes32(0), claimDeadline, exactResolve);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Open));
    }

    function test_createOpenBet_revertZeroStake() public {
        vm.prank(creator);
        vm.expectRevert();
        pop.createOpenBet(0, bytes32(0), claimDeadline, resolveAtOpen);
    }

    function test_createOpenBet_revertClaimDeadlinePast() public {
        vm.prank(creator);
        vm.expectRevert(Pop.PastDeadline.selector);
        pop.createOpenBet(STAKE, bytes32(0), uint64(NOW), resolveAtOpen);
    }

    function test_createOpenBet_revertBadTiming() public {
        // resolveAt <= claimDeadline
        vm.prank(creator);
        vm.expectRevert();
        pop.createOpenBet(STAKE, bytes32(0), claimDeadline, claimDeadline);
    }

    // -----------------------------------------------------------------------
    // claimOpenBet
    // -----------------------------------------------------------------------
    function test_claimOpenBet_happyPath() public {
        uint256 id = _createOpenBet();
        uint256 claimantBefore = usdc.balanceOf(claimant);

        vm.expectEmit(true, true, false, false);
        emit Pop.OpenBetClaimed(id, claimant);
        vm.expectEmit(true, false, false, false);
        emit Pop.BetAccepted(id);
        vm.prank(claimant);
        pop.claimOpenBet(id);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(uint8(b.status), uint8(Pop.Status.Locked));
        assertEq(b.opponent,      claimant);
        assertEq(b.acceptedAt,    uint64(NOW));
        assertEq(usdc.balanceOf(claimant),      claimantBefore - STAKE);
        assertEq(usdc.balanceOf(address(pop)),  STAKE * 2);
    }

    function test_claimOpenBet_revertSelfClaim() public {
        uint256 id = _createOpenBet();
        vm.prank(creator);
        vm.expectRevert(Pop.NotParticipant.selector);
        pop.claimOpenBet(id);
    }

    function test_claimOpenBet_revertClaimWindowClosed() public {
        uint256 id = _createOpenBet();
        vm.warp(claimDeadline);
        vm.prank(claimant);
        vm.expectRevert(Pop.ClaimWindowClosed.selector);
        pop.claimOpenBet(id);
    }

    function test_claimOpenBet_revertSeatTaken_secondClaim() public {
        uint256 id = _createAndClaimOpen(); // claimant takes it
        vm.prank(claimant2);
        vm.expectRevert(Pop.SeatTaken.selector);
        pop.claimOpenBet(id);
    }

    // -----------------------------------------------------------------------
    // First-claim-wins race test (mandatory)
    // -----------------------------------------------------------------------
    function test_claimOpenBet_race_firstClaimWins() public {
        uint256 id = _createOpenBet();

        uint256 claimantBefore  = usdc.balanceOf(claimant);
        uint256 claimant2Before = usdc.balanceOf(claimant2);

        // claimant wins the race
        vm.prank(claimant);
        pop.claimOpenBet(id);

        // claimant2 loses — same block (no warp), should revert SeatTaken
        vm.prank(claimant2);
        vm.expectRevert(Pop.SeatTaken.selector);
        pop.claimOpenBet(id);

        // claimant2 USDC balance unchanged — zero moved on revert
        assertEq(usdc.balanceOf(claimant2), claimant2Before);

        // exactly one opponent recorded
        assertEq(pop.getBet(id).opponent, claimant);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Locked));

        // claimant paid exactly one stake
        assertEq(usdc.balanceOf(claimant), claimantBefore - STAKE);

        // third attempt also reverts SeatTaken
        vm.prank(stranger);
        vm.expectRevert(Pop.SeatTaken.selector);
        pop.claimOpenBet(id);
    }

    // -----------------------------------------------------------------------
    // cancelBet on Open bet
    // -----------------------------------------------------------------------
    function test_cancelBet_openBet_refundsCreator() public {
        uint256 id = _createOpenBet();
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.expectEmit(true, false, false, false);
        emit Pop.BetCancelled(id);
        vm.prank(creator);
        pop.cancelBet(id);

        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Cancelled));
        assertEq(usdc.balanceOf(creator), creatorBefore + STAKE);
        assertEq(usdc.balanceOf(address(pop)), 0);
    }

    function test_cancelBet_openBet_revertNotCreator() public {
        uint256 id = _createOpenBet();
        vm.prank(claimant);
        vm.expectRevert(Pop.NotParticipant.selector);
        pop.cancelBet(id);
    }

    // -----------------------------------------------------------------------
    // claimExpired on Open bet
    // -----------------------------------------------------------------------
    function test_claimExpired_openBet_refundsCreator() public {
        uint256 id = _createOpenBet();
        vm.warp(claimDeadline + 1);
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.expectEmit(true, false, false, false);
        emit Pop.BetExpired(id);
        pop.claimExpired(id);

        assertEq(usdc.balanceOf(creator), creatorBefore + STAKE);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Expired));
    }

    function test_claimExpired_openBet_revertTooEarly() public {
        uint256 id = _createOpenBet();
        vm.warp(claimDeadline - 1);
        vm.expectRevert(Pop.TooEarly.selector);
        pop.claimExpired(id);
    }

    // -----------------------------------------------------------------------
    // voidBet
    // -----------------------------------------------------------------------
    function test_voidBet_fromLocked() public {
        uint256 id = _createAndClaimOpen();
        uint256 creatorBefore  = usdc.balanceOf(creator);
        uint256 claimantBefore = usdc.balanceOf(claimant);
        bytes32 evHash = keccak256("game postponed");

        vm.expectEmit(true, false, false, true);
        emit Pop.BetVoided(id, evHash);
        vm.prank(resolver);
        pop.voidBet(id, evHash);

        Pop.Bet memory b = pop.getBet(id);
        assertEq(uint8(b.status),    uint8(Pop.Status.Voided));
        assertEq(b.evidenceHash,     evHash);
        assertEq(usdc.balanceOf(creator),      creatorBefore  + STAKE);
        assertEq(usdc.balanceOf(claimant),     claimantBefore + STAKE);
        assertEq(usdc.balanceOf(address(pop)), 0);
    }

    function test_voidBet_fromProposed() public {
        // Create a friend bet, accept, propose, then void
        uint256 id = _createAndAccept();
        vm.warp(resolveAt);
        vm.prank(resolver);
        pop.proposeResolution(id, creator, keccak256("ev"));
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Proposed));

        uint256 creatorBefore   = usdc.balanceOf(creator);
        uint256 opponentBefore  = usdc.balanceOf(opponent);

        vm.prank(resolver);
        pop.voidBet(id, keccak256("match cancelled"));

        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Voided));
        assertEq(usdc.balanceOf(creator),  creatorBefore  + STAKE);
        assertEq(usdc.balanceOf(opponent), opponentBefore + STAKE);
    }

    function test_voidBet_revertNotResolver() public {
        uint256 id = _createAndClaimOpen();
        vm.prank(stranger);
        vm.expectRevert(Pop.NotResolver.selector);
        pop.voidBet(id, bytes32(0));
    }

    function test_voidBet_revertWrongStatus_pending() public {
        uint256 id = _createBet();
        vm.prank(resolver);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.voidBet(id, bytes32(0));
    }

    function test_voidBet_revertWrongStatus_open() public {
        uint256 id = _createOpenBet();
        vm.prank(resolver);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.voidBet(id, bytes32(0));
    }

    function test_voidBet_revertWrongStatus_resolved() public {
        uint256 id = _createAcceptPropose(creator);
        vm.warp(resolveAt + pop.CHALLENGE_WINDOW() + 1);
        pop.finalize(id);
        vm.prank(resolver);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.voidBet(id, bytes32(0));
    }

    function test_voidBet_revertWrongStatus_disputed() public {
        uint256 id = _createAcceptPropose(creator);
        vm.prank(creator);
        pop.challenge(id);
        vm.prank(resolver);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.voidBet(id, bytes32(0));
    }

    function test_voidBet_revertWrongStatus_cancelled() public {
        uint256 id = _createBet();
        vm.prank(creator);
        pop.cancelBet(id);
        vm.prank(resolver);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.voidBet(id, bytes32(0));
    }

    function test_voidBet_revertWrongStatus_expired() public {
        uint256 id = _createBet();
        vm.warp(joinDeadline + 1);
        pop.claimExpired(id);
        vm.prank(resolver);
        vm.expectRevert(Pop.WrongStatus.selector);
        pop.voidBet(id, bytes32(0));
    }

    // -----------------------------------------------------------------------
    // voidBet reentrancy — malicious token fires callback on transfer
    // -----------------------------------------------------------------------
    function test_voidBet_reentrancyBlocked() public {
        HookERC20 hookToken = new HookERC20();
        Pop hookPop = new Pop(address(hookToken), resolver);

        // Deploy a receiver-as-creator that will attempt re-entry when it gets tokens back
        ReentrantVoidReceiver malCreator = new ReentrantVoidReceiver(address(hookPop));

        // Fund both participants
        hookToken.mint(address(malCreator), 100e6);
        hookToken.mint(claimant, 100e6);
        malCreator.approvePop(address(hookToken));
        vm.prank(claimant);
        hookToken.approve(address(hookPop), type(uint256).max);

        // malCreator posts the open bet (creator)
        bytes32 defHash = keccak256("reentrant test");
        vm.prank(address(malCreator));
        uint256 id = hookPop.createOpenBet(STAKE, defHash, claimDeadline, resolveAtOpen);

        // claimant claims it
        vm.prank(claimant);
        hookPop.claimOpenBet(id);

        // Arm the receiver for the reentrancy attempt
        malCreator.setup(id);

        // resolver calls voidBet — triggers callback on transfer to malCreator
        vm.prank(resolver);
        hookPop.voidBet(id, keccak256("postponed"));

        // Reentrancy was attempted and blocked
        bool reentrancyWasBlocked = malCreator.reentrancyBlocked();
        require(reentrancyWasBlocked, "reentrancy guard did not fire");
        // Both refunds landed correctly
        assertEq(hookToken.balanceOf(address(malCreator)), 100e6); // got stake back
        assertEq(hookToken.balanceOf(claimant), 100e6);            // got stake back
        assertEq(uint8(hookPop.getBet(id).status), uint8(Pop.Status.Voided));
    }

    // -----------------------------------------------------------------------
    // voidBet safety property — no arbitrary recipient
    // -----------------------------------------------------------------------
    function test_voidBet_onlyRefundsParticipants() public {
        uint256 id = _createAndClaimOpen();

        // Record stranger balance — must stay unchanged
        uint256 strangerBefore = usdc.balanceOf(stranger);

        vm.prank(resolver);
        pop.voidBet(id, bytes32(0));

        // Stranger received nothing
        assertEq(usdc.balanceOf(stranger), strangerBefore);
        // Contract drained to exactly zero
        assertEq(usdc.balanceOf(address(pop)), 0);
    }

    // -----------------------------------------------------------------------
    // Status enum order verification
    // -----------------------------------------------------------------------
    function test_statusEnum_order() public pure {
        assertEq(uint8(Pop.Status.Pending),   0);
        assertEq(uint8(Pop.Status.Locked),    1);
        assertEq(uint8(Pop.Status.Proposed),  2);
        assertEq(uint8(Pop.Status.Resolved),  3);
        assertEq(uint8(Pop.Status.Disputed),  4);
        assertEq(uint8(Pop.Status.Cancelled), 5);
        assertEq(uint8(Pop.Status.Expired),   6);
        assertEq(uint8(Pop.Status.Open),      7);
        assertEq(uint8(Pop.Status.Voided),    8);
    }

    // -----------------------------------------------------------------------
    // Full open-bet happy-path flow
    // -----------------------------------------------------------------------
    function test_fullFlow_openBet_createClaimResolveFinalize() public {
        uint256 id = _createOpenBet();
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Open));

        vm.prank(claimant);
        pop.claimOpenBet(id);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Locked));
        assertEq(pop.getBet(id).opponent,      claimant);

        vm.warp(resolveAtOpen);
        vm.prank(resolver);
        pop.proposeResolution(id, creator, keccak256("proof"));
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Proposed));

        vm.warp(resolveAtOpen + pop.CHALLENGE_WINDOW() + 1);
        uint256 winnerBalance = usdc.balanceOf(creator);
        pop.finalize(id);

        assertEq(usdc.balanceOf(creator), winnerBalance + STAKE * 2);
        assertEq(uint8(pop.getBet(id).status), uint8(Pop.Status.Resolved));
    }
}
