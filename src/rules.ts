import * as THREE from 'three'
import {
  CONFERENCE_IDS,
  CONFERENCES,
  DEFENSE_PLAYBOOK,
  DIVISIONS,
  EYE_HEIGHT,
  MOVE_SCALE,
  OFFENSE_PLAYBOOK,
  OPPONENT_GOAL_LINE_Z,
  OT_SECONDS,
  OUT_OF_BOUNDS_X,
  PLAY_CLOCK_SECONDS,
  QUARTER_SECONDS,
  TEAMS,
  USER_END_ZONE_BACK_Z,
  USER_TWENTY_Z,
  ballOnFromZ,
  clockEl,
  coinEl,
  coinFlipStatus,
  coinTossCall,
  coinTossFlip,
  coinTossPicker,
  conferenceOptions,
  conferenceSelect,
  defenseCall,
  defenseKicker,
  defenseOptions,
  defenders,
  cssHex,
  defensiveSpotZ,
  describeSpot,
  divisionOptions,
  divisionSelect,
  divisionSelectBack,
  divisionSelectKicker,
  divisionsInConference,
  downAndDistance,
  downEl,
  formatClock,
  formatRecord,
  gameOverPanel,
  gameOverScore,
  gameOverTitle,
  homeAwaySelect,
  homeAwaySelectBack,
  awayOptionSubEl,
  pickHomeButton,
  pickAwayButton,
  isRunId,
  keys,
  kickFill,
  kickMeter,
  kickPrompt,
  kickoffCall,
  linemen,
  loadSeason,
  losZ,
  oppChipEl,
  opponentLabelEl,
  opponentScoreEl,
  ordinal,
  patCall,
  penaltyFlag,
  penaltyFlagText,
  playCall,
  playCallKicker,
  playOptions,
  playTabs,
  quarterEl,
  randomBetween,
  receivers,
  coinShadowEl,
  refereeTossArm,
  saveSeason,
  scoreEl,
  seasonRecordEl,
  staminaMeter,
  state,
  statusText,
  teamOptions,
  teamSelect,
  teamSelectBack,
  teamSelectKicker,
  teammates,
  timeoutPanel,
  timeoutsOpponentEl,
  timeoutsUserEl,
  yardsEl,
  yardsLabelEl,
} from './core.ts'
import type { ConferenceId, DefenseCall, Defender, DivisionId, HomeAway, KickType, PlayId, RunPlayId, TeamId } from './core.ts'
import { aimCamera, applyOpponentTeam, camera, celebrateTouchdown, playerView, playThrow, rebuildCrowd, releaseMouse, resetView, startAudio, updateScoreboard, world } from './world.ts'
import {
  balls,
  buildDefense,
  buildOffensiveLine,
  buildReceivers,
  clearKickBlockers,
  clearPlayers,
  clearReferees,
  createDefender,
  createLineman,
  signalReferees,
  spawnKickBlockers,
  spawnReferees,
} from './entities.ts'
import {
  addPoints,
  clockExpiryForQuarter,
  kickIsGood,
  kickSuccessChance,
  kickoffNetYards,
  onsideRecoverChance,
  opponentKickoffNetYards,
  opponentYardAfterTurnover,
  puntNetYards,
} from './gameRules.ts'

// The AI offense's play call for a defensive series: either a run (a lane to
// attack and a ball carrier speed) or a pass (routes for three receivers, plus
// how long the QB holds the ball before throwing).
type OpponentCall =
  | { kind: 'run'; name: string; lane: number; speed: number }
  | { kind: 'pass'; name: string; routes: Array<[number, number, number, number]>; readTime: number }

export function startDefensiveSeries(spotZ: number, returnKind: 'punt' | null, newSeries = true) {
  if (state.gameOver) return
  releaseMouse()
  clearPlayers()
  state.possession = 'defense'
  state.running = false
  state.selectedPlay = null
  state.throwing = false
  state.passTarget = null
  state.playTime = 0
  state.clockEventHandled = false
  // The current down's line of scrimmage — refreshed on every snap, not just
  // the start of a series, so it stays a correct fallback spot even on a play
  // with no ball carrier yet (an incomplete pass, a sack).
  state.defenseSnapZ = spotZ
  if (newSeries) {
    state.defenseFirstDownZ = spotZ
    state.defenseDown = 1
  }
  const opponentCalls: OpponentCall[] = [
    { kind: 'run', name: 'Inside Run', lane: 0, speed: 13.2 },
    { kind: 'run', name: 'Sweep Right', lane: 14, speed: 14.1 },
    { kind: 'run', name: 'Sweep Left', lane: -14, speed: 14.1 },
    { kind: 'run', name: 'Draw Play', lane: randomBetween(-5, 5), speed: 12.5 },
    { kind: 'pass', name: 'Quick Slant', routes: [[-14, -8, 4, 12], [0, 4, 14, 16], [14, 8, -3, 12]], readTime: 1.05 },
    { kind: 'pass', name: 'Deep Shot', routes: [[-4, -8, 3, 34], [-18, -20, -22, 18], [18, 21, 23, 18]], readTime: 1.75 },
    { kind: 'pass', name: 'Screen Pass', routes: [[-11, -13, -15, 2], [11, 14, 17, 3], [1, 2, 3, 9]], readTime: 0.9 },
  ]
  // A kickoff/punt return isn't a called play — it's a returner catching the
  // ball and improvising a lane, so force a plain "run" instead of picking
  // from the normal playbook (which could otherwise hand them a pass play).
  const isReturn = returnKind !== null
  state.isReturnPlay = isReturn
  const opponentCall: OpponentCall = isReturn
    ? { kind: 'run', name: 'the return', lane: randomBetween(-8, 8), speed: 13.5 }
    : opponentCalls[Math.floor(Math.random() * opponentCalls.length)]
  state.opponentPlay = opponentCall.name
  // Start on the defensive side and face the runner so every snap is a tackle attempt.
  state.cameraZ = Math.min(6, spotZ + 15)
  state.playerX = 0
  state.playerBlockedUntil = 0
  state.carrierJukeVX = 0
  state.carrierJukeUntil = 0
  state.carrierNextJuke = 1
  state.carrierLaneX = opponentCall.kind === 'run' ? opponentCall.lane : 0
  state.bigPlayAllowed = true
  state.ballCarrier = null
  state.oppQB = null
  state.oppPassPlayActive = false
  state.oppThrown = false
  state.oppPassTarget = null
  balls.player.visible = false
  balls.thrown.visible = false

  const opponentTeam = TEAMS[state.opponentTeam]
  if (opponentCall.kind === 'run') {
    // The opponent offense: a highlighted ball carrier plus blockers who wall
    // you off, all in the chosen opponent's colors.
    for (let index = 0; index < 7; index += 1) {
      const x = index === 0 ? randomBetween(-10, 10) : randomBetween(-16, 16)
      const z = spotZ + (index === 0 ? 0 : 4 + index * 2.6)
      const opponent = createDefender(x, z, index === 0 ? opponentTeam.accent : opponentTeam.primary, 10 + index, opponentTeam.id, index === 0)
      opponent.speed = index === 0 ? opponentCall.speed : 11
      if (index === 0) state.ballCarrier = opponent
    }
  } else {
    // A pass play: a QB who holds the ball for a read, three receivers who run
    // routes downfield, and three linemen who hold the pocket.
    const qb = createDefender(0, spotZ - 1, opponentTeam.accent, 10, opponentTeam.id, true)
    qb.speed = 0
    qb.isQB = true
    state.oppQB = qb
    opponentCall.routes.forEach(([startX, breakX, targetX, routeDepth], index) => {
      const r = createDefender(startX, spotZ, opponentTeam.primary, 11 + index, opponentTeam.id)
      r.isReceiver = true
      r.startX = startX
      r.breakX = breakX
      r.targetX = targetX
      r.routeDepth = routeDepth
      r.speed = 13
    })
    for (const [index, x] of [-4, 0, 4].entries()) {
      const lineman = createDefender(x, spotZ - 2, opponentTeam.primary, 70 + index, opponentTeam.id)
      lineman.speed = 0
    }
    state.oppPassPlayActive = true
    state.oppThrowAt = opponentCall.readTime
  }
  // Your pursuit help, spread across the field a few yards ahead of you.
  for (let index = 0; index < 4; index += 1) {
    const t = createDefender((index - 1.5) * 9 + randomBetween(-2, 2), state.cameraZ + randomBetween(3, 9), TEAMS.vikings.primary, 30 + index, 'vikings', false, teammates)
    t.role = 'man'
    t.speed = 13
  }
  camera.position.set(0, EYE_HEIGHT, state.cameraZ)
  resetView()
  playerView.position.x = 0
  playerView.rotation.z = 0
  spawnReferees(spotZ)
  playCall.classList.add('is-hidden')
  const togo = Math.max(1, Math.ceil(state.defenseFirstDownZ + 10 - spotZ))
  const returnLabel = returnKind === 'punt' ? 'Punt return' : null
  state.defenseKickerBase = returnLabel
    ? `${returnLabel} · ball on the ${describeSpot(ballOnFromZ(spotZ))}`
    : newSeries
      ? `Ball on the ${describeSpot(ballOnFromZ(spotZ))}`
      : `${ordinal(state.defenseDown)} & ${togo}`
  state.playClock = PLAY_CLOCK_SECONDS
  defenseKicker.textContent = `${state.defenseKickerBase} · Play clock ${PLAY_CLOCK_SECONDS}`
  statusText.textContent = returnLabel
    ? `${returnLabel} — choose your coverage, then run him down before he breaks free!`
    : `Choose your defense, then make the tackle.`
  renderDefenseOptions()
  defenseCall.classList.remove('is-hidden')
  updateHud()
}

let pendingTimer: ReturnType<typeof setTimeout> | undefined
function schedule(fn: () => void, ms: number) {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    pendingTimer = undefined
    fn()
  }, ms)
}

