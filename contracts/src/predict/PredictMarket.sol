// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

// Pooled (parimutuel) prediction markets for POP's Predict section.
// Additive to Pop.sol: separate contract, separate deploy, shares only the resolver EOA.
// The pot pays itself, so there is no house money and no solvency risk. Payouts are
// pull-based (each winner calls claim) because a market can have many participants.
contract PredictMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable USDC;
    address public immutable resolver;   // automated agent: proposes and voids outcomes
    address public immutable owner;      // curates markets and arbitrates challenges

    uint256 public constant CHALLENGE_WINDOW = 1 hours;
    uint256 public constant RESOLVE_TIMEOUT = 30 days;
    uint8   public constant MAX_OUTCOMES = 3;

    enum Status { Pending, Proposed, Challenged, Resolved, Voided }

    struct Market {
        bytes32 definitionHash;   // keccak256(toHex(canonical definition string))
        uint64  resolveAt;        // betting closes and the resolver may propose from here
        uint64  proposedAt;       // when proposeOutcome fired
        uint8   outcomeCount;     // 2..MAX_OUTCOMES
        uint8   resolvedOutcome;  // winning index, valid once Resolved
        Status  status;
        bytes32 evidenceHash;     // set by resolver/owner at proposal or void
    }

    uint256 public nextId;
    mapping(uint256 => Market) public markets;

    mapping(uint256 => mapping(uint8 => uint256)) public pool;      // id => outcome => total staked
    mapping(uint256 => uint256) public totalPot;                    // id => sum of all pools
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public staked; // id => outcome => user
    mapping(uint256 => mapping(address => bool)) public claimed;    // id => user => claimed or refunded

    event MarketCreated(uint256 indexed id, bytes32 definitionHash, uint64 resolveAt, uint8 outcomeCount);
    event Deposited(uint256 indexed id, address indexed user, uint8 indexed outcome, uint256 amount);
    event OutcomeProposed(uint256 indexed id, uint8 indexed outcome, bytes32 evidenceHash);
    event MarketChallenged(uint256 indexed id, address indexed by);
    event MarketResolved(uint256 indexed id, uint8 indexed outcome);
    event MarketVoided(uint256 indexed id, bytes32 evidenceHash);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);
    event Refunded(uint256 indexed id, address indexed user, uint256 amount);

    error NotOwner();
    error NotResolver();
    error NotAuthorized();
    error WrongStatus();
    error TooEarly();
    error BettingClosed();
    error BadOutcome();
    error BadOutcomeCount();
    error BadTiming();
    error ZeroAmount();
    error WindowClosed();
    error WindowOpen();
    error NotParticipant();
    error AlreadyClaimed();
    error NothingToClaim();

    constructor(address _usdc, address _resolver, address _owner) {
        require(_usdc != address(0) && _resolver != address(0) && _owner != address(0), "zero addr");
        USDC = IERC20(_usdc);
        resolver = _resolver;
        owner = _owner;
    }

    // ── Market lifecycle ───────────────────────────────────────────────────────

    function createMarket(bytes32 definitionHash, uint64 resolveAt, uint8 outcomeCount)
        external
        returns (uint256 id)
    {
        if (msg.sender != owner) revert NotOwner();
        if (outcomeCount < 2 || outcomeCount > MAX_OUTCOMES) revert BadOutcomeCount();
        if (resolveAt <= block.timestamp) revert BadTiming();

        id = ++nextId;
        Market storage m = markets[id];
        m.definitionHash = definitionHash;
        m.resolveAt = resolveAt;
        m.outcomeCount = outcomeCount;
        m.status = Status.Pending;

        emit MarketCreated(id, definitionHash, resolveAt, outcomeCount);
    }

    function deposit(uint256 id, uint8 outcome, uint128 amount) external nonReentrant {
        Market storage m = markets[id];
        if (m.status != Status.Pending) revert WrongStatus();
        if (block.timestamp >= m.resolveAt) revert BettingClosed();
        if (outcome >= m.outcomeCount) revert BadOutcome();
        if (amount == 0) revert ZeroAmount();

        pool[id][outcome] += amount;
        totalPot[id] += amount;
        staked[id][outcome][msg.sender] += amount;

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(id, msg.sender, outcome, amount);
    }

    // ── Resolution ─────────────────────────────────────────────────────────────

    function proposeOutcome(uint256 id, uint8 outcome, bytes32 evidenceHash) external {
        if (msg.sender != resolver) revert NotResolver();
        Market storage m = markets[id];
        if (m.status != Status.Pending) revert WrongStatus();
        if (block.timestamp < m.resolveAt) revert TooEarly();
        if (outcome >= m.outcomeCount) revert BadOutcome();

        m.status = Status.Proposed;
        m.proposedAt = uint64(block.timestamp);
        m.resolvedOutcome = outcome;
        m.evidenceHash = evidenceHash;

        emit OutcomeProposed(id, outcome, evidenceHash);
    }

    function challenge(uint256 id) external {
        Market storage m = markets[id];
        if (m.status != Status.Proposed) revert WrongStatus();
        if (block.timestamp > m.proposedAt + CHALLENGE_WINDOW) revert WindowClosed();
        if (!_hasStake(id, msg.sender, m.outcomeCount)) revert NotParticipant();

        m.status = Status.Challenged;
        emit MarketChallenged(id, msg.sender);
    }

    function finalize(uint256 id) external {
        Market storage m = markets[id];
        if (m.status != Status.Proposed) revert WrongStatus();
        if (block.timestamp <= m.proposedAt + CHALLENGE_WINDOW) revert WindowOpen();
        _settle(id, m, m.resolvedOutcome);
    }

    // Owner arbitration for a challenged market: sets the final outcome directly.
    function resolveChallenge(uint256 id, uint8 outcome, bytes32 evidenceHash) external {
        if (msg.sender != owner) revert NotOwner();
        Market storage m = markets[id];
        if (m.status != Status.Challenged) revert WrongStatus();
        if (outcome >= m.outcomeCount) revert BadOutcome();

        m.evidenceHash = evidenceHash;
        _settle(id, m, outcome);
    }

    function voidMarket(uint256 id, bytes32 evidenceHash) external {
        if (msg.sender != resolver && msg.sender != owner) revert NotAuthorized();
        Market storage m = markets[id];
        if (m.status != Status.Pending && m.status != Status.Proposed && m.status != Status.Challenged) {
            revert WrongStatus();
        }
        m.status = Status.Voided;
        m.evidenceHash = evidenceHash;
        emit MarketVoided(id, evidenceHash);
    }

    // Permissionless safety net: if a market is never settled, anyone can void it after
    // RESOLVE_TIMEOUT so participants reclaim their stakes without trusting the resolver
    // or owner to stay alive. Proposed markets are excluded: anyone can already finalize
    // them once the challenge window passes.
    function timeoutVoid(uint256 id) external {
        Market storage m = markets[id];
        if (m.status != Status.Pending && m.status != Status.Challenged) revert WrongStatus();
        if (block.timestamp < m.resolveAt + RESOLVE_TIMEOUT) revert TooEarly();
        m.status = Status.Voided;
        emit MarketVoided(id, m.evidenceHash);
    }

    // ── Payouts (pull-based) ─────────────────────────────────────────────────────

    function claim(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        if (m.status != Status.Resolved) revert WrongStatus();
        if (claimed[id][msg.sender]) revert AlreadyClaimed();

        uint8 win = m.resolvedOutcome;
        uint256 userStake = staked[id][win][msg.sender];
        if (userStake == 0) revert NothingToClaim();

        claimed[id][msg.sender] = true;
        // pool[win] > 0 is guaranteed: _settle only reaches Resolved for a non-empty outcome.
        uint256 payout = Math.mulDiv(userStake, totalPot[id], pool[id][win]);

        USDC.safeTransfer(msg.sender, payout);
        emit Claimed(id, msg.sender, payout);
    }

    function claimRefund(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        if (m.status != Status.Voided) revert WrongStatus();
        if (claimed[id][msg.sender]) revert AlreadyClaimed();

        uint256 refund;
        uint8 count = m.outcomeCount;
        for (uint8 o; o < count; ++o) {
            refund += staked[id][o][msg.sender];
        }
        if (refund == 0) revert NothingToClaim();

        claimed[id][msg.sender] = true;
        USDC.safeTransfer(msg.sender, refund);
        emit Refunded(id, msg.sender, refund);
    }

    // ── Views (used by Parlay and the frontend) ──────────────────────────────────

    function poolInfo(uint256 id, uint8 outcome) external view returns (uint256 sidePool, uint256 pot) {
        return (pool[id][outcome], totalPot[id]);
    }

    function resultOf(uint256 id) external view returns (Status status, uint8 resolvedOutcome) {
        Market storage m = markets[id];
        return (m.status, m.resolvedOutcome);
    }

    function getMarket(uint256 id) external view returns (Market memory) {
        return markets[id];
    }

    // ── Internal ─────────────────────────────────────────────────────────────────

    // Resolves to `outcome`, or voids if nobody backed it (no fair way to split the pot).
    function _settle(uint256 id, Market storage m, uint8 outcome) private {
        if (pool[id][outcome] == 0) {
            m.status = Status.Voided;
            emit MarketVoided(id, m.evidenceHash);
        } else {
            m.resolvedOutcome = outcome;
            m.status = Status.Resolved;
            emit MarketResolved(id, outcome);
        }
    }

    function _hasStake(uint256 id, address user, uint8 outcomeCount) private view returns (bool) {
        for (uint8 o; o < outcomeCount; ++o) {
            if (staked[id][o][user] > 0) return true;
        }
        return false;
    }
}
