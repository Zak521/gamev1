import { describe, expect, it } from 'vitest'
import {
  OPPONENT_GOAL_LINE_Z,
  USER_GOAL_LINE_Z,
  ballOnFromZ,
  defensiveSpotZ,
  describeSpot,
  formatClock,
  losZ,
  ordinal,
} from './gameMath.ts'

describe('field-position helpers', () => {
  it('converts every yard line to world space and back', () => {
    for (let yard = 0; yard <= 100; yard += 1) {
      expect(ballOnFromZ(losZ(yard))).toBe(yard)
    }
  })

  it('clamps positions beyond either goal line', () => {
    expect(ballOnFromZ(USER_GOAL_LINE_Z + 25)).toBe(0)
    expect(ballOnFromZ(OPPONENT_GOAL_LINE_Z - 25)).toBe(100)
  })

  it('places defensive possessions from the opponent goal line', () => {
    expect(defensiveSpotZ(0)).toBe(OPPONENT_GOAL_LINE_Z)
    expect(defensiveSpotZ(20)).toBe(-72)
  })
})

describe('display helpers', () => {
  it('formats down ordinals and field spots', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(describeSpot(20)).toBe('OWN 20')
    expect(describeSpot(50)).toBe('MIDFIELD')
    expect(describeSpot(82)).toBe('OPP 18')
  })

  it('rounds the clock up and never shows negative time', () => {
    expect(formatClock(120)).toBe('2:00')
    expect(formatClock(59.01)).toBe('1:00')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-1)).toBe('0:00')
  })
})