// A brief on-screen flag banner for penalties — separate from the single-slot
// `schedule` above (which drives play-to-play sequencing) so a flag popping
// up never cancels or gets cancelled by the next snap's scheduled action.
let penaltyFlagTimer: ReturnType<typeof setTimeout> | undefined
function showPenaltyFlag(text: string) {
  if (penaltyFlagTimer) clearTimeout(penaltyFlagTimer)
  penaltyFlagText.textContent = text
  penaltyFlag.classList.remove('is-hidden')
  penaltyFlagTimer = setTimeout(() => {
    penaltyFlagTimer = undefined
    penaltyFlag.classList.add('is-hidden')
  }, 2200)
}

// Kick the ball to whichever side is receiving. If the opponent is receiving,
// it's your kickoff — line up at the meter, same as a punt or field goal
// (with an onside option when you're trailing late). If you're receiving,
// the opponent kicks automatically, since only you ever operate the meter.
function kickoff(receiving: 'offense' | 'defense') {
  state.clockEventHandled = false
  if (receiving === 'offense') {
    statusText.textContent = 'Opponent lines up to kick off…'
    updateHud()
    schedule(() => simulateOpponentKickoff(), 900)
    return
  }
  if (onsideEligible()) {
    statusText.textContent = 'You trail late — kick it away, or try an onside kick?'
    updateHud()
    kickoffCall.classList.remove('is-hidden')
    return
  }
  state.onsideKick = false
  startKick('kickoff', 65)
}

// Onside kicks are a trailing team's tool late in the game — offered only
// when kicking off (never when receiving) with the clock working against you.
function onsideEligible() {
  return state.quarter >= 4 && state.score < state.opponentScore
}

// The player's choice from the kickoff dialog: a normal deep kick, or a
// short onside attempt. Either way it plays out at the kick meter.
export function chooseKickoff(onside: boolean) {
  kickoffCall.classList.add('is-hidden')
  state.onsideKick = onside
  startKick('kickoff', onside ? 12 : 65)
}

// The opponent's own kickoff — an automatic decision, since only you ever run
// the kick meter, but played out as a real, visible kick: the ball launches
// off their tee and arcs toward you exactly like your own kickoff does (see
// resolveKickoff/updateKickFlight), then settles into either a touchback or
// an interactive return once it lands (see settleOpponentKickoffFlight).
// Mostly a deep touchback, occasionally a live return, and — mirroring real
// coaching — a shot at an onside kick if the opponent is trailing late, same
// as the choice you get in the same spot.
function simulateOpponentKickoff() {
  if (state.gameOver) return
  releaseMouse()
  clearPlayers()
  state.opponentKicking = true
  const attemptsOnside = state.quarter >= 4 && state.opponentScore < state.score && Math.random() < 0.8
  state.onsideKick = attemptsOnside
  // "Own-yard" distance the kick travels, same convention as an opponent
  // drive (0 = their goal line): an onside kick only has to clear 10 yards,
  // a normal kick's net comes off the same touchback-weighted roll as before.
  const netYards = attemptsOnside ? 10 : opponentKickoffNetYards(Math.random() < 0.35, Math.random())
  const landingOwnYard = 35 + netYards
  const userYard = 100 - landingOwnYard
  const kickSpotZ = losZ(65) // the opponent's own 35, in user-perspective yards
  // Clamp the visible landing spot to the back of your end zone — the real
  // outcome (touchback or not) is still decided by the unclamped yardage above.
  const toZ = Math.min(losZ(userYard), USER_END_ZONE_BACK_Z)
  const from = new THREE.Vector3(0, 0.35, kickSpotZ + 1.4)
  const to = new THREE.Vector3(randomBetween(-3, 3), 0.4, toZ)
  const apex = attemptsOnside ? 3.5 : THREE.MathUtils.clamp(netYards * 0.32, 9, 20)
  const dur = attemptsOnside ? 0.8 : THREE.MathUtils.clamp(netYards * 0.045, 1.6, 3.2)
  const ctrl = new THREE.Vector3((from.x + to.x) / 2, apex, (from.z + to.z) / 2)
  // Spectate from around where you'll pick up the return — the same spot an
  // interactive return would start from — facing upfield into the incoming kick.
  state.cameraZ = toZ
  camera.position.set(0, EYE_HEIGHT, toZ)
  resetView()
  playerView.position.x = 0
  playerView.rotation.z = 0
  // The opponent's coverage line, lined up at their kickoff spot just like
  // your own coverage does before you kick — and, same as your own coverage,
  // it actually sprints downfield while the ball is in the air (see the
  // state.opponentKicking branch of updateKickFlight) instead of standing
  // still until you catch it.
  const opponentTeam = TEAMS[state.opponentTeam]
  for (const [index, x] of [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5].entries()) {
    const coverage = createDefender(x, kickSpotZ, opponentTeam.primary, 40 + index, opponentTeam.id)
    coverage.role = 'rush'
    coverage.speed = randomBetween(11, 13)
  }
  balls.player.visible = false
  balls.thrown.visible = true
  balls.thrown.position.copy(from)
  state.kickFlight = {
    t: 0,
    dur,
    from,
    ctrl,
    to,
    type: 'kickoff',
    // Carried through to settleOpponentKickoffFlight as the "own-yard" spot.
    distance: landingOwnYard,
    // Onside only: whether the kicking team (the opponent) wins the recovery race.
    made: attemptsOnside ? Math.random() < 0.22 : true,
    blocked: false,
  }
  statusText.textContent = attemptsOnside ? "Opponent tries an onside kick — it's a scramble!" : 'Opponent kicks off — the ball is up…'
  updateHud()
}

// Settle the opponent's kickoff once it lands: an onside attempt is a
// straight recovery race, a normal kick is either a touchback or a live
// return you play out yourself (see startUserReturn). Mirrors
// settleKickoffFlight, just with the outcomes flipped the other way.
function settleOpponentKickoffFlight(landingOwnYard: number, recoveredByKicker: boolean) {
  state.opponentKicking = false
  const userYard = 100 - landingOwnYard
  if (state.onsideKick) {
    if (recoveredByKicker) {
      statusText.textContent = `Opponent tries an onside kick — and recovers it at the ${describeSpot(userYard)}!`
      updateHud()
      schedule(() => startDefensiveSeries(defensiveSpotZ(landingOwnYard), null), 1000)
      return
    }
    statusText.textContent = `Opponent tries an onside kick — you scoop it up at the ${describeSpot(userYard)}!`
    updateHud()
    schedule(() => resetDrive(losZ(userYard)), 1000)
    return
  }
  if (landingOwnYard >= 100) {
    statusText.textContent = 'Touchback — your ball on the 25.'
    updateHud()
    schedule(() => resetDrive(losZ(25)), 1000)
    return
  }
  statusText.textContent = `Kickoff to the ${describeSpot(userYard)} — it's being returned!`
  updateHud()
  schedule(() => startUserReturn(losZ(userYard)), 300)
}

// Hands you an interactive return after a non-touchback kickoff: catch it
// and run, with the kicking team's coverage bearing down on you. Ends in a
// fresh 1st & 10 wherever you're brought down (see finishRunPlay).
function startUserReturn(spotZ: number) {
  if (state.gameOver) return
  releaseMouse()
  // Don't clearPlayers() here — that would wipe the kicking team's coverage
  // line, which has been sprinting toward you since the kick (see the
  // state.opponentKicking branch of updateKickFlight) and should carry
  // whatever ground it's already covered straight into the return.
  clearReferees()
  state.possession = 'offense'
  state.selectedPlay = null
  state.throwing = false
  state.afterCatch = false
  state.passTarget = null
  state.playTime = 0
  state.returning = true
  state.running = true
  state.runDelay = 0
  state.playerX = 0
  state.cameraZ = spotZ
  state.ballOn = ballOnFromZ(spotZ)
  state.carrierLaneX = 0
  state.stamina = 1
  state.gassed = false
  state.sacked = false
  state.pressureAnnounced = false
  state.prevDirection = 0
  state.playerVX = 0
  state.playerVZ = 0
  state.footstepTimer = 0
  state.snapDownText = '1st & 10'
  state.snapYardsText = describeSpot(state.ballOn)
  camera.position.set(0, EYE_HEIGHT, state.cameraZ)
  resetView()
  playerView.position.x = 0
  playerView.rotation.z = 0
  spawnReferees(spotZ)
  balls.player.visible = true
  balls.thrown.visible = false
  statusText.textContent = 'Kick return — WASD to find a crease, Shift or Space to sprint!'
  updateHud()
}

// Settle a played-out kickoff once the ball lands: an onside attempt is a
// straight recovery race, a normal kick is either a touchback or a live
// return. Unlike a punt/turnover, the return team is already on the field —
// see resolveKickoff — so this hands the return off to beginKickoffReturn
// instead of teleporting a fresh cast in via giveBallToOpponent.
function settleKickoffFlight(landingYard: number, recovered: boolean) {
  if (state.onsideKick) {
    if (recovered) {
      statusText.textContent = `ONSIDE KICK RECOVERED! Your ball at the ${describeSpot(landingYard)}.`
      updateHud()
      schedule(() => resetDrive(losZ(landingYard)), 1300)
      return
    }
    giveBallToOpponent(100 - landingYard, `Onside kick — opponent recovers it at the ${describeSpot(landingYard)}.`)
    return
  }
  if (landingYard >= 100) {
    // No return unit was spawned for a touchback (see resolveKickoff) — just
    // clear your coverage sprint off the field and hand it over.
    giveBallToOpponent(25, 'Kickoff into the end zone — touchback. Opponent ball on their 25.')
    return
  }
  beginKickoffReturn(landingYard)
}

