import { describe, expect, it } from 'vitest'
import {
  addPoints,
  clockExpiryForQuarter,
  downAndDistanceText,
  kickIsGood,
  kickSuccessChance,
  opponentYardAfterTurnover,
} from './gameRules.ts'

describe('down and possession rules', () => {
  it('formats ordinary distance and goal-to-go correctly', () => {
    expect(downAndDistanceText(1, 20, 30)).toBe('1st & 10')
    expect(downAndDistanceText(3, 98, 100)).toBe('3rd & Goal')
    expect(downAndDistanceText(4, 45, 45)).toBe('4th & 1')
  })

  it('flips the field on a turnover', () => {
    expect(opponentYardAfterTurnover(20)).toBe(80)
    expect(opponentYardAfterTurnover(50)).toBe(50)
    expect(opponentYardAfterTurnover(99)).toBe(1)
  })
})

describe('scoring and clock rules', () => {
  it('adds every scoring value without changing the opposing score', () => {
    expect(addPoints(14, 6)).toBe(20)
    expect(addPoints(14, 3)).toBe(17)
    expect(addPoints(14, 2)).toBe(16)
    expect(addPoints(14, 1)).toBe(15)
  })

  it('chooses the right action when each period expires', () => {
    expect(clockExpiryForQuarter(1)).toBe('nextQuarter')
    expect(clockExpiryForQuarter(2)).toBe('halftime')
    expect(clockExpiryForQuarter(3)).toBe('nextQuarter')
    expect(clockExpiryForQuarter(4)).toBe('endGame')
    expect(clockExpiryForQuarter(5)).toBe('endGame')
  })
})

describe('kick outcome rules', () => {
  it('makes accurate short kicks more likely than long or mistimed kicks', () => {
    expect(kickSuccessChance('fieldGoal', 30, 54)).toBeGreaterThan(kickSuccessChance('fieldGoal', 55, 54))
    expect(kickSuccessChance('fieldGoal', 30, 54)).toBeGreaterThan(kickSuccessChance('fieldGoal', 30, 0))
    expect(kickSuccessChance('extraPoint', 33, 54)).toBeCloseTo(0.99)
  })

  it('uses the chance as a strict outcome boundary', () => {
    expect(kickIsGood(0.7, 0.699)).toBe(true)
    expect(kickIsGood(0.7, 0.7)).toBe(false)
  })
})
