import { describe, it, expect } from 'vitest'
import { houseTopUpAmount } from './house'

const FLOOR = 10_000_000n
const TARGET = 25_000_000n

describe('houseTopUpAmount', () => {
  it('tops up nothing when available is at or above the floor', () => {
    expect(houseTopUpAmount(FLOOR, 100_000_000n, FLOOR, TARGET)).toBe(0n)
    expect(houseTopUpAmount(20_000_000n, 100_000_000n, FLOOR, TARGET)).toBe(0n)
  })

  it('tops back up to target when below the floor and the wallet can cover it', () => {
    expect(houseTopUpAmount(4_000_000n, 100_000_000n, FLOOR, TARGET)).toBe(21_000_000n) // 25 - 4
  })

  it('caps the top-up at the owner wallet balance', () => {
    expect(houseTopUpAmount(4_000_000n, 5_000_000n, FLOOR, TARGET)).toBe(5_000_000n)
  })

  it('returns zero when the wallet is empty', () => {
    expect(houseTopUpAmount(4_000_000n, 0n, FLOOR, TARGET)).toBe(0n)
  })

  it('returns zero if target is somehow at/below available (misconfig)', () => {
    expect(houseTopUpAmount(8_000_000n, 100_000_000n, 10_000_000n, 5_000_000n)).toBe(0n)
  })
})