// Hands off from the coverage sprint into a live return: the returner and
// his blockers were already spawned onto the field the instant you kicked
// (see resolveKickoff), and your own coverage has been sprinting downfield
// this whole time (see the no-carrier branch of updateDefense). A kickoff
// return is continuous action, unlike a turnover or a fresh defensive series
// starting from a dead ball — you're already mid-sprint when the catch
// happens — so this goes straight into the live chase instead of stopping
// for the usual "choose your coverage" call first; pausing there after a
// live first-person sprint read as the return simply not happening.
function beginKickoffReturn(landingYard: number) {
  const spotZ = losZ(landingYard)
  state.possession = 'defense'
  state.isReturnPlay = true
  state.defenseSnapZ = spotZ
  state.defenseFirstDownZ = spotZ
  state.defenseDown = 1
  const returner = defenders[0] ?? null
  state.ballCarrier = returner
  state.carrierLaneX = returner ? returner.x : 0
  state.bigPlayAllowed = true
  state.playerBlockedUntil = 0
  state.carrierJukeVX = 0
  state.carrierJukeUntil = 0
  state.carrierNextJuke = 1
  state.oppQB = null
  state.oppPassPlayActive = false
  state.oppThrown = false
  state.oppPassTarget = null
  // Same tuning as the base defensive call — there's no menu here to pick a
  // different one from.
  state.defTackleRadius = 1.7
  state.defCarrierSpeedMul = 1
  state.playTime = 0
  state.snapDownText = 'Kickoff return'
  state.snapYardsText = describeSpot(landingYard)
  spawnReferees(spotZ)
  playCall.classList.add('is-hidden')
  defenseCall.classList.add('is-hidden')
  defenseKicker.textContent = `Kickoff return · ball on the ${describeSpot(landingYard)}`
  statusText.textContent = 'He caught it — run him down!'
  state.running = true
  updateHud()
}

function halftime() {
  state.quarter = 3
  state.gameClock = QUARTER_SECONDS
  state.playClock = PLAY_CLOCK_SECONDS
  state.clockEventHandled = false
  state.running = false
  // Timeouts and the two-minute warning both reset fresh for the second half.
  state.timeoutsUser = 3
  state.timeoutsOpponent = 3
  state.twoMinuteWarningPending = false
  state.twoMinuteWarningGiven = false
  // Whoever did NOT receive the opening kickoff gets the ball out of the half.
  const receiving = state.firstPossession === 'offense' ? 'defense' : 'offense'
  statusText.textContent = 'Second-half kickoff.'
  updateHud()
  schedule(() => kickoff(receiving), 1400)
}

function endGame() {
  // A tie at the end of regulation goes to a single sudden-death overtime period.
  if (state.score === state.opponentScore && state.quarter < 5) {
    state.quarter = 5
    state.gameClock = OT_SECONDS
    state.playClock = PLAY_CLOCK_SECONDS
    state.clockEventHandled = false
    state.running = false
    // The NFL gives each team two timeouts per overtime period.
    state.timeoutsUser = 2
    state.timeoutsOpponent = 2
    state.twoMinuteWarningPending = false
    state.twoMinuteWarningGiven = false
    statusText.textContent = 'OVERTIME — next score wins.'
    updateHud()
    const receiving = Math.random() < 0.5 ? 'offense' : 'defense'
    schedule(() => kickoff(receiving), 1400)
    return
  }
  state.gameOver = true
  state.running = false
  releaseMouse()
  playCall.classList.add('is-hidden')
  defenseCall.classList.add('is-hidden')
  patCall.classList.add('is-hidden')
  kickoffCall.classList.add('is-hidden')
  coinTossPicker.classList.add('is-hidden')
  coinTossFlip.classList.add('is-hidden')
  coinTossCall.classList.add('is-hidden')
  const won = state.score > state.opponentScore
  const tied = state.score === state.opponentScore
  const season = loadSeason()
  if (!state.recorded) {
    if (won) season.w += 1
    else if (tied) season.t += 1
    else season.l += 1
    saveSeason(season)
    state.recorded = true
  }
  gameOverTitle.textContent = tied ? 'Final — Tie' : won ? 'Final — You win' : 'Final — You lose'
  gameOverScore.textContent = `You ${state.score} · Opponent ${state.opponentScore}`
  seasonRecordEl.textContent = `Season record: ${formatRecord(season)}`
  gameOverPanel.classList.remove('is-hidden')
  statusText.textContent = `FINAL · You ${state.score} — Opponent ${state.opponentScore}`
  updateHud()
}

function handleClockExpired() {
  if (state.gameOver || state.clockEventHandled) return
  state.clockEventHandled = true
  state.running = false
  if (clockExpiryForQuarter(state.quarter) === 'endGame') {
    endGame()
    return
  }
  if (clockExpiryForQuarter(state.quarter) === 'halftime') {
    playCall.classList.add('is-hidden')
    defenseCall.classList.add('is-hidden')
    patCall.classList.add('is-hidden')
    statusText.textContent = 'End of the first half.'
    updateHud()
    schedule(halftime, 1400)
    return
  }
  state.quarter += 1
  state.gameClock = QUARTER_SECONDS
  state.playClock = PLAY_CLOCK_SECONDS
  state.clockEventHandled = false
  statusText.textContent = `End of the ${ordinal(state.quarter - 1)} quarter — ${
    state.possession === 'offense' ? downAndDistance() + ' on the ' + describeSpot(state.ballOn) : 'you stay on defense'
  }.`
  updateHud()
}

export function startGame() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = undefined
  state.score = 0
  state.opponentScore = 0
  state.quarter = 1
  state.gameClock = QUARTER_SECONDS
  state.playClock = PLAY_CLOCK_SECONDS
  state.clockEventHandled = false
  state.gameOver = false
  state.recorded = false
  state.twoPointActive = false
  state.kickType = null
  state.kickFlight = null
  state.onsideKick = false
  state.returning = false
  state.isReturnPlay = false
  state.timeoutsUser = 3
  state.timeoutsOpponent = 3
  state.twoMinuteWarningPending = false
  state.twoMinuteWarningGiven = false
  state.clockStopChecked = false
  clearKickBlockers()
  clearReferees()
  state.stamina = 1
  state.gassed = false
  kickMeter.classList.add('is-hidden')
  staminaMeter.classList.add('is-hidden')
  gameOverPanel.classList.add('is-hidden')
  playCall.classList.add('is-hidden')
  defenseCall.classList.add('is-hidden')
  patCall.classList.add('is-hidden')
  kickoffCall.classList.add('is-hidden')
  coinTossPicker.classList.add('is-hidden')
  coinTossFlip.classList.add('is-hidden')
  coinTossCall.classList.add('is-hidden')
  timeoutPanel.classList.add('is-hidden')
  conferenceSelect.classList.add('is-hidden')
  divisionSelect.classList.add('is-hidden')
  teamSelect.classList.add('is-hidden')
  homeAwaySelect.classList.add('is-hidden')
  coinEl.classList.remove('is-flipping', 'show-heads', 'show-tails')
  coinShadowEl.classList.remove('is-flipping')
  refereeTossArm.classList.remove('is-tossing')
  statusText.textContent = 'The ref is heading out for the coin toss…'
  updateHud()
  coinTossPicker.classList.remove('is-hidden')
}

let pendingCoinCall: 'heads' | 'tails' | undefined

// The player calls it in the air before the ref flips. A correct call wins
// the toss (see chooseCoinToss()); a wrong call hands the same automatic
// kick-or-receive odds a real opponent's choice would carry.
export function chooseCoinCall(call: 'heads' | 'tails') {
  pendingCoinCall = call
  coinTossPicker.classList.add('is-hidden')
  coinTossFlip.classList.add('is-hidden')
  // Force a reflow so re-adding the animation classes restarts them cleanly
  // even if a previous toss (e.g. a quick New Game) never finished.
  void coinEl.offsetWidth
  coinTossFlip.classList.remove('is-hidden')
  coinFlipStatus.textContent = `You call ${call === 'heads' ? 'Heads' : 'Tails'}…`
  coinEl.classList.remove('show-heads', 'show-tails')
  refereeTossArm.classList.remove('is-tossing')
  coinShadowEl.classList.remove('is-flipping')
  requestAnimationFrame(() => {
    coinEl.classList.add('is-flipping')
    coinShadowEl.classList.add('is-flipping')
    refereeTossArm.classList.add('is-tossing')
  })
  schedule(() => resolveCoinToss(), 1650)
}

function resolveCoinToss() {
  const call = pendingCoinCall ?? 'heads'
  const result: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails'
  coinEl.classList.remove('is-flipping')
  coinShadowEl.classList.remove('is-flipping')
  coinEl.classList.add(result === 'heads' ? 'show-heads' : 'show-tails')
  const won = result === call
  coinFlipStatus.textContent = `${result === 'heads' ? 'Heads' : 'Tails'}! ${won ? 'You win the toss.' : 'The opponent wins the toss.'}`
  schedule(() => {
    coinTossFlip.classList.add('is-hidden')
    if (won) {
      statusText.textContent = 'You won the toss…'
      updateHud()
      coinTossCall.classList.remove('is-hidden')
      return
    }
    // Opponent won the toss — an automatic decision, same coin-flip odds a real
    // team's choice comes down to between deferring and receiving.
    state.firstPossession = Math.random() < 0.5 ? 'offense' : 'defense'
    statusText.textContent = state.firstPossession === 'offense'
      ? 'Opponent won the toss and elected to kick — you will receive.'
      : 'Opponent won the toss and will receive.'
    schedule(() => kickoff(state.firstPossession), 900)
  }, 1300)
}

// The player's choice from the coin-toss dialog after winning the flip:
// receive first (and give the ball up to start the second half — see
// halftime(), which flips whoever did NOT get the opening kickoff onto
// offense) or kick first (and receive to start the second half instead).
export function chooseCoinToss(receive: boolean) {
  coinTossCall.classList.add('is-hidden')
  state.firstPossession = receive ? 'offense' : 'defense'
  statusText.textContent = receive
    ? 'You won the toss and will receive.'
    : 'You won the toss and elected to kick.'
  schedule(() => kickoff(state.firstPossession), 900)
}

