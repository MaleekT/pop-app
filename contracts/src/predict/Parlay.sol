// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { PredictMarket } from "./PredictMarket.sol";

// Parlay tickets over PredictMarket outcomes: one stake, 2+ legs, all-or-nothing.
// The multiplier is folded from each leg's live parimutuel odds at purchase, capped,
// and locked onto the ticket. Wins pay from an owner-seeded house pool; solvency is
// guaranteed by reserving each ticket's marginal house liability (payout - stake) at
// purchase, which keeps houseBalance >= totalReserved through every settle branch.
contract Parlay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20        public immutable USDC;
    PredictMarket public immutable market;
    address       public immutable owner;

    uint256 public constant ODDS_SCALE = 1e6;                 // 1.000000x
    uint256 public constant MAX_MULTIPLIER = 50 * ODDS_SCALE;  // payout cap
    uint256 public constant MIN_LEGS = 2;
    uint256 public constant MAX_LEGS = 10;

    enum Status { Open, Won, Lost, Refunded }

    struct Leg {
        uint256 marketId;
        uint8   outcome;
    }

    struct Ticket {
        address bettor;
        uint128 stake;
        uint256 lockedMultiplier;   // scaled by ODDS_SCALE
        Status  status;
    }

    uint256 public nextId;
    uint256 public houseBalance;    // owner-seeded; absorbs losing stakes, pays wins
    uint256 public totalReserved;   // sum of open tickets' house liability
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => Leg[]) private _legs;

    event HouseFunded(uint256 amount, uint256 houseBalance);
    event TicketBought(uint256 indexed id, address indexed bettor, uint128 stake, uint256 multiplier, uint256 legs);
    event TicketSettled(uint256 indexed id, Status status, uint256 payout);

    error NotOwner();
    error BadLegCount();
    error DuplicateMarket();
    error MarketNotOpen();
    error BadOutcome();
    error ZeroStake();
    error InsufficientHouse();
    error WrongStatus();
    error LegNotTerminal();

    constructor(address _usdc, address _market, address _owner) {
        require(_usdc != address(0) && _market != address(0) && _owner != address(0), "zero addr");
        USDC = IERC20(_usdc);
        market = PredictMarket(_market);
        owner = _owner;
    }

    function fundHouse(uint128 amount) external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0) revert ZeroStake();
        houseBalance += amount;
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseFunded(amount, houseBalance);
    }

    function houseAvailable() public view returns (uint256) {
        return houseBalance - totalReserved;
    }

    // Folds each leg's live parimutuel odds into a combined multiplier. Each leg is
    // defensively clamped to [1x, MAX_MULTIPLIER]: the floor guarantees a leg can never
    // reduce the payout (a local invariant, not one we borrow from the market's pool
    // accounting), and the cap also stops the fold overflowing on a near-empty pool. The
    // product is capped again.
    function quote(Leg[] calldata picks) public view returns (uint256 multiplier) {
        uint256 acc = ODDS_SCALE;
        for (uint256 i; i < picks.length; ++i) {
            (uint256 sidePool, uint256 pot) = market.poolInfo(picks[i].marketId, picks[i].outcome);
            uint256 legOdds = sidePool == 0 ? MAX_MULTIPLIER : (pot * ODDS_SCALE) / sidePool;
            if (legOdds < ODDS_SCALE) legOdds = ODDS_SCALE;
            if (legOdds > MAX_MULTIPLIER) legOdds = MAX_MULTIPLIER;
            acc = (acc * legOdds) / ODDS_SCALE;
        }
        if (acc > MAX_MULTIPLIER) acc = MAX_MULTIPLIER;
        return acc;
    }

    function buyTicket(Leg[] calldata picks, uint128 stake) external nonReentrant returns (uint256 id) {
        if (picks.length < MIN_LEGS || picks.length > MAX_LEGS) revert BadLegCount();
        if (stake == 0) revert ZeroStake();

        // Each leg must be a distinct, still-open market with a valid outcome.
        for (uint256 i; i < picks.length; ++i) {
            PredictMarket.Market memory m = market.getMarket(picks[i].marketId);
            if (m.status != PredictMarket.Status.Pending) revert MarketNotOpen();
            if (picks[i].outcome >= m.outcomeCount) revert BadOutcome();
            for (uint256 j = i + 1; j < picks.length; ++j) {
                if (picks[j].marketId == picks[i].marketId) revert DuplicateMarket();
            }
        }

        uint256 multiplier = quote(picks);
        uint256 payout = (uint256(stake) * multiplier) / ODDS_SCALE;
        uint256 reserve = payout - stake;   // multiplier >= 1x, so payout >= stake
        if (houseAvailable() < reserve) revert InsufficientHouse();

        totalReserved += reserve;
        id = ++nextId;
        tickets[id] = Ticket({ bettor: msg.sender, stake: stake, lockedMultiplier: multiplier, status: Status.Open });
        for (uint256 i; i < picks.length; ++i) {
            _legs[id].push(picks[i]);
        }

        USDC.safeTransferFrom(msg.sender, address(this), stake);
        emit TicketBought(id, msg.sender, stake, multiplier, picks.length);
    }

    function settle(uint256 id) external nonReentrant {
        Ticket storage t = tickets[id];
        if (t.status != Status.Open) revert WrongStatus();

        Leg[] storage legs = _legs[id];
        bool anyVoided;
        bool allWon = true;
        for (uint256 i; i < legs.length; ++i) {
            (PredictMarket.Status s, uint8 resolved) = market.resultOf(legs[i].marketId);
            if (s == PredictMarket.Status.Voided) {
                anyVoided = true;
            } else if (s == PredictMarket.Status.Resolved) {
                if (resolved != legs[i].outcome) allWon = false;
            } else {
                revert LegNotTerminal();   // Pending/Proposed/Challenged: not settleable yet
            }
        }

        uint256 payout = (uint256(t.stake) * t.lockedMultiplier) / ODDS_SCALE;
        uint256 reserve = payout - t.stake;
        totalReserved -= reserve;   // release reservation in every branch

        if (anyVoided) {
            t.status = Status.Refunded;
            USDC.safeTransfer(t.bettor, t.stake);
            emit TicketSettled(id, Status.Refunded, t.stake);
        } else if (allWon) {
            t.status = Status.Won;
            houseBalance -= reserve;   // house covers its marginal liability
            USDC.safeTransfer(t.bettor, payout);
            emit TicketSettled(id, Status.Won, payout);
        } else {
            t.status = Status.Lost;
            houseBalance += t.stake;   // forfeited stake to the house
            emit TicketSettled(id, Status.Lost, 0);
        }
    }

    function getLegs(uint256 id) external view returns (Leg[] memory) {
        return _legs[id];
    }
}
