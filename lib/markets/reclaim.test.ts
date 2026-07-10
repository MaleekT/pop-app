import { describe, it, expect } from 'vitest'
import { reclaimAction } from './reclaim'

describe('reclaimAction', () => {
  it('skips when the owner has already claimed', () => {
    expect(reclaimAction({ status: 'Resolved', alreadyClaimed: true, winningStake: 5n, totalStake: 5n })).toBe('skip')
  })

  it('claims a resolved market where the owner backed the winning outcome', () => {
    expect(reclaimAction({ status: 'Resolved', alreadyClaimed: false, winningStake: 1_000_000n, totalStake: 2_000_000n })).toBe('claim')
  })

  it('skips a resolved market where the owner has no winning stake', () => {
    expect(reclaimAction({ status: 'Resolved', alreadyClaimed: false, winningStake: 0n, totalStake: 2_000_000n })).toBe('skip')
  })

  it('refunds a voided market where the owner has any stake', () => {
    expect(reclaimAction({ status: 'Voided', alreadyClaimed: false, winningStake: 0n, totalStake: 3_000_000n })).toBe('refund')
  })

  it('skips a voided market with no owner stake', () => {
    expect(reclaimAction({ status: 'Voided', alreadyClaimed: false, winningStake: 0n, totalStake: 0n })).toBe('skip')
  })

  it('skips non-terminal statuses', () => {
    expect(reclaimAction({ status: 'Pending', alreadyClaimed: false, winningStake: 5n, totalStake: 5n })).toBe('skip')
  })
})