// Shown before every new game so the player can pick a conference, then a
// division inside it, then a rival from inside that division. Picking a team
// recolors the opponent's end zone and sideline, then starts the game;
// buildDefense() and startDefensiveSeries() pick up state.opponentTeam for
// the players themselves.
export function openTeamSelect() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = undefined
  state.running = false
  releaseMouse()
  gameOverPanel.classList.add('is-hidden')
  playCall.classList.add('is-hidden')
  defenseCall.classList.add('is-hidden')
  patCall.classList.add('is-hidden')
  kickoffCall.classList.add('is-hidden')
  coinTossPicker.classList.add('is-hidden')
  coinTossFlip.classList.add('is-hidden')
  coinTossCall.classList.add('is-hidden')
  timeoutPanel.classList.add('is-hidden')
  divisionSelect.classList.add('is-hidden')
  teamSelect.classList.add('is-hidden')
  homeAwaySelect.classList.add('is-hidden')
  renderConferenceOptions()
  conferenceSelect.classList.remove('is-hidden')
}

function renderConferenceOptions() {
  conferenceOptions.innerHTML = ''
  for (const id of CONFERENCE_IDS) {
    const conference = CONFERENCES[id]
    const teamCount = divisionsInConference(id).reduce((sum, division) => sum + division.teamIds.length, 0)
    const button = document.createElement('button')
    button.type = 'button'
    button.innerHTML = `<strong>${conference.fullName}</strong><span>${teamCount} teams</span>`
    button.addEventListener('click', () => chooseConference(id))
    conferenceOptions.appendChild(button)
  }
}

// Remembers which conference is being browsed so the team-select back button
// can return to the right division list.
let selectedConference: ConferenceId = 'NFC'

function chooseConference(id: ConferenceId) {
  selectedConference = id
  divisionSelectKicker.textContent = `${CONFERENCES[id].name} · New Game`
  renderDivisionOptions(id)
  conferenceSelect.classList.add('is-hidden')
  divisionSelect.classList.remove('is-hidden')
}

function renderDivisionOptions(conferenceId: ConferenceId) {
  divisionOptions.innerHTML = ''
  for (const division of divisionsInConference(conferenceId)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.innerHTML = `<strong>${division.name}</strong><span>${division.teamIds.length} teams</span>`
    button.addEventListener('click', () => chooseDivision(division.id))
    divisionOptions.appendChild(button)
  }
}

function chooseDivision(id: DivisionId) {
  const division = DIVISIONS[id]
  teamSelectKicker.textContent = `${division.name} · New Game`
  renderTeamOptions(division.teamIds)
  divisionSelect.classList.add('is-hidden')
  teamSelect.classList.remove('is-hidden')
}

divisionSelectBack.addEventListener('click', () => {
  divisionSelect.classList.add('is-hidden')
  renderConferenceOptions()
  conferenceSelect.classList.remove('is-hidden')
})

function renderTeamOptions(teamIds: TeamId[]) {
  teamOptions.innerHTML = ''
  for (const id of teamIds) {
    const team = TEAMS[id]
    const button = document.createElement('button')
    button.type = 'button'
    button.style.setProperty('--team-color', `#${team.primary.toString(16).padStart(6, '0')}`)
    button.innerHTML = `<strong>${team.fullName}</strong><span>${team.abbr}</span>`
    button.addEventListener('click', () => chooseOpponent(id))
    teamOptions.appendChild(button)
  }
}

function chooseOpponent(id: TeamId) {
  state.opponentTeam = id
  teamSelect.classList.add('is-hidden')
  openHomeAwaySelect()
}

teamSelectBack.addEventListener('click', () => {
  teamSelect.classList.add('is-hidden')
  renderDivisionOptions(selectedConference)
  divisionSelect.classList.remove('is-hidden')
})

// Last step before kickoff: home or away. Picking either applies the
// opponent's sideline/field branding and starts the game — the only thing
// that differs between the two is which team's colors dress the field
// itself (see applyHomeField() in world.ts).
function openHomeAwaySelect() {
  awayOptionSubEl.textContent = `Play on the road — ${TEAMS[state.opponentTeam].fullName}'s branding covers the field`
  homeAwaySelect.classList.remove('is-hidden')
}

function chooseHomeAway(homeAway: HomeAway) {
  state.homeAway = homeAway
  applyOpponentTeam()
  rebuildCrowd()
  homeAwaySelect.classList.add('is-hidden')
  startGame()
}

pickHomeButton.addEventListener('click', () => chooseHomeAway('home'))
pickAwayButton.addEventListener('click', () => chooseHomeAway('away'))

homeAwaySelectBack.addEventListener('click', () => {
  homeAwaySelect.classList.add('is-hidden')
  teamSelect.classList.remove('is-hidden')
})

// Central down-and-distance advance for every way the offense can end a play.
export function gainTo(newBallOn: number, lead = '', clockStops = false) {
  // A return that ends in a touchdown or a safety skips finishRunPlay's
  // return-specific handling entirely, so clear the flag here too.
  state.returning = false
  state.lastPlayStoppedClock = clockStops
  state.running = false
  state.ballOn = THREE.MathUtils.clamp(Math.round(newBallOn), 0, 100)
  // A two-point try only cares whether the ball reached the end zone.
  if (state.twoPointActive) {
    resolveTwoPoint(state.ballOn >= 100)
    return
  }
  if (state.ballOn <= 0) {
    safety()
    return
  }
  if (state.ballOn >= 100) {
    scoreTouchdown()
    return
  }
  if (state.ballOn >= state.firstDownTarget) {
    state.down = 1
    state.firstDownTarget = Math.min(state.ballOn + 10, 100)
    signalReferees('firstDown')
    offensiveMenu(lead || 'First down!')
    return
  }
  state.down += 1
  if (state.down > 4) {
    turnOverOnDowns()
    return
  }
  offensiveMenu(lead)
}

export function offensiveMenu(lead: string) {
  // Any incomplete pass / throwaway / penalty during a two-point try just ends it.
  if (state.twoPointActive) {
    resolveTwoPoint(false)
    return
  }
  state.running = false
  releaseMouse()
  state.selectedPlay = null
  state.throwing = false
  state.playClock = PLAY_CLOCK_SECONDS
  const prefix = lead ? `${lead} ` : ''
  statusText.textContent = `${prefix}${downAndDistance()} on the ${describeSpot(state.ballOn)}.`
  defenseCall.classList.add('is-hidden')
  playCall.classList.remove('is-hidden')
  updateHud()
}

function safety() {
  state.running = false
  state.opponentScore = addPoints(state.opponentScore, 2)
  statusText.textContent = 'SAFETY — two points for the opponent.'
  updateHud()
  if (state.quarter >= 5) {
    schedule(endGame, 1400)
    return
  }
  // Conceding team free-kicks from its own 20; the opponent takes over on offense.
  schedule(() => kickoff('defense'), 1500)
}

// Hand the ball to the opponent (played as your defensive series) at a spot given
// as the opponent's own yard line (1-99 from their goal). Pass 'punt' as
// returnKind to dramatize the handoff as a live return instead of a dead spot.
export function giveBallToOpponent(oppYard: number, message: string, returnKind: 'punt' | null = null) {
  // An interception or fumble on a two-point try just fails the try — no return.
  if (state.twoPointActive) {
    resolveTwoPoint(false)
    return
  }
  state.running = false
  state.lastPlayStoppedClock = true
  playCall.classList.add('is-hidden')
  statusText.textContent = message
  updateHud()
  const spot = defensiveSpotZ(THREE.MathUtils.clamp(Math.round(oppYard), 1, 99))
  schedule(() => startDefensiveSeries(spot, returnKind), 1500)
}

function attemptFieldGoal() {
  state.running = false
  playCall.classList.add('is-hidden')
  const dist = Math.round(100 - state.ballOn + 17)
  startKick('fieldGoal', dist)
}

export function startKick(type: KickType, distance: number) {
  state.running = false
  state.kickType = type
  state.kickDistance = distance
  state.kickPower = 0
  state.kickFlight = null
  // After a touchdown, spot the extra-point snap at the 15-yard line — the NFL
  // moved it back there in 2015, turning the PAT into a ~33-yard kick.
  if (type === 'extraPoint') {
    state.ballOn = 85
    state.cameraZ = losZ(state.ballOn)
  }
  // Kickoffs go from the kicking team's own 35, same as the NFL.
  if (type === 'kickoff') {
    state.ballOn = 35
    state.cameraZ = losZ(state.ballOn)
  }
  keys.sprint = false
  // Put the kicking unit on the field before the player takes the kick.
  // The goal post stays directly ahead, with the purple line protecting the holder.
  clearPlayers()
  state.playerX = 0
  camera.position.set(0, EYE_HEIGHT, state.cameraZ)
  resetView()
  playerView.position.x = 0
  playerView.rotation.z = 0
  if (type === 'kickoff') {
    // Your own coverage team spread along the line, as real running players
    // (not the bulkier lineman build) since resolveKickoff sends them
    // sprinting downfield with you the instant the ball is struck — nobody
    // rushes a kickoff, so unlike every other kick there's no block unit to spawn.
    for (const [index, x] of [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5].entries()) {
      createDefender(x, state.cameraZ - 5, TEAMS.vikings.primary, 40 + index, 'vikings', false, teammates)
    }
  } else {
    for (const [index, x] of [-7.2, -3.6, 0, 3.6, 7.2].entries()) {
      createLineman(x, state.cameraZ - 4.8, 70 + index)
    }
    // A second purple player beside the holder makes the extra-point unit feel set.
    createLineman(2.8, state.cameraZ - 2.8, 88)
    // The opponent's block unit lines up across the ball and rushes the kick.
    spawnKickBlockers(state.cameraZ)
  }
  spawnReferees(state.cameraZ)
  balls.player.visible = true
  balls.thrown.visible = false
  const label = type === 'extraPoint' ? 'Extra point'
    : type === 'punt' ? 'Punt'
    : type === 'kickoff' ? (state.onsideKick ? 'Onside kick' : 'Kickoff')
    : `${distance}-yard field goal`
  kickPrompt.textContent = `${label} — press Space to kick`
  kickFill.style.width = '0%'
  kickMeter.classList.remove('is-hidden')
  statusText.textContent = `Line up the ${label.toLowerCase()} — time the meter!`
}

