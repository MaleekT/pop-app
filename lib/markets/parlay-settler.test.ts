import { describe, it, expect } from 'vitest'
import { allLegsTerminal } from './parlay-settler'
import type { ParlayLeg } from './db.types'

const legs: ParlayLeg[] = [
  { marketOnChainId: '1', outcomeIndex: 0 },
  { marketOnChainId: '2', outcomeIndex: 1 },
]

describe('allLegsTerminal', () => {
  it('is true when every leg market is Resolved or Voided', () => {
    const statuses = new Map([['1', 'Resolved'], ['2', 'Voided']])
    expect(allLegsTerminal(legs, statuses)).toBe(true)
  })

  it('is false when a leg market is still Pending', () => {
    const statuses = new Map([['1', 'Resolved'], ['2', 'Pending']])
    expect(allLegsTerminal(legs, statuses)).toBe(false)
  })

  it('is false when a leg market is Proposed (not yet final)', () => {
    const statuses = new Map([['1', 'Resolved'], ['2', 'Proposed']])
    expect(allLegsTerminal(legs, statuses)).toBe(false)
  })

  it('is false when a leg status is missing from the map', () => {
    const statuses = new Map([['1', 'Resolved']])
    expect(allLegsTerminal(legs, statuses)).toBe(false)
  })

  it('is false for an empty leg list', () => {
    expect(allLegsTerminal([], new Map())).toBe(false)
  })
})
