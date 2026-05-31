// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Pop is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable USDC;
    address public immutable resolver;          // the agent wallet; set at deploy; immutable
    uint256 public constant CHALLENGE_WINDOW = 1 hours;
    uint256 public constant RESOLUTION_TIMEOUT = 30 days;
    uint256 public constant MIN_CLAIM_TO_RESOLVE_GAP = 2 hours;

    enum Status { Pending, Locked, Proposed, Resolved, Disputed, Cancelled, Expired, Open, Voided }

    struct Bet {
        address creator;
        address opponent;
        uint128 stake;               // USDC, 6 decimals
        uint64  joinDeadline;        // accept-by
        uint64  resolveAt;           // earliest the resolver may propose
        uint64  acceptedAt;
        uint64  proposedAt;          // when proposeResolution fired
        bytes32 definitionHash;      // keccak256(toHex(canonical definition string))
        bytes32 evidenceHash;        // set by resolver at proposal
        address proposedWinner;      // set by resolver; must be creator or opponent
        address creatorVote;         // dispute fallback
        address opponentVote;        // dispute fallback
        Status  status;
    }

    uint256 public nextId;
    mapping(uint256 => Bet) public bets;

    event BetCreated(uint256 indexed id, address indexed creator, address indexed opponent, uint128 stake, uint64 joinDeadline, uint64 resolveAt, bytes32 definitionHash);
    event BetAccepted(uint256 indexed id);
    event BetDeclined(uint256 indexed id);
    event BetCancelled(uint256 indexed id);
    event ResolutionProposed(uint256 indexed id, address indexed proposedWinner, bytes32 evidenceHash);
    event BetChallenged(uint256 indexed id, address indexed by);
    event VoteCast(uint256 indexed id, address indexed voter, address pickedWinner);
    event BetResolved(uint256 indexed id, address indexed winner, uint128 pot);
    event BetExpired(uint256 indexed id);
    event OpenBetPosted(uint256 indexed id, address indexed creator, uint128 stake, uint64 claimDeadline, uint64 resolveAt, bytes32 definitionHash);
    event OpenBetClaimed(uint256 indexed id, address indexed claimant);
    event BetVoided(uint256 indexed id, bytes32 evidenceHash);

    error NotParticipant();
    error NotResolver();
    error WrongStatus();
    error PastDeadline();
    error TooEarly();
    error WindowClosed();
    error WindowOpen();
    error InvalidWinner();
    error AlreadyVoted();
    error SeatTaken();
    error ClaimWindowClosed();
    error GapTooShort();
    error NotOpen();

    constructor(address _usdc, address _resolver) {
        require(_usdc != address(0) && _resolver != address(0), "zero addr");
        USDC = IERC20(_usdc);
        resolver = _resolver;
    }

    function createBet(address opponent, uint128 stake, bytes32 definitionHash, uint64 joinDeadline, uint64 resolveAt)
        external nonReentrant returns (uint256 id)
    {
        require(opponent != address(0) && opponent != msg.sender, "bad opponent");
        require(stake > 0, "bad stake");
        require(joinDeadline > block.timestamp && resolveAt > joinDeadline, "bad timing");
        id = ++nextId;
        Bet storage b = bets[id];
        b.creator = msg.sender;
        b.opponent = opponent;
        b.stake = stake;
        b.joinDeadline = joinDeadline;
        b.resolveAt = resolveAt;
        b.definitionHash = definitionHash;
        b.status = Status.Pending;
        USDC.safeTransferFrom(msg.sender, address(this), stake);
        emit BetCreated(id, msg.sender, opponent, stake, joinDeadline, resolveAt, definitionHash);
    }

    function acceptBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (msg.sender != b.opponent) revert NotParticipant();
        if (b.status != Status.Pending) revert WrongStatus();
        if (block.timestamp >= b.joinDeadline) revert PastDeadline();
        b.status = Status.Locked;
        b.acceptedAt = uint64(block.timestamp);
        USDC.safeTransferFrom(msg.sender, address(this), b.stake);
        emit BetAccepted(id);
    }

    function declineBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (msg.sender != b.opponent) revert NotParticipant();
        if (b.status != Status.Pending) revert WrongStatus();
        b.status = Status.Cancelled;
        USDC.safeTransfer(b.creator, b.stake);
        emit BetDeclined(id);
    }

    function cancelBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (msg.sender != b.creator) revert NotParticipant();
        if (b.status != Status.Pending && b.status != Status.Open) revert WrongStatus();
        b.status = Status.Cancelled;
        USDC.safeTransfer(b.creator, b.stake);
        emit BetCancelled(id);
    }

    // ONLY the resolver. winner MUST be a participant. This is the core safety property.
    function proposeResolution(uint256 id, address winner, bytes32 evidenceHash) external nonReentrant {
        Bet storage b = bets[id];
        if (msg.sender != resolver) revert NotResolver();
        if (b.status != Status.Locked) revert WrongStatus();
        if (block.timestamp < b.resolveAt) revert TooEarly();
        if (winner != b.creator && winner != b.opponent) revert InvalidWinner();
        b.status = Status.Proposed;
        b.proposedAt = uint64(block.timestamp);
        b.proposedWinner = winner;
        b.evidenceHash = evidenceHash;
        emit ResolutionProposed(id, winner, evidenceHash);
    }

    function challenge(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (msg.sender != b.creator && msg.sender != b.opponent) revert NotParticipant();
        if (b.status != Status.Proposed) revert WrongStatus();
        if (block.timestamp > b.proposedAt + CHALLENGE_WINDOW) revert WindowClosed();
        b.status = Status.Disputed;
        emit BetChallenged(id, msg.sender);
    }

    function finalize(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (b.status != Status.Proposed) revert WrongStatus();
        if (block.timestamp <= b.proposedAt + CHALLENGE_WINDOW) revert WindowOpen();
        address winner = b.proposedWinner;
        // Upcast to uint256 before doubling to prevent uint128 overflow revert on large stakes.
        uint128 pot = uint128(uint256(b.stake) * 2);
        b.status = Status.Resolved;
        USDC.safeTransfer(winner, pot);
        emit BetResolved(id, winner, pot);
    }

    function voteWinner(uint256 id, address pickedWinner) external nonReentrant {
        Bet storage b = bets[id];
        if (b.status != Status.Disputed) revert WrongStatus();
        // Votes are no longer valid once the resolution timeout has elapsed; use claimExpired instead.
        if (block.timestamp >= b.acceptedAt + RESOLUTION_TIMEOUT) revert TooEarly();
        // pickedWinner must be a real participant — rules out address(0) implicitly, but checked explicitly below.
        if (pickedWinner == address(0)) revert InvalidWinner();
        if (pickedWinner != b.creator && pickedWinner != b.opponent) revert InvalidWinner();
        if (msg.sender == b.creator) {
            if (b.creatorVote != address(0)) revert AlreadyVoted();
            b.creatorVote = pickedWinner;
        } else if (msg.sender == b.opponent) {
            if (b.opponentVote != address(0)) revert AlreadyVoted();
            b.opponentVote = pickedWinner;
        } else revert NotParticipant();
        emit VoteCast(id, msg.sender, pickedWinner);
        if (b.creatorVote != address(0) && b.opponentVote != address(0) && b.creatorVote == b.opponentVote) {
            address winner = b.creatorVote;
            // Upcast to uint256 before doubling to prevent uint128 overflow revert on large stakes.
            uint128 pot = uint128(uint256(b.stake) * 2);
            b.status = Status.Resolved;
            USDC.safeTransfer(winner, pot);
            emit BetResolved(id, winner, pot);
        }
    }

    function claimExpired(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (b.status == Status.Pending) {
            if (block.timestamp < b.joinDeadline) revert TooEarly();
            b.status = Status.Expired;
            USDC.safeTransfer(b.creator, b.stake);
            emit BetExpired(id);
            return;
        }
        if (b.status == Status.Open) {
            if (block.timestamp < b.joinDeadline) revert TooEarly();
            b.status = Status.Expired;
            USDC.safeTransfer(b.creator, b.stake);
            emit BetExpired(id);
            return;
        }
        if (b.status == Status.Disputed) {
            if (block.timestamp < b.acceptedAt + RESOLUTION_TIMEOUT) revert TooEarly();
            b.status = Status.Expired;
            USDC.safeTransfer(b.creator, b.stake);
            USDC.safeTransfer(b.opponent, b.stake);
            emit BetExpired(id);
            return;
        }
        if (b.status == Status.Locked) {
            if (block.timestamp < b.acceptedAt + RESOLUTION_TIMEOUT) revert TooEarly();
            b.status = Status.Expired;
            USDC.safeTransfer(b.creator, b.stake);
            USDC.safeTransfer(b.opponent, b.stake);
            emit BetExpired(id);
            return;
        }
        revert WrongStatus();
    }

    function createOpenBet(
        uint128 stake,
        bytes32 definitionHash,
        uint64 claimDeadline,
        uint64 resolveAt
    ) external nonReentrant returns (uint256 id) {
        if (stake == 0) revert();
        if (claimDeadline <= block.timestamp) revert PastDeadline();
        if (resolveAt <= claimDeadline) revert();
        if (resolveAt < claimDeadline + MIN_CLAIM_TO_RESOLVE_GAP) revert GapTooShort();
        id = ++nextId;
        Bet storage b = bets[id];
        b.creator = msg.sender;
        b.opponent = address(0);
        b.stake = stake;
        b.joinDeadline = claimDeadline;
        b.resolveAt = resolveAt;
        b.definitionHash = definitionHash;
        b.status = Status.Open;
        USDC.safeTransferFrom(msg.sender, address(this), stake);
        emit OpenBetPosted(id, msg.sender, stake, claimDeadline, resolveAt, definitionHash);
    }

    function claimOpenBet(uint256 id) external nonReentrant {
        Bet storage b = bets[id];
        if (b.status != Status.Open) revert SeatTaken();
        if (block.timestamp >= b.joinDeadline) revert ClaimWindowClosed();
        if (msg.sender == b.creator) revert NotParticipant();
        // Order matters: flip state BEFORE pulling funds so a second concurrent claim cannot
        // fund a bet that is already moving to Locked, and a reverted pull cannot orphan a
        // half-claimed bet.
        b.opponent = msg.sender;
        b.acceptedAt = uint64(block.timestamp);
        b.status = Status.Locked;
        USDC.safeTransferFrom(msg.sender, address(this), b.stake);
        emit OpenBetClaimed(id, msg.sender);
        emit BetAccepted(id);
    }

    function voidBet(uint256 id, bytes32 evidenceHash) external nonReentrant {
        Bet storage b = bets[id];
        if (msg.sender != resolver) revert NotResolver();
        if (b.status != Status.Locked && b.status != Status.Proposed) revert WrongStatus();
        if (b.opponent == address(0)) revert NotParticipant();
        b.status = Status.Voided;
        b.evidenceHash = evidenceHash;
        USDC.safeTransfer(b.creator, b.stake);
        USDC.safeTransfer(b.opponent, b.stake);
        emit BetVoided(id, evidenceHash);
    }

    function getBet(uint256 id) external view returns (Bet memory) { return bets[id]; }
}