export function resolveKick() {
  const type = state.kickType
  if (!type || state.kickFlight) return
  state.kickType = null
  kickMeter.classList.add('is-hidden')
  if (type === 'punt') {
    resolvePunt()
    return
  }
  if (type === 'kickoff') {
    resolveKickoff()
    return
  }
  const distance = state.kickDistance
  // Forgiving timing window and a gentler distance falloff — a well-timed kick
  // inside ~45 yards is nearly automatic, and even a mistimed one has a chance.
  let made = kickIsGood(kickSuccessChance(type, distance, state.kickPower), Math.random())
  // The block unit gets a hand on the ball once in a while — rarely on a PAT,
  // more often the longer (and flatter) the field goal. A blocked kick is dead.
  const blockChance = type === 'extraPoint' ? 0.03 : THREE.MathUtils.clamp((distance - 25) * 0.004, 0.02, 0.12)
  const blocked = Math.random() < blockChance
  if (blocked) made = false

  // Send the ball on a visible arc toward the uprights; the outcome is settled
  // once it lands (see updateKickFlight / settleKick). A blocked kick knuckles
  // low into the rush a few yards past the line instead.
  const goalZ = OPPONENT_GOAL_LINE_Z - 10
  const from = new THREE.Vector3(0, 0.35, state.cameraZ - 1.4)
  let to: THREE.Vector3
  let apex: number
  let dur: number
  if (blocked) {
    to = new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * randomBetween(1.5, 4.5), 1, state.cameraZ - 8.5)
    apex = 2.6
    dur = 0.5
  } else {
    // The uprights sit at x = ±9.25 (see createGoalPost in world.ts) — a missed
    // kick has to clear that width, or it visually sails through the posts
    // while still being scored a miss, which reads as a bug, not a bad kick.
    const wide = made ? randomBetween(-1.1, 1.1) : (Math.random() < 0.5 ? -1 : 1) * randomBetween(9.8, 14)
    const shortBy = made ? 0 : (Math.random() < 0.35 ? randomBetween(10, 22) : 0)
    to = new THREE.Vector3(wide, made ? 9 : shortBy ? 2.5 : 8.4, goalZ + shortBy)
    apex = Math.max(from.y, to.y) + THREE.MathUtils.clamp(distance * 0.14, 5, 11)
    dur = THREE.MathUtils.clamp(distance * 0.028, 1, 2)
  }
  const ctrl = new THREE.Vector3((from.x + to.x) / 2, apex, (from.z + to.z) / 2)
  state.kickFlight = { t: 0, dur, from, ctrl, to, type, distance, made, blocked }
  balls.player.visible = false
  balls.thrown.visible = true
  balls.thrown.position.copy(from)
  statusText.textContent = 'The kick is up…'
}

function resolvePunt() {
  // Punt blocks are rare — the rush mostly just applies pressure to the timing.
  const blocked = Math.random() < 0.02
  const from = new THREE.Vector3(0, 0.35, state.cameraZ - 1.4)
  let to: THREE.Vector3
  let apex: number
  let dur: number
  let netYards = 0
  if (blocked) {
    to = new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * randomBetween(1.5, 4.5), 1, state.cameraZ - 8.5)
    apex = 2.6
    dur = 0.5
  } else {
    // Same timing meter as a field goal — a kick right on the sweet spot
    // (power 54) drives it deep downfield instead of through the uprights.
    netYards = Math.max(15, Math.round(puntNetYards(state.kickPower) + randomBetween(-5, 5)))
    const landingYard = Math.min(100, state.ballOn + netYards)
    to = new THREE.Vector3(randomBetween(-3, 3), 0.4, losZ(landingYard))
    apex = THREE.MathUtils.clamp(netYards * 0.35, 9, 20)
    dur = THREE.MathUtils.clamp(netYards * 0.045, 1.6, 3.2)
  }
  const ctrl = new THREE.Vector3((from.x + to.x) / 2, apex, (from.z + to.z) / 2)
  state.kickFlight = { t: 0, dur, from, ctrl, to, type: 'punt', distance: netYards, made: !blocked, blocked }
  balls.player.visible = false
  balls.thrown.visible = true
  balls.thrown.position.copy(from)
  statusText.textContent = 'The punt is up…'
}

function resolveKickoff() {
  const from = new THREE.Vector3(0, 0.35, state.cameraZ - 1.4)
  let landingYard: number
  let recovered = true
  if (state.onsideKick) {
    // Onside kicks only have to travel 10 yards before either team can
    // legally recover them — the timing meter decides who gets there first.
    landingYard = Math.min(100, state.ballOn + 10)
    recovered = Math.random() < onsideRecoverChance(state.kickPower)
  } else {
    landingYard = Math.min(100, state.ballOn + kickoffNetYards(state.kickPower))
  }
  const to = new THREE.Vector3(randomBetween(-3, 3), 0.4, losZ(landingYard))
  const netTravel = Math.max(10, landingYard - state.ballOn)
  const apex = state.onsideKick ? 3.5 : THREE.MathUtils.clamp(netTravel * 0.32, 9, 20)
  const dur = state.onsideKick ? 0.7 : THREE.MathUtils.clamp(netTravel * 0.045, 1.6, 3.2)
  const ctrl = new THREE.Vector3((from.x + to.x) / 2, apex, (from.z + to.z) / 2)
  state.kickFlight = { t: 0, dur, from, ctrl, to, type: 'kickoff', distance: landingYard, made: recovered, blocked: false }
  balls.player.visible = false
  balls.thrown.visible = true
  balls.thrown.position.copy(from)
  // A real kickoff (not the onside scramble) hands you control right away —
  // you're a member of the coverage unit now, sprinting downfield alongside
  // real teammates the instant it's kicked, not a lone camera over an empty
  // field. The return team is already down there waiting on the ball too,
  // same as a real NFL kickoff — nobody is conjured up once it lands.
  if (state.onsideKick) {
    statusText.textContent = "Onside kick — it's a scramble!"
    return
  }
  // Your coverage line is already standing there from startKick — just turn
  // the pre-kick lineup loose downfield instead of spawning a second one.
  for (const t of teammates) {
    t.speed = randomBetween(12.5, 14.5)
  }
  // A touchback never gets returned, so there's no return unit to put on the
  // field for it — just your coverage sprinting down to a dead ball.
  if (landingYard < 100) {
    const opponentTeam = TEAMS[state.opponentTeam]
    for (let index = 0; index < 7; index += 1) {
      const x = index === 0 ? randomBetween(-6, 6) : randomBetween(-16, 16)
      const z = to.z + (index === 0 ? 0 : randomBetween(4, 14))
      const returnMan = createDefender(x, z, index === 0 ? opponentTeam.accent : opponentTeam.primary, 10 + index, opponentTeam.id, index === 0)
      returnMan.speed = index === 0 ? 13.5 : 11
    }
  }
  state.possession = 'defense'
  state.running = true
  state.ballCarrier = null
  state.playTime = 0
  state.playerBlockedUntil = 0
  state.stamina = 1
  state.gassed = false
  state.prevDirection = 0
  state.playerVX = 0
  state.playerVZ = 0
  state.footstepTimer = 0
  state.snapDownText = 'Kickoff'
  state.snapYardsText = 'Ball in the air'
  statusText.textContent = 'Kickoff away — sprint downfield! WASD to run, Shift or Space to turn on the jets.'
}

export function updateKickFlight(delta: number) {
  const k = state.kickFlight
  if (!k) return
  k.t += delta
  const p = Math.min(1, k.t / k.dur)
  const m = 1 - p
  // Quadratic Bezier: tee -> apex -> uprights.
  balls.thrown.position.set(
    m * m * k.from.x + 2 * m * p * k.ctrl.x + p * p * k.to.x,
    m * m * k.from.y + 2 * m * p * k.ctrl.y + p * p * k.to.y,
    m * m * k.from.z + 2 * m * p * k.ctrl.z + p * p * k.to.z,
  )
  balls.thrown.rotation.x += delta * 12
  // The opponent's own kickoff coverage sprints toward you while you're only
  // spectating the flight (no control until startUserReturn hands you the
  // ball) — see the coverage line spawned in simulateOpponentKickoff.
  if (k.type === 'kickoff' && state.opponentKicking) {
    for (const d of defenders) {
      d.z += d.speed * delta * MOVE_SCALE
      d.mesh.position.set(d.x, Math.abs(Math.sin(performance.now() * 0.012 + d.runPhase)) * 0.08, d.z)
      d.mesh.rotation.z = Math.sin(performance.now() * 0.012 + d.runPhase) * 0.035
    }
  }
  if (p >= 1) {
    balls.thrown.visible = false
    const done = k
    state.kickFlight = null
    settleKick(done.type, done.distance, done.made, done.blocked)
  }
}

function settleKick(type: KickType, distance: number, made: boolean, blocked = false) {
  // The rush has done its job either way — clear it off the field.
  clearKickBlockers()
  if (type === 'punt') {
    settlePunt(distance, blocked)
    return
  }
  if (type === 'kickoff') {
    if (state.opponentKicking) settleOpponentKickoffFlight(distance, made)
    else settleKickoffFlight(distance, made)
    return
  }
  if (type === 'extraPoint') {
    if (made) {
      state.score = addPoints(state.score, 1)
      statusText.textContent = `EXTRA POINT IS GOOD. You lead ${state.score}-${state.opponentScore}.`
    } else {
      statusText.textContent = blocked ? 'The extra point is BLOCKED — no good!' : 'Extra point is NO GOOD.'
    }
    afterPatResolved()
    return
  }
  if (made) {
    state.score = addPoints(state.score, 3)
    statusText.textContent = `${distance}-YARD FIELD GOAL IS GOOD! You lead ${state.score}-${state.opponentScore}.`
    updateHud()
    if (state.quarter >= 5) {
      schedule(endGame, 1600)
      return
    }
    schedule(() => kickoff('defense'), 1500)
    return
  }
  // Missed or blocked: opponent takes over at the spot of the hold, but no
  // closer than their 20.
  const oppYard = Math.max(20, 108 - state.ballOn)
  giveBallToOpponent(oppYard, blocked
    ? `The ${distance}-yard field goal is BLOCKED! Opponent takes over.`
    : `${distance}-yard field goal is NO GOOD. Opponent takes over.`)
}

