# POP Predict + Parlay — User Journeys

> Reference for content, onboarding copy, and product decisions.
> Grounded in the deployed contracts (PredictMarket + Parlay on Arc testnet), not theory.
> Last updated: 2026-07-07

## The one thing to understand first

Predict has two products with **completely different economics**. This contrast is the core of every explanation and every piece of content.

| | Prediction Market | Parlay |
|---|---|---|
| Who you play against | Other users (peer vs peer) | The house (user vs house) |
| Where a winner's money comes from | The losing side's stakes | Partly your own stake back, partly the house bankroll |
| Does the operator's money move? | Never. The pot pays itself. | Yes. The house pays winners and keeps losers' stakes. |
| Model | Parimutuel pool | Fixed-multiplier ticket, locked at purchase |
| Exit before it ends? | No. Locked until resolution. | No. Locked until every leg settles. |

Plain version: **a market is a pot everyone throws money into and the correct side splits. A parlay is a bet slip you buy from the house at locked odds.**

---

## Persona 1: Market participant

### 1A. The winner

1. Opens `/predict`, connects wallet, browses open markets.
2. Opens a market. Sees the live odds bar: each outcome's share of the pool, which moves in real time as people deposit. A side with more money = lower payout multiple, a side with less = higher.
3. Picks a side, types an amount, taps **Approve & deposit**. Two wallet signatures (approve USDC, then deposit). The money leaves their wallet and sits in the `PredictMarket` contract as escrow.
4. From now on the panel **locks them to that side** ("Add to your Yes position"). They can top up, but cannot accidentally bet against themselves (a footgun in a pooled market).
5. The betting window closes at the market's resolve time.
6. The resolver (an automated job, every 5 minutes) fetches the real answer from CoinGecko / TheSportsDB / YouTube and proposes the outcome on-chain.
7. A 1 hour challenge window passes with no dispute.
8. `finalize` is called (by the cron or anyone), the market flips to **Resolved**.
9. The winner sees a checkmark on their side and a **Claim winnings** button.
10. They claim and receive **their stake's pro-rata share of the ENTIRE pot** (their money plus a cut of the losing side), sent straight to their wallet.

Payout formula: `yourStake × totalPot / winningPool`.

### 1B. The loser

Steps 1 to 8 are identical. At resolution their side has no checkmark and **no claim button appears**. Their stake is gone, forfeited to the winners. No partial refund, no consolation. This is the honest risk of a pooled market: a wrong pick loses the whole stake.

### 1C. The refund case (Voided market, nobody wins or loses)

A market **voids** if any of these happen:
- The winning outcome had zero money on it (no fair way to split).
- A sports fixture was postponed, cancelled, or abandoned.
- Nobody resolved it within 30 days (the `timeoutVoid` safety net).

When voided, **everyone who deposited, on any side, gets back exactly what they put in** via **Claim refund**. Pure no-op aside from gas.

---

## Persona 2: Parlay bettor

A parlay combines 2+ legs across different open markets into one ticket. Every leg must hit. The odds multiply, so a small stake can pay big. This is the edge over Polymarket, which has no native parlay.

### 2A. The winner (every leg hits)

1. Opens the parlay builder, adds 2+ legs from different open markets, picks a side on each.
2. Watches the **combined multiplier** update live as legs are added (the product of each leg's current odds, capped at 50x).
3. Taps **buy**. One approve, one `buyTicket`. The contract:
   - Locks the multiplier at that exact moment (later odds changes do not affect the ticket).
   - Reserves enough of the house bankroll to guarantee the payout if it wins. If the house cannot cover it, the purchase is refused outright. This is the solvency guarantee.
4. Each leg then runs its own full, independent market lifecycle. Legs can settle days apart.
5. Once **every** leg is terminal (Resolved or Voided), anyone can call `settle`.
6. All legs correct: the bettor receives **stake × locked multiplier**. Part of that is their own stake back, part is genuinely the house's money. **This is the only path in the whole system where a user is paid directly from the operator's bankroll.**

### 2B. The loser (any single leg misses)

Steps 1 to 5 are the same. On settle, if even one leg is wrong, the ticket is **Lost**: the bettor gets nothing, and their staked amount is absorbed into the house balance. **This is where the house actually earns.**

### 2C. The refund case (any leg voided)

If any leg's market voids, the whole ticket **refunds the original stake only** (not the multiplier payout), no matter how the other legs went. Void always takes precedence over a loss (checked first). Nobody gains or loses.

---

## Persona 3: You, the Owner / Operator

Today you wear four hats, all on one wallet (`0xA2bB…6ae9`, your deployer = resolver = owner):

1. **Market creator.** The only wallet allowed to list a new market (curated, by design). This is the daily-chore pain point that the autonomous curator (see `predict-auto-curator-spec.md`) is meant to remove.
2. **Arbiter.** If a market is challenged, only you can call `resolveChallenge` to set the final answer.
3. **House banker.** You funded the parlay pool (15 USDC on testnet). That capital is at real risk against winning parlays and grows from losing ones.
4. **Resolver operator.** Because your deployer and resolver keys are the same wallet, your server-side cron is autonomously proposing and finalizing market outcomes around the clock.

---

## Money-flow summary

| Who | Trigger | Outcome | Where the money comes from |
|---|---|---|---|
| Market winner | Picked the resolved outcome | Pro-rata share of the whole pot | The losing side's stakes |
| Market loser | Picked the wrong outcome | Nothing | Stake forfeited to winners |
| Market (voided) | Empty winning pool / postponed / 30-day timeout | Full refund | Their own money back |
| Parlay winner | Every leg correct | stake × locked multiplier | Partly own stake, partly the house |
| Parlay loser | Any leg wrong | Nothing | Stake absorbed into the house |
| Parlay (voided) | Any leg voided | Stake only, refunded | Their own money back |
| Owner / operator | Creates, arbitrates, funds, resolves | Bears parlay bankroll risk; pays gas | Their wallet |

## Where revenue would come from (not built yet)

Neither contract has a fee today. Single markets are zero-margin peer-to-peer. The house only nets money from losing parlay tickets, while carrying the risk of winning ones. Two standard levers exist for later, each a deliberate contract change: a rake percentage skimmed off the pot on claim, and a hold percentage baked into the parlay multiplier. See the memory note / a future monetization spec before touching either.

## Content angles worth using

- "You are not betting against the house, you are betting against everyone else." (markets)
- "The one bet where the house actually pays you." (parlay win)
- "Nobody loses when a game gets cancelled." (void refund)
- "Locked odds: the price you see is the price you get." (parlay purchase)
- The four-hats operator story (how the thing runs itself day to day).
