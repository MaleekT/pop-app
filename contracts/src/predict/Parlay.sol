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

    uint256 public constant ODDS_SCALE = 1e6;   // 1.000000x

    // No single leg may be worth more than this, however lopsided its pool looks.
    // A curated market is seeded with only 1 USDC a side, so one modest bet can swing a pool ratio
    // to 7x or beyond. At that size the ratio is noise, not a probability. Worse, it is cheap to
    // move on purpose: a parlay pays from the HOUSE, while the manipulator's own market stake comes
    // back to them out of the pot. Clamping the leg is what stops a thin pool minting a monster
    // multiplier. Raise it only once pools are deep enough for their ratios to mean something.
    uint256 public constant MAX_LEG_ODDS = 2_500_000; // 2.5x

    uint256 public constant MIN_LEGS = 2;
    uint256 public constant MAX_LEGS = 5;

    // The payout cap RISES WITH THE LEG COUNT, so the headline multiplier is only reachable across a
    // full five-leg ticket. A big number on two legs means a pool was thin, not that the bet was
    // genuinely long; a big number on five means five separate calls all came in.
    // MAX_MULTIPLIER is the five-leg cap, and therefore the absolute ceiling.
    uint256 public constant MAX_MULTIPLIER = 15 * ODDS_SCALE;
    uint256 public constant CAP_2_LEGS = 4 * ODDS_SCALE;
    uint256 public constant CAP_3_LEGS = 7 * ODDS_SCALE;
    uint256 public constant CAP_4_LEGS = 11 * ODDS_SCALE;

    // The house pays 90% of the mathematically fair product, keeping a 10% edge so a modest house
    // pool stays solvent while a parlay is still worth playing.
    uint256 public constant HOUSE_MARGIN_NUM = 90;
    uint256 public constant HOUSE_MARGIN_DEN = 100;

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
    error MarketNotPriced();

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

    // The multiplier ceiling for a ticket of `legs` legs. buyTicket bounds the input to
    // [MIN_LEGS, MAX_LEGS], so the final branch is the five-leg case.
    function capForLegs(uint256 legs) public pure returns (uint256) {
        if (legs <= 2) return CAP_2_LEGS;
        if (legs == 3) return CAP_3_LEGS;
        if (legs == 4) return CAP_4_LEGS;
        return MAX_MULTIPLIER;
    }

    // Folds each leg's live parimutuel odds into a combined multiplier, cuts the house margin off
    // the fair product, then applies the leg-count cap.
    function quote(Leg[] calldata picks) public view returns (uint256 multiplier) {
        uint256 acc = ODDS_SCALE;
        for (uint256 i; i < picks.length; ++i) {
            // poolInfo returns the UNSPONSORED ratio (side pool vs sum of pools), so prize
            // sponsorship on a market never inflates a parlay leg, which the house (not the
            // market pot) would have to cover.
            (uint256 sidePool, uint256 pools) = market.poolInfo(picks[i].marketId, picks[i].outcome);

            // An empty pool has no odds to quote. The old code read `sidePool == 0` as "maximum
            // odds", so an UNSEEDED market priced its leg at the cap: a real ticket was offered at
            // 15x on what was actually a coin flip, payable by the house. Refuse to price it.
            if (sidePool == 0 || pools == 0) revert MarketNotPriced();

            uint256 legOdds = (pools * ODDS_SCALE) / sidePool;
            // Floor: a leg can never REDUCE the payout. sidePool <= pools always, so this is
            // defensive rather than load-bearing.
            if (legOdds < ODDS_SCALE) legOdds = ODDS_SCALE;
            // Ceiling: see MAX_LEG_ODDS. This is the change that actually stops a thin or
            // manipulated pool from minting a monster multiplier.
            if (legOdds > MAX_LEG_ODDS) legOdds = MAX_LEG_ODDS;
            acc = (acc * legOdds) / ODDS_SCALE;
        }

        acc = (acc * HOUSE_MARGIN_NUM) / HOUSE_MARGIN_DEN;
        // The 1x floor is REQUIRED, not cosmetic: buyTicket and settle both compute
        // `reserve = payout - stake` and rely on multiplier >= 1x. Without it the margin could push
        // a low-odds parlay below 1x and that subtraction would underflow.
        if (acc < ODDS_SCALE) acc = ODDS_SCALE;

        uint256 cap = capForLegs(picks.length);
        if (acc > cap) acc = cap;
        return acc;
    }

    function buyTicket(Leg[] calldata picks, uint128 stake) external nonReentrant returns (uint256 id) {
        if (picks.length < MIN_LEGS || picks.length > MAX_LEGS) revert BadLegCount();
        if (stake == 0) revert ZeroStake();

        // Each leg must be a distinct, still-open market with a valid outcome.
        for (uint256 i; i < picks.length; ++i) {
            PredictMarket.Market memory m = market.getMarket(picks[i].marketId);
            if (m.status != PredictMarket.Status.Pending) revert MarketNotOpen();
            // Pending alone is NOT enough. A market whose close time has passed stays Pending until
            // the resolver proposes an outcome, so without this gate a bettor could parlay a match
            // that has ALREADY finished, at odds frozen from before the result was known — and the
            // house, not the market pot, pays parlay wins. Mirrors deposit()'s own resolveAt gate.
            if (block.timestamp >= m.resolveAt) revert MarketNotOpen();
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