function attemptPunt() {
  state.running = false
  playCall.classList.add('is-hidden')
  startKick('punt', 0)
}

function settlePunt(netYards: number, blocked: boolean) {
  if (blocked) {
    // Blocked right at the line of scrimmage — the return team recovers it
    // almost exactly where it was kicked from.
    giveBallToOpponent(opponentYardAfterTurnover(state.ballOn), 'The punt is BLOCKED! Opponent recovers the ball.')
    return
  }
  const landingYard = Math.min(100, state.ballOn + netYards)
  if (landingYard >= 100) {
    giveBallToOpponent(20, `${netYards}-yard punt into the end zone — touchback. Opponent ball on their 20.`)
    return
  }
  giveBallToOpponent(100 - landingYard, `${netYards}-yard punt to the ${describeSpot(landingYard)} — it's being returned!`, 'punt')
}

function kneelDown() {
  playCall.classList.add('is-hidden')
  state.gameClock = Math.max(0, state.gameClock - 40)
  gainTo(Math.max(1, state.ballOn - 1), 'Quarterback kneel — clock runs.', false)
}

export function turnOverOnDowns() {
  if (state.twoPointActive) {
    resolveTwoPoint(false)
    return
  }
  state.running = false
  const oppYard = opponentYardAfterTurnover(state.ballOn)
  statusText.textContent = 'TURNOVER ON DOWNS — get ready to play defense!'
  updateHud()
  schedule(() => startDefensiveSeries(defensiveSpotZ(oppYard), null), 1200)
}

function scoreTouchdown() {
  state.running = false
  state.score = addPoints(state.score, 6)
  signalReferees('touchdown')
  celebrateTouchdown()
  updateHud()
  // Overtime is sudden death — reaching the end zone ends it on the spot.
  if (state.quarter >= 5) {
    statusText.textContent = `TOUCHDOWN! You win it in overtime, ${state.score}-${state.opponentScore}.`
    schedule(endGame, 1500)
    return
  }
  releaseMouse()
  statusText.textContent = `TOUCHDOWN! You lead ${state.score}-${state.opponentScore}. Kick the extra point, or go for two?`
  schedule(showPatChoice, 900)
}

function showPatChoice() {
  if (state.gameOver) return
  playCall.classList.add('is-hidden')
  defenseCall.classList.add('is-hidden')
  patCall.classList.remove('is-hidden')
}

// Kick off to the opponent once the point-after is settled (or end an OT game).
function afterPatResolved() {
  updateHud()
  if (state.quarter >= 5) {
    schedule(endGame, 1600)
    return
  }
  schedule(() => kickoff('defense'), 1500)
}

// Go for two: play it out as a live snap from the 2. Pick a play, then get the
// ball into the end zone — anything else is no good.
export function goForTwo() {
  patCall.classList.add('is-hidden')
  state.twoPointActive = true
  state.possession = 'offense'
  state.ballCarrier = null
  state.ballOn = 98
  state.firstDownTarget = 100
  state.down = 1
  state.cameraZ = losZ(state.ballOn)
  state.playTab = 'pass'
  state.selectedPlay = null
  state.throwing = false
  state.afterCatch = false
  state.playClock = PLAY_CLOCK_SECONDS
  state.lastPlayStoppedClock = true
  statusText.textContent = 'Going for two — pick a play and get it into the end zone.'
  renderPlayOptions()
  playCall.classList.remove('is-hidden')
  updateHud()
}

// Settle a two-point try and move on to the kickoff (or end an OT game).
function resolveTwoPoint(scored: boolean) {
  state.twoPointActive = false
  state.running = false
  releaseMouse()
  playCall.classList.add('is-hidden')
  if (scored) {
    state.score = addPoints(state.score, 2)
    statusText.textContent = `TWO-POINT CONVERSION IS GOOD! You lead ${state.score}-${state.opponentScore}.`
  } else {
    statusText.textContent = 'The two-point try comes up short — no good.'
  }
  updateHud()
  afterPatResolved()
}

// Ends a defensive down that stayed a dead ball at some spot: a run tackle by
// default, but also reused for a sack or an incomplete/broken-up pass by
// passing an explicit spot and label instead of reading state.ballCarrier.
// `stopClock` mirrors gainTo's clockStops flag for the offense — pass true for
// anything that's dead by rule (out of bounds, an incomplete/broken-up pass);
// left false (the default), the clock keeps running into the next snap, same
// as a real tackle in the field of play.
export function finishDefensivePlay(tackled: boolean, opts?: { spotZ?: number; label?: string; allowFumble?: boolean; stopClock?: boolean }) {
  state.running = false
  const wasReturn = state.isReturnPlay
  state.isReturnPlay = false
  if (tackled) {
    const spotZ = opts?.spotZ ?? state.ballCarrier?.z ?? state.defenseFirstDownZ
    const label = opts?.label ?? 'TACKLE!'
    const allowFumble = opts?.allowFumble ?? true
    const stopClock = opts?.stopClock ?? false
    // Punch it out: a takeaway that hands the ball straight to your offense.
    if (allowFumble && Math.random() < 0.05) {
      state.lastPlayStoppedClock = true
      statusText.textContent = `FORCED FUMBLE — takeaway! Your offense has it on the ${describeSpot(ballOnFromZ(spotZ))}.`
      updateHud()
      schedule(() => resetDrive(spotZ), 1300)
      return
    }
    // A return ends the moment the whistle blows — the tackle spot becomes a
    // fresh 1st & 10 for the opponent, not another down in an existing series.
    if (wasReturn) {
      state.lastPlayStoppedClock = stopClock
      statusText.textContent = `${label} Opponent starts their drive on the ${describeSpot(ballOnFromZ(spotZ))}.`
      updateHud()
      schedule(() => startDefensiveSeries(spotZ, null, true), 1200)
      return
    }
    const earnedFirstDown = spotZ - state.defenseFirstDownZ >= 10
    if (earnedFirstDown) {
      state.lastPlayStoppedClock = stopClock
      state.defenseDown = 1
      state.defenseFirstDownZ = spotZ
      signalReferees('firstDown')
      statusText.textContent = `${label} Opponent moved the chains — 1st & 10 on the ${describeSpot(ballOnFromZ(spotZ))}.`
      updateHud()
      schedule(() => startDefensiveSeries(spotZ, null, false), 1200)
      return
    }
    state.lastPlayStoppedClock = stopClock
    state.defenseDown += 1
    if (state.defenseDown <= 4) {
      const togo = Math.max(1, Math.ceil(state.defenseFirstDownZ + 10 - spotZ))
      statusText.textContent = `${label} Opponent faces ${ordinal(state.defenseDown)} & ${togo} on the ${describeSpot(ballOnFromZ(spotZ))}.`
      updateHud()
      schedule(() => startDefensiveSeries(spotZ, null, false), 1200)
      return
    }
    statusText.textContent = `TURNOVER ON DOWNS! Your offense takes over on the ${describeSpot(ballOnFromZ(spotZ))}.`
    updateHud()
    schedule(() => resetDrive(spotZ), 1200)
    return
  }
  state.opponentScore = addPoints(state.opponentScore, 6)
  signalReferees('touchdown')
  const patGood = Math.random() < 0.94
  if (patGood) state.opponentScore = addPoints(state.opponentScore, 1)
  statusText.textContent = `OPPONENT TOUCHDOWN — extra point ${patGood ? 'good' : 'no good'}. They lead ${state.opponentScore}-${state.score}.`
  updateHud()
  if (state.quarter >= 5) {
    schedule(endGame, 1600)
    return
  }
  schedule(() => kickoff('offense'), 1500)
}

// An interception: the play is dead on the spot and possession flips straight
// to your offense, same as a fumble recovery.
export function interceptPass(spotZ: number) {
  state.running = false
  state.lastPlayStoppedClock = true
  statusText.textContent = `INTERCEPTED! Your offense takes over on the ${describeSpot(ballOnFromZ(spotZ))}.`
  updateHud()
  schedule(() => resetDrive(spotZ), 1400)
}

// A sack that drives the QB back into his own end zone — the NFL rule: the
// defense scores 2, and the team that gave it up has to free-kick it away.
export function defensiveSafety() {
  state.running = false
  state.score = addPoints(state.score, 2)
  statusText.textContent = `SAFETY! You sacked the QB in the end zone — you lead ${state.score}-${state.opponentScore}.`
  updateHud()
  if (state.quarter >= 5) {
    schedule(endGame, 1600)
    return
  }
  schedule(() => kickoff('offense'), 1500)
}

function resetDrive(startZ = USER_TWENTY_Z) {
  startAudio()
  if (state.gameOver) return
  releaseMouse()
  state.ballOn = ballOnFromZ(startZ)
  state.firstDownTarget = Math.min(state.ballOn + 10, 100)
  state.down = 1
  state.playerX = 0
  state.cameraZ = losZ(state.ballOn)
  state.possession = 'offense'
  state.ballCarrier = null
  state.running = false
  state.playTime = 0
  state.selectedPlay = null
  state.throwing = false
  state.afterCatch = false
  state.passTime = 0
  state.passTarget = null
  state.playClock = PLAY_CLOCK_SECONDS
  state.lastPlayStoppedClock = true
  state.clockEventHandled = false
  buildDefense()
  clearKickBlockers()
  while (linemen.length) world.remove(linemen.pop()!.mesh)
  while (receivers.length) world.remove(receivers.pop()!.mesh)
  while (teammates.length) world.remove(teammates.pop()!.mesh)
  balls.player.visible = true
  balls.thrown.visible = false
  defenseCall.classList.add('is-hidden')
  playCall.classList.remove('is-hidden')
  statusText.textContent = `Your ball — 1st & 10 on the ${describeSpot(state.ballOn)}. Choose a play.`
  updateHud()
  state.footstepTimer = 0
}

