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
  // Chip shots are nearly automatic, mid-range kicks fall off gently, and
  // anything past a real NFL kicker's range (60+) gets steep fast — a 70-yarder
  // should be all but impossible, not a coin flip.
  const distanceChance = type === 'extraPoint'
    ? 0.99
    : distance <= 40
      ? Math.min(0.99, 1.05 - (distance - 20) * 0.005)
      : distance <= 60
        ? 0.95 - (distance - 40) * 0.0225
        : Math.max(0, 0.5 - (distance - 60) * 0.05)
  return distanceChance * (0.7 + timing * 0.3)
}

export function kickIsGood(chance: number, roll: number) {
  return roll < chance
}

// Net punt yardage from the same timing meter used for field goals — a kick
// caught right on the sweet spot (power 54) drives it deep; a badly mistimed
// one dies short. Random hang/coverage variance is layered on by the caller.
export function puntNetYards(power: number) {
  const timing = 1 - Math.min(1, Math.abs(power - 54) / 34)
  return 32 + timing * 20
}

// Net kickoff yardage from the kicking team's own 35, off the same timing
// meter as a punt or field goal. A kick right on the sweet spot (power 54)
// goes for a touchback (35 + 65 = the goal line); a badly mistimed one is
// short enough that the receiving team gets a live return.
export function kickoffNetYards(power: number) {
  const timing = 1 - Math.min(1, Math.abs(power - 54) / 34)
  return 50 + timing * 20
}

// Recovery chance for a user-attempted onside kick, off the same timing
// meter — a kick hit right on the sweet spot gives real "hands team" era
// odds; a badly mistimed one is nearly unrecoverable.
export function onsideRecoverChance(power: number) {
  const timing = 1 - Math.min(1, Math.abs(power - 54) / 34)
  return 0.08 + timing * 0.34
}

// The opponent's own automatic kickoff has no timing input to read, so its
// net yardage is rolled instead: a majority go for touchbacks (`touchback`
// true), matching real-world kickoff outcomes, and the rest come down in
// the field of play for a live return.
export function opponentKickoffNetYards(touchback: boolean, roll: number) {
  return touchback ? 66 + roll * 20 : 40 + roll * 20
}
