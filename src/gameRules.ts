import { ordinal } from './gameMath.ts'

export type ClockExpiry = 'nextQuarter' | 'halftime' | 'endGame'

export function downAndDistanceText(down: number, ballOn: number, firstDownTarget: number) {
  const togo = firstDownTarget - ballOn
  const distance = firstDownTarget >= 100 ? 'Goal' : String(Math.max(1, togo))
  return `${ordinal(down)} & ${distance}`
}

export function clockExpiryForQuarter(quarter: number): ClockExpiry {
  if (quarter >= 4) return 'endGame'
  return quarter === 2 ? 'halftime' : 'nextQuarter'
}

export function opponentYardAfterTurnover(ballOn: number) {
  return 100 - ballOn
}

export function addPoints(score: number, points: number) {
  return score + points
}

export function kickSuccessChance(type: 'fieldGoal' | 'extraPoint', distance: number, power: number) {
  // Wide timing window — anywhere near the sweet spot counts as a good hit —
  // and a high floor so even a mistimed press still has a real shot.
  const timing = 1 - Math.min(1, Math.abs(power - 54) / 34)
  const distanceChance = type === 'extraPoint' ? 0.99 : Math.min(0.99, Math.max(0.4, 1.2 - (distance - 20) * 0.007))
  return distanceChance * (0.7 + timing * 0.3)
}

export function kickIsGood(chance: number, roll: number) {
  return roll < chance
}