function lineUpForSnap() {
  state.playerX = 0
  state.passTarget = null
  balls.player.visible = true
  balls.thrown.visible = false
  camera.position.set(0, EYE_HEIGHT, state.cameraZ)
  resetView()
  playerView.position.x = 0
  playerView.rotation.z = 0
  buildDefense()
  buildOffensiveLine()
  spawnReferees(state.cameraZ)
}

export function renderPlayOptions() {
  playOptions.innerHTML = ''
  for (const play of OFFENSE_PLAYBOOK.filter((entry) => entry.tab === state.playTab)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.innerHTML = `<strong>${play.name}</strong><span>${play.blurb}</span>`
    button.addEventListener('click', () => startPlay(play.id))
    playOptions.appendChild(button)
  }
  for (const tab of playTabs.querySelectorAll<HTMLButtonElement>('button')) {
    tab.classList.toggle('is-active', tab.dataset.tab === state.playTab)
    // Hide the Special Teams tab during a two-point try.
    if (tab.dataset.tab === 'special') tab.hidden = state.twoPointActive
  }
}

export function renderDefenseOptions() {
  defenseOptions.innerHTML = ''
  for (const call of DEFENSE_PLAYBOOK) {
    const button = document.createElement('button')
    button.type = 'button'
    button.innerHTML = `<strong>${call.name}</strong><span>${call.blurb}</span>`
    button.addEventListener('click', () => snapDefense(call.id))
    defenseOptions.appendChild(button)
  }
}

// The player picks a defensive call, which sets pursuit tuning, then the ball is snapped.
function snapDefense(call: DefenseCall) {
  if (state.gameOver || state.possession !== 'defense') return
  // The game clock has already been ticking in real time through the defense
  // menu (tickClocks) if the last play didn't stop it — nothing to run off here.
  state.lastPlayStoppedClock = false
  state.defenseCall = call
  defenseCall.classList.add('is-hidden')
  state.playTime = 0
  state.running = true
  state.bigPlayAllowed = true
  state.carrierNextJuke = 1
  state.stamina = 1
  state.gassed = false
  // Freeze the marker at the pre-snap spot for the duration of the play.
  const snapZ = state.ballCarrier?.z ?? state.defenseSnapZ
  const snapTogo = Math.max(1, Math.ceil(state.defenseFirstDownZ + 10 - snapZ))
  state.snapDownText = `${ordinal(Math.min(state.defenseDown, 4))} & ${snapTogo}`
  state.snapYardsText = describeSpot(ballOnFromZ(snapZ))
  const cfg: Record<DefenseCall, { radius: number; teamSpeed: number; carrierMul: number; blitzers: number }> = {
    base: { radius: 1.7, teamSpeed: 13, carrierMul: 1, blitzers: 0 },
    blitz: { radius: 1.9, teamSpeed: 14.5, carrierMul: 1.12, blitzers: 2 },
    cover2: { radius: 1.6, teamSpeed: 12, carrierMul: 0.9, blitzers: 0 },
    goalline: { radius: 2.3, teamSpeed: 14, carrierMul: 0.95, blitzers: 1 },
    spy: { radius: 1.8, teamSpeed: 13, carrierMul: 1, blitzers: 1 },
    nickel: { radius: 1.5, teamSpeed: 13.5, carrierMul: 1.08, blitzers: 0 },
    zoneBlitz: { radius: 1.8, teamSpeed: 14, carrierMul: 1.05, blitzers: 3 },
    prevent: { radius: 1.6, teamSpeed: 11.5, carrierMul: 0.85, blitzers: 0 },
  }
  const c = cfg[call]
  state.defTackleRadius = c.radius
  state.defCarrierSpeedMul = c.carrierMul
  teammates.forEach((teammate, index) => {
    teammate.speed = c.teamSpeed
    teammate.role = call === 'spy' && index === 0 ? 'spy' : 'man'
  })
  // On a pass play, assign each teammate to man-cover a receiver — except the
  // defensive call's blitzers, who rush the passer instead (coverIndex -1).
  if (state.oppPassPlayActive) {
    const receiverCount = Math.max(1, defenders.filter((d) => d.isReceiver).length)
    teammates.forEach((teammate, index) => {
      teammate.coverIndex = index < c.blitzers ? -1 : (index - c.blitzers) % receiverCount
    })
  }
  statusText.textContent = `${DEFENSE_PLAYBOOK.find((d) => d.id === call)?.name} versus ${state.opponentPlay} — ${
    state.oppPassPlayActive ? 'cover your man and watch for the throw!' : 'meet the runner and make the tackle!'
  }`
  updateHud()
}

// The play clock ran out on the defense menu — a delay-of-game equivalent
// against the defense, same 5-yard penalty as the offense's own delay of
// game, just in the other direction: it hands the yardage to the opponent's
// offense. The down is replayed (not advanced), with a fresh random
// opponent call and a full play clock, same as any other re-huddle.
function autoPickDefense() {
  state.playClock = PLAY_CLOCK_SECONDS
  if (state.gameOver || state.possession !== 'defense' || defenseCall.classList.contains('is-hidden')) return
  const spotYard = ballOnFromZ(state.defenseSnapZ)
  const penalizedYard = Math.max(1, spotYard - 5)
  startDefensiveSeries(losZ(penalizedYard), null, false)
  statusText.textContent = `Defense not set in time — 5-yard penalty. ${statusText.textContent}`
  showPenaltyFlag('Defense Delay · 5 yards')
  updateHud()
}

// Switch control to whichever of your teammates is nearest the action (the
// ball carrier, the pass target, or the QB before the snap) — like tapping the
// player-switch button in an NFL game. The teammate you leave behind picks up
// right where you were standing and keeps pursuing as AI.
export function switchDefender() {
  if (state.gameOver || state.possession !== 'defense' || !state.running || teammates.length === 0) return
  const focus = state.ballCarrier ?? state.oppPassTarget ?? state.oppQB
  const targetX = focus?.x ?? state.playerX
  const targetZ = focus?.z ?? state.cameraZ
  let bestIndex = 0
  let bestDist = Infinity
  teammates.forEach((teammate, index) => {
    const dist = Math.hypot(teammate.x - targetX, teammate.z - targetZ)
    if (dist < bestDist) {
      bestDist = dist
      bestIndex = index
    }
  })
  const chosen = teammates[bestIndex]
  const prevX = state.playerX
  const prevZ = state.cameraZ
  state.playerX = chosen.x
  state.cameraZ = chosen.z
  camera.position.set(state.playerX, EYE_HEIGHT, state.cameraZ)
  aimCamera()
  playerView.position.x = 0
  chosen.x = prevX
  chosen.z = prevZ
  chosen.mesh.position.set(prevX, 0, prevZ)
  statusText.textContent = 'Switched to the nearest defender!'
}

export function startPlay(play: PlayId) {
  startAudio()
  if (state.gameOver || (!state.running && state.possession !== 'offense')) return
  // No special teams on a two-point try — it's a run/pass snap from the 2.
  if (state.twoPointActive && (play === 'fieldGoal' || play === 'punt' || play === 'kneel')) return
  if (play === 'fieldGoal') { attemptFieldGoal(); return }
  if (play === 'punt') { attemptPunt(); return }
  if (play === 'kneel') { kneelDown(); return }
  const runId = isRunId(play)
  // The game clock has already been ticking in real time through the play-call
  // menu (tickClocks) if the last play didn't stop it — nothing to run off here.
  state.lastPlayStoppedClock = false
  state.selectedPlay = play
  state.playTime = 0
  state.running = true
  state.throwing = false
  state.afterCatch = false
  state.returning = false
  state.snapZ = state.cameraZ
  state.prevDirection = 0
  state.playerVX = 0
  state.playerVZ = 0
  state.pressureAnnounced = false
  state.sacked = false
  state.stamina = 1
  state.gassed = false
  state.passContested = false
  state.passPickable = false
  state.passPI = false
  // Snapshot the down & distance so the HUD stays put until this play is over.
  state.snapDownText = downAndDistance()
  state.snapYardsText = describeSpot(state.ballOn)
  lineUpForSnap()
  if (runId) {
    while (receivers.length) world.remove(receivers.pop()!.mesh)
    // Each run differs by where you start and how long before you can accelerate.
    const startX: Record<RunPlayId, number> = { iso: 0, offtackle: 5, toss: 12, draw: 0, counter: -5, stretch: 8 }
    const delay: Record<RunPlayId, number> = { iso: 0, offtackle: 0.2, toss: 0.4, draw: 0.7, counter: 0.5, stretch: 0.25 }
    state.playerX = startX[play]
    state.runDelay = delay[play]
  } else {
    state.runDelay = 0
    buildReceivers(play)
  }
  assignPassProtection(runId, play === 'paPost' || play === 'draw' || play === 'digs')
  playCall.classList.add('is-hidden')
  const label = OFFENSE_PLAYBOOK.find((p) => p.id === play)?.name ?? 'Play'
  statusText.textContent = runId
    ? `${label} — ${downAndDistance()}. A / D to find a lane, Shift or Space to sprint.`
    : `${label} — ${downAndDistance()}. Click a glowing receiver or press 1, 2, 3. Q throws it away.`
  updateHud()
}

// Pair each blocker with the nearest rusher and set how long the pocket holds.
function assignPassProtection(isRun: boolean, longHold = false) {
  const rushers = defenders.filter((d) => d.role === 'rush')
  const claimed = new Set<Defender>()
  const holdMin = longHold ? 3 : 2.2
  const holdMax = longHold ? 4.6 : 3.8
  for (const lineman of linemen) {
    let best: Defender | null = null
    let bestDist = Infinity
    for (const r of rushers) {
      if (claimed.has(r)) continue
      const dist = Math.abs(r.x - lineman.startX)
      if (dist < bestDist) {
        bestDist = dist
        best = r
      }
    }
    lineman.assignment = best
    if (best) {
      claimed.add(best)
      // Runs get a quick hold; pass sets hold ~2.2-3.8s before the rusher sheds.
      best.blockedUntil = isRun ? randomBetween(0.6, 1.2) : randomBetween(holdMin, holdMax)
    }
  }
  // Any unblocked rusher comes free almost immediately.
  for (const r of rushers) {
    if (!claimed.has(r)) r.blockedUntil = randomBetween(0.5, 1.1)
  }
}

