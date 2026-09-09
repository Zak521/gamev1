// Rules and coordinate helpers with no DOM or renderer dependencies.
// Keeping these here makes them quick to test in Node as well as usable in-game.

export const USER_GOAL_LINE_Z = 8
export const OPPONENT_GOAL_LINE_Z = -92
export const USER_TWENTY_Z = USER_GOAL_LINE_Z - 20
export const END_ZONE_DEPTH = 10
export const USER_END_ZONE_BACK_Z = USER_GOAL_LINE_Z + END_ZONE_DEPTH
export const OPPONENT_END_ZONE_BACK_Z = OPPONENT_GOAL_LINE_Z - END_ZONE_DEPTH

export function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

export function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

export function cssHex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

// Yard line 0-100 measured from the user's own goal line (100 = opponent goal = TD).
export function losZ(yard: number) {
  return USER_GOAL_LINE_Z - yard
}

export function ballOnFromZ(z: number) {
  return Math.min(100, Math.max(0, Math.round(USER_GOAL_LINE_Z - z)))
}

// Convert "yards from the opponent's own goal" into a world Z for defensive series.
export function defensiveSpotZ(oppYard: number) {
  return OPPONENT_GOAL_LINE_Z + oppYard
}

export function describeSpot(yard: number) {
  const y = Math.round(yard)
  if (y === 50) return 'MIDFIELD'
  return y < 50 ? `OWN ${y}` : `OPP ${100 - y}`
}

export function formatClock(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
