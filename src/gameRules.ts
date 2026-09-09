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
  const timing = 1 - Math.min(1, Math.abs(power - 54) / 22)
  const distanceChance = type === 'extraPoint' ? 0.99 : Math.min(0.99, Math.max(0.2, 1.16 - (distance - 20) * 0.011))
  return distanceChance * (0.5 + timing * 0.5)
}

export function kickIsGood(chance: number, roll: number) {
  return roll < chance
}