export function updateHud() {
  scoreEl.textContent = String(state.score)
  opponentScoreEl.textContent = String(state.opponentScore)
  opponentLabelEl.textContent = TEAMS[state.opponentTeam].abbr
  oppChipEl.style.background = cssHex(TEAMS[state.opponentTeam].primary)
  quarterEl.textContent = state.quarter >= 5 ? 'OT' : ordinal(state.quarter)
  clockEl.textContent = formatClock(state.gameClock)
  timeoutsUserEl.textContent = String(state.timeoutsUser)
  timeoutsOpponentEl.textContent = String(state.timeoutsOpponent)
  // Only offer a timeout when it would actually do something: between plays,
  // with one to spend, and the clock actually ticking toward the next snap —
  // the huddle. The defense-call menu never has the clock running (see
  // tickClocks), so a timeout there wouldn't stop anything and isn't offered.
  const canCallTimeout = !state.gameOver && !state.running && !state.twoPointActive &&
    state.timeoutsUser > 0 && !state.lastPlayStoppedClock && !playCall.classList.contains('is-hidden')
  timeoutPanel.classList.toggle('is-hidden', !canCallTimeout)
  updateScoreboard()
  // While a play is live the marker holds at the snap value; it updates only
  // after the whistle, when the ball is spotted where the play ended.
  if (state.running) {
    yardsLabelEl.textContent = state.possession === 'defense' ? 'Opp ball on' : 'Ball on'
    yardsEl.textContent = state.snapYardsText
    downEl.textContent = state.snapDownText
    return
  }
  if (state.possession === 'defense') {
    const carrierZ = state.ballCarrier?.z ?? state.defenseSnapZ
    const togo = Math.max(1, Math.ceil(state.defenseFirstDownZ + 10 - carrierZ))
    yardsLabelEl.textContent = 'Opp ball on'
    yardsEl.textContent = describeSpot(ballOnFromZ(carrierZ))
    downEl.textContent = `${ordinal(Math.min(state.defenseDown, 4))} & ${togo}`
    return
  }
  yardsLabelEl.textContent = 'Ball on'
  yardsEl.textContent = describeSpot(state.ballOn)
  downEl.textContent = downAndDistance()
}

export function finishRunPlay() {
  state.selectedPlay = null
  const wasAfterCatch = state.afterCatch
  state.afterCatch = false
  // playerX is free to run all the way to the real sideline (±SIDELINE_X) —
  // this only trips once you actually get there, not at some earlier cap.
  const outOfBounds = Math.abs(state.playerX) >= OUT_OF_BOUNDS_X
  const spotYard = ballOnFromZ(state.cameraZ)
  // A return ends the instant you're down — it isn't a down in a drive, so
  // wherever you end up becomes a fresh 1st & 10 instead of advancing downs.
  if (state.returning) {
    state.returning = false
    state.running = false
    if (state.sprinting && !outOfBounds && spotYard < 99 && Math.random() < 0.045) {
      if (Math.random() < 0.5) {
        giveBallToOpponent(100 - spotYard, 'FUMBLED RETURN — opponent recovers!')
        return
      }
      statusText.textContent = 'FUMBLE — but you recover your own return!'
      updateHud()
      schedule(() => resetDrive(losZ(spotYard)), 1300)
      return
    }
    statusText.textContent = outOfBounds ? 'Out of bounds — your drive starts here.' : 'Tackled! Your drive starts here.'
    updateHud()
    // resetDrive always marks the clock stopped (right for a touchback or a
    // turnover); a return that's tackled in the field of play should instead
    // keep running into the next snap, same as any other in-bounds tackle.
    schedule(() => {
      resetDrive(losZ(spotYard))
      state.lastPlayStoppedClock = outOfBounds
    }, 1200)
    return
  }
  // Taking a hit at full sprint in the field of play can jar the ball loose —
  // the price of running with the sprint button held down.
  if (state.sprinting && !outOfBounds && spotYard < 99 && Math.random() < 0.045) {
    state.running = false
    if (Math.random() < 0.5) {
      giveBallToOpponent(100 - spotYard, 'FUMBLE — the defense falls on it!')
      return
    }
    gainTo(spotYard, 'FUMBLE — but you recover your own ball!', true)
    return
  }
  gainTo(spotYard, outOfBounds ? 'Out of bounds.' : wasAfterCatch ? 'Tackled after the catch.' : 'Tackled.', outOfBounds)
}

export function sack() {
  if (!state.running) return
  state.selectedPlay = null
  state.sacked = true
  gainTo(ballOnFromZ(state.cameraZ), 'Sacked!', false)
}

export function throwAway() {
  if (!state.running || state.throwing || state.afterCatch || isRunId(state.selectedPlay) || state.possession !== 'offense') return
  playThrow()
  state.running = false
  state.lastPlayStoppedClock = true
  state.down += 1
  if (state.down > 4) {
    turnOverOnDowns()
    return
  }
  offensiveMenu('Thrown away.')
}

export function tickClocks(delta: number) {
  if (state.gameOver) return
  // The two-point try, like a PAT, is untimed.
  if (state.twoPointActive) return
  const offenseMenuOpen = !playCall.classList.contains('is-hidden')
  // The game clock runs during a live play, and — same as the real NFL —
  // keeps right on running through the offense's huddle/play-call menu,
  // whenever the last play didn't stop it (an in-bounds tackle or a caught,
  // in-bounds pass), only stopping for an incomplete pass, an out-of-bounds
  // play, a score, a penalty, a timeout, or the two-minute warning. The
  // defense-call menu is the human taking their time to pick a call, not
  // part of the simulated game clock, so it never runs while that's up.
  if (state.running || (offenseMenuOpen && !state.lastPlayStoppedClock)) {
    state.gameClock = Math.max(0, state.gameClock - delta)
    if (state.running) state.clockStopChecked = false
    if (
      !state.twoMinuteWarningGiven && !state.twoMinuteWarningPending &&
      (state.quarter === 2 || state.quarter === 4 || state.quarter >= 5) &&
      state.gameClock <= 120
    ) {
      if (state.running) {
        // Noted the instant it crosses 2:00 mid-play; takes effect once this
        // play is over, same as a real stoppage.
        state.twoMinuteWarningPending = true
      } else {
        // Already between snaps with the clock running — the warning applies
        // immediately, same as it stopping a running clock in real life.
        state.twoMinuteWarningGiven = true
        state.lastPlayStoppedClock = true
        statusText.textContent = `TWO-MINUTE WARNING. ${statusText.textContent}`
        updateHud()
      }
    }
  }
  if (state.running) return
  // Between plays the play clock winds down while the play-call menu is open.
  if (!playCall.classList.contains('is-hidden')) {
    state.playClock = Math.max(0, state.playClock - delta)
    playCallKicker.textContent = `Offense · ${downAndDistance()} · Play clock ${Math.ceil(state.playClock)}`
    if (state.playClock <= 0) delayOfGame()
  }
  // Same play clock, ticking against the defense while you're picking a
  // coverage call instead of a play — run out of time and the defense snaps
  // into a base call for you, same spirit as the offense's delay of game.
  if (!defenseCall.classList.contains('is-hidden')) {
    state.playClock = Math.max(0, state.playClock - delta)
    defenseKicker.textContent = `${state.defenseKickerBase} · Play clock ${Math.ceil(state.playClock)}`
    if (state.playClock <= 0) autoPickDefense()
  }
  // Evaluated exactly once per dead-ball stoppage (reset the instant the
  // next play goes live, above) — never repeated across frames spent
  // sitting on a menu, since the opponent's timeout use below is a roll.
  if (!state.clockStopChecked) {
    state.clockStopChecked = true
    if (state.twoMinuteWarningPending) {
      // Was noted mid-play (above); takes effect now that the ball is dead.
      state.twoMinuteWarningPending = false
      state.twoMinuteWarningGiven = true
      state.lastPlayStoppedClock = true
      statusText.textContent = `TWO-MINUTE WARNING. ${statusText.textContent}`
      updateHud()
    } else if (
      state.quarter >= 4 && !state.lastPlayStoppedClock && state.timeoutsOpponent > 0 &&
      state.opponentScore < state.score && state.gameClock > 0 && state.gameClock < 120 &&
      Math.random() < 0.7
    ) {
      // Mirrors a trailing real-NFL team burning a timeout late to keep the
      // clock (and their own hopes) alive.
      state.timeoutsOpponent -= 1
      state.lastPlayStoppedClock = true
      statusText.textContent = `Opponent calls a timeout. ${statusText.textContent}`
      updateHud()
    }
  }
  // A quarter that expired mid-play, or between plays with the clock still
  // running, is resolved the instant it hits zero.
  if (state.gameClock <= 0 && !state.clockEventHandled) {
    handleClockExpired()
  }
}

// The offense's own timeout: available from the play-call or defense-call
// menu whenever the clock is still running toward the next snap. Stops it
// and spends one of your three per half (two in overtime), same as the NFL.
export function callTimeout() {
  if (state.gameOver || state.running || state.lastPlayStoppedClock || state.timeoutsUser <= 0) return
  state.timeoutsUser -= 1
  state.lastPlayStoppedClock = true
  statusText.textContent = `TIMEOUT. Clock stopped — ${state.timeoutsUser} left. ${statusText.textContent}`
  updateHud()
}

function delayOfGame() {
  state.playClock = PLAY_CLOCK_SECONDS
  if (state.possession !== 'offense' || state.gameOver) return
  state.ballOn = Math.max(1, state.ballOn - 5)
  state.cameraZ = losZ(state.ballOn)
  state.lastPlayStoppedClock = true
  statusText.textContent = `Delay of game — 5-yard penalty. ${downAndDistance()} on the ${describeSpot(state.ballOn)}.`
  showPenaltyFlag('Delay of Game · 5 yards')
  updateHud()
}
