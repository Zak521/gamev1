import * as THREE from 'three'
import {
  DEFENSE_PLAYBOOK,
  EYE_HEIGHT,
  INTER_PLAY_RUNOFF,
  OFFENSE_PLAYBOOK,
  OPPONENT_GOAL_LINE_Z,
  OT_SECONDS,
  PLAY_CLOCK_SECONDS,
  QUARTER_SECONDS,
  USER_TWENTY_Z,
  ballOnFromZ,
  clockEl,
  defenseCall,
  defenseKicker,
  defenseOptions,
  defenders,
  defensiveSpotZ,
  describeSpot,
  downAndDistance,
  downEl,
  formatClock,
  formatRecord,
  gameOverPanel,
  gameOverScore,
  gameOverTitle,
  isRunId,
  keys,
  kickFill,
  kickMeter,
  kickPrompt,
  linemen,
  loadSeason,
  losZ,
  opponentScoreEl,
  ordinal,
  patCall,
  playCall,
  playCallKicker,
  playOptions,
  playTabs,
  quarterEl,
  randomBetween,
  receivers,
  saveSeason,
  scoreEl,
  seasonRecordEl,
  staminaMeter,
  state,
  statusText,
  teammates,
  yardsEl,
  yardsLabelEl,
} from './core.ts'
import type { DefenseCall, Defender, KickType, PlayId, RunPlayId } from './core.ts'
import { camera, celebrateTouchdown, playerView, releaseMouse, resetView, startAudio, updateScoreboard, world } from './world.ts'
import {
  balls,
  buildDefense,
  buildOffensiveLine,
  buildReceivers,
  clearPlayers,
  createDefender,
  createLineman,
} from './entities.ts'

export function startDefensiveSeries(spotZ: number, isKickoff: boolean, newSeries = true) {
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
  // Runoff between opponent snaps if their last play kept the clock alive.
  if (!newSeries && !state.lastPlayStoppedClock && state.gameClock > INTER_PLAY_RUNOFF + 6) {
    state.gameClock = Math.max(0, state.gameClock - INTER_PLAY_RUNOFF)
  }
  state.lastPlayStoppedClock = false
  if (newSeries) {
    state.defenseStartZ = spotZ
    state.defenseFirstDownZ = spotZ
    state.defenseDown = 1
  }
  const opponentCalls = [
    { name: 'Inside Run', lane: 0, speed: 13.2 },
    { name: 'Sweep Right', lane: 14, speed: 14.1 },
    { name: 'Sweep Left', lane: -14, speed: 14.1 },
    { name: 'Draw Play', lane: randomBetween(-5, 5), speed: 12.5 },
  ]
  const opponentCall = opponentCalls[Math.floor(Math.random() * opponentCalls.length)]
  state.opponentPlay = opponentCall.name
  // Start on the defensive side and face the runner so every snap is a tackle attempt.
  state.cameraZ = Math.min(6, spotZ + 15)
  state.playerX = 0
  state.playerBlockedUntil = 0
  state.carrierJukeVX = 0
  state.carrierJukeUntil = 0
  state.carrierNextJuke = 1
  state.carrierLaneX = opponentCall.lane
  state.bigPlayAllowed = true
  balls.player.visible = false
  balls.thrown.visible = false

  // The opponent offense: a red ball carrier plus orange blockers who wall you off.
  for (let index = 0; index < 7; index += 1) {
    const x = index === 0 ? randomBetween(-10, 10) : randomBetween(-16, 16)
    const z = spotZ + (index === 0 ? 0 : 4 + index * 2.6)
    const opponent = createDefender(x, z, index === 0 ? 0xdc2626 : 0xf97316, 10 + index, index === 0)
    opponent.speed = index === 0 ? opponentCall.speed : 11
    if (index === 0) state.ballCarrier = opponent
  }
  // Your pursuit help, spread across the field a few yards ahead of you.
  for (let index = 0; index < 4; index += 1) {
    const t = createDefender((index - 1.5) * 9 + randomBetween(-2, 2), state.cameraZ + randomBetween(3, 9), 0x8b5cf6, 30 + index, false, teammates)
    t.role = 'man'
    t.speed = 13
  }
  camera.position.set(0, EYE_HEIGHT, state.cameraZ)
  resetView()
  playerView.position.x = 0
  playerView.rotation.z = 0
  playCall.classList.add('is-hidden')
  const togo = Math.max(1, Math.ceil(state.defenseFirstDownZ + 10 - spotZ))
  defenseKicker.textContent = newSeries
    ? `Opponent chose ${state.opponentPlay} · ball on the ${describeSpot(ballOnFromZ(spotZ))}`
    : `Opponent chose ${state.opponentPlay} · ${ordinal(state.defenseDown)} & ${togo}`
  statusText.textContent = isKickoff
    ? `Kickoff return: opponent picked ${state.opponentPlay}. Choose your defense, then make the tackle.`
    : `Opponent picked ${state.opponentPlay}. Choose your defense, then make the tackle.`
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

// Kick the ball to whichever side is receiving. Kickoffs are not played out;
// the receiving team simply starts a possession near its own 25.
function kickoff(receiving: 'offense' | 'defense') {
  state.clockEventHandled = false
  if (receiving === 'offense') {
    resetDrive(losZ(25))
  } else {
    startDefensiveSeries(defensiveSpotZ(25), true)
  }
}

function halftime() {
  state.quarter = 3
  state.gameClock = QUARTER_SECONDS
  state.playClock = PLAY_CLOCK_SECONDS
  state.clockEventHandled = false
  state.running = false
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
  if (state.quarter >= 4) {
    endGame()
    return
  }
  if (state.quarter === 2) {
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
  state.stamina = 1
  state.gassed = false
  kickMeter.classList.add('is-hidden')
  staminaMeter.classList.add('is-hidden')
  state.firstPossession = Math.random() < 0.5 ? 'offense' : 'defense'
  gameOverPanel.classList.add('is-hidden')
  playCall.classList.add('is-hidden')
  defenseCall.classList.add('is-hidden')
  patCall.classList.add('is-hidden')
  statusText.textContent = state.firstPossession === 'offense'
    ? 'You won the toss and will receive.'
    : 'Opponent won the toss and will receive.'
  schedule(() => kickoff(state.firstPossession), 900)
}

// Central down-and-distance advance for every way the offense can end a play.
export function gainTo(newBallOn: number, lead = '', clockStops = false) {
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
  state.opponentScore += 2
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
// as the opponent's own yard line (1-99 from their goal).
export function giveBallToOpponent(oppYard: number, message: string) {
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
  schedule(() => startDefensiveSeries(spot, false), 1500)
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
  // After a touchdown, spot the extra-point attempt at the 2-yard line.
  if (type === 'extraPoint') {
    state.ballOn = 98
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
  for (const [index, x] of [-7.2, -3.6, 0, 3.6, 7.2].entries()) {
    createLineman(x, state.cameraZ - 4.8, 70 + index)
  }
  // A second purple player beside the holder makes the extra-point unit feel set.
  createLineman(2.8, state.cameraZ - 2.8, 88)
  balls.player.visible = true
  balls.thrown.visible = false
  kickPrompt.textContent = `${type === 'extraPoint' ? 'Extra point' : `${distance}-yard field goal`} — press Space to kick`
  kickFill.style.width = '0%'
  kickMeter.classList.remove('is-hidden')
  statusText.textContent = `Line up the ${type === 'extraPoint' ? 'extra point' : 'field goal'} — time the meter!`
}

export function resolveKick() {
  const type = state.kickType
  if (!type || state.kickFlight) return
  const distance = state.kickDistance
  // Forgiving timing window and a gentler distance falloff — a well-timed kick
  // inside ~45 yards is nearly automatic, and even a mistimed one has a chance.
  const timing = 1 - Math.min(1, Math.abs(state.kickPower - 54) / 22)
  const distanceChance = type === 'extraPoint' ? 0.99 : THREE.MathUtils.clamp(1.16 - (distance - 20) * 0.011, 0.2, 0.99)
  const made = Math.random() < distanceChance * (0.5 + timing * 0.5)
  state.kickType = null
  kickMeter.classList.add('is-hidden')

  // Send the ball on a visible arc toward the uprights; the outcome is settled
  // once it lands (see updateKickFlight / settleKick).
  const goalZ = OPPONENT_GOAL_LINE_Z - 10
  const from = new THREE.Vector3(0, 0.35, state.cameraZ - 1.4)
  const wide = made ? randomBetween(-1.1, 1.1) : (Math.random() < 0.5 ? -1 : 1) * randomBetween(6.5, 11)
  const shortBy = made ? 0 : (Math.random() < 0.35 ? randomBetween(10, 22) : 0)
  const to = new THREE.Vector3(wide, made ? 9 : shortBy ? 2.5 : 8.4, goalZ + shortBy)
  const apex = Math.max(from.y, to.y) + THREE.MathUtils.clamp(distance * 0.14, 5, 11)
  const ctrl = new THREE.Vector3((from.x + to.x) / 2, apex, (from.z + to.z) / 2)
  state.kickFlight = {
    t: 0,
    dur: THREE.MathUtils.clamp(distance * 0.028, 1, 2),
    from,
    ctrl,
    to,
    type,
    distance,
    made,
  }
  balls.player.visible = false
  balls.thrown.visible = true
  balls.thrown.position.copy(from)
  statusText.textContent = 'The kick is up…'
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
  if (p >= 1) {
    balls.thrown.visible = false
    const done = k
    state.kickFlight = null
    settleKick(done.type, done.distance, done.made)
  }
}

function settleKick(type: KickType, distance: number, made: boolean) {
  if (type === 'extraPoint') {
    if (made) {
      state.score += 1
      statusText.textContent = `EXTRA POINT IS GOOD. You lead ${state.score}-${state.opponentScore}.`
    } else {
      statusText.textContent = 'Extra point is NO GOOD.'
    }
    afterPatResolved()
    return
  }
  if (made) {
    state.score += 3
    statusText.textContent = `${distance}-YARD FIELD GOAL IS GOOD! You lead ${state.score}-${state.opponentScore}.`
    updateHud()
    if (state.quarter >= 5) {
      schedule(endGame, 1600)
      return
    }
    schedule(() => kickoff('defense'), 1500)
    return
  }
  // Missed: opponent takes over at the spot of the hold, but no closer than their 20.
  const oppYard = Math.max(20, 108 - state.ballOn)
  giveBallToOpponent(oppYard, `${distance}-yard field goal is NO GOOD. Opponent takes over.`)
}

function puntBall() {
  state.running = false
  playCall.classList.add('is-hidden')
  const net = Math.round(randomBetween(38, 48))
  const landing = state.ballOn + net
  if (landing >= 100) {
    giveBallToOpponent(20, `${net}-yard punt into the end zone — touchback. Opponent ball on their 20.`)
    return
  }
  giveBallToOpponent(100 - landing, `${net}-yard punt. Opponent ball on the ${describeSpot(landing)}.`)
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
  const oppYard = 100 - state.ballOn
  statusText.textContent = 'TURNOVER ON DOWNS — get ready to play defense!'
  updateHud()
  schedule(() => startDefensiveSeries(defensiveSpotZ(oppYard), false), 1200)
}

function scoreTouchdown() {
  state.running = false
  state.score += 6
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
    state.score += 2
    statusText.textContent = `TWO-POINT CONVERSION IS GOOD! You lead ${state.score}-${state.opponentScore}.`
  } else {
    statusText.textContent = 'The two-point try comes up short — no good.'
  }
  updateHud()
  afterPatResolved()
}

export function finishDefensivePlay(tackled: boolean) {
  state.running = false
  if (tackled) {
    const spotZ = state.ballCarrier?.z ?? state.defenseFirstDownZ
    // Punch it out: a takeaway that hands the ball straight to your offense.
    if (Math.random() < 0.05) {
      state.lastPlayStoppedClock = true
      statusText.textContent = `FORCED FUMBLE — takeaway! Your offense has it on the ${describeSpot(ballOnFromZ(spotZ))}.`
      updateHud()
      schedule(() => resetDrive(spotZ), 1300)
      return
    }
    const earnedFirstDown = spotZ - state.defenseFirstDownZ >= 10
    if (earnedFirstDown) {
      state.defenseDown = 1
      state.defenseFirstDownZ = spotZ
      statusText.textContent = `TACKLE! Opponent moved the chains — 1st & 10 on the ${describeSpot(ballOnFromZ(spotZ))}.`
      updateHud()
      schedule(() => startDefensiveSeries(spotZ, false, false), 1200)
      return
    }
    state.defenseDown += 1
    if (state.defenseDown <= 4) {
      const togo = Math.max(1, Math.ceil(state.defenseFirstDownZ + 10 - spotZ))
      statusText.textContent = `TACKLE! Opponent faces ${ordinal(state.defenseDown)} & ${togo} on the ${describeSpot(ballOnFromZ(spotZ))}.`
      updateHud()
      schedule(() => startDefensiveSeries(spotZ, false, false), 1200)
      return
    }
    statusText.textContent = `TURNOVER ON DOWNS! Your offense takes over on the ${describeSpot(ballOnFromZ(spotZ))}.`
    updateHud()
    schedule(() => resetDrive(spotZ), 1200)
    return
  }
  state.opponentScore += 6
  const patGood = Math.random() < 0.94
  if (patGood) state.opponentScore += 1
  statusText.textContent = `OPPONENT TOUCHDOWN — extra point ${patGood ? 'good' : 'no good'}. They lead ${state.opponentScore}-${state.score}.`
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
  state.defenseCall = call
  defenseCall.classList.add('is-hidden')
  state.playTime = 0
  state.running = true
  state.bigPlayAllowed = true
  state.carrierNextJuke = 1
  state.stamina = 1
  state.gassed = false
  // Freeze the marker at the pre-snap spot for the duration of the play.
  const snapZ = state.ballCarrier?.z ?? state.defenseStartZ
  const snapTogo = Math.max(1, Math.ceil(state.defenseFirstDownZ + 10 - snapZ))
  state.snapDownText = `${ordinal(Math.min(state.defenseDown, 4))} & ${snapTogo}`
  state.snapYardsText = describeSpot(ballOnFromZ(snapZ))
  const cfg: Record<DefenseCall, { radius: number; teamSpeed: number; carrierMul: number }> = {
    base: { radius: 1.7, teamSpeed: 13, carrierMul: 1 },
    blitz: { radius: 1.9, teamSpeed: 14.5, carrierMul: 1.12 },
    cover2: { radius: 1.6, teamSpeed: 12, carrierMul: 0.9 },
    goalline: { radius: 2.3, teamSpeed: 14, carrierMul: 0.95 },
    spy: { radius: 1.8, teamSpeed: 13, carrierMul: 1 },
  }
  const c = cfg[call]
  state.defTackleRadius = c.radius
  state.defCarrierSpeedMul = c.carrierMul
  teammates.forEach((teammate, index) => {
    teammate.speed = c.teamSpeed
    teammate.role = call === 'spy' && index === 0 ? 'spy' : 'man'
  })
  statusText.textContent = `${DEFENSE_PLAYBOOK.find((d) => d.id === call)?.name} versus ${state.opponentPlay} — meet the runner and make the tackle!`
  updateHud()
}

export function startPlay(play: PlayId) {
  startAudio()
  if (state.gameOver || (!state.running && state.possession !== 'offense')) return
  // No special teams on a two-point try — it's a run/pass snap from the 2.
  if (state.twoPointActive && (play === 'fieldGoal' || play === 'punt' || play === 'kneel')) return
  if (play === 'fieldGoal') { attemptFieldGoal(); return }
  if (play === 'punt') { puntBall(); return }
  if (play === 'kneel') { kneelDown(); return }
  const runId = isRunId(play)
  // Runoff: if the previous play kept the clock alive, the huddle burns ~25s.
  if (!state.lastPlayStoppedClock && state.gameClock > INTER_PLAY_RUNOFF + 6) {
    state.gameClock = Math.max(0, state.gameClock - INTER_PLAY_RUNOFF)
  }
  state.lastPlayStoppedClock = false
  state.selectedPlay = play
  state.playTime = 0
  state.running = true
  state.throwing = false
  state.afterCatch = false
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
    const startX: Record<RunPlayId, number> = { iso: 0, offtackle: 5, toss: 12, draw: 0 }
    const delay: Record<RunPlayId, number> = { iso: 0, offtackle: 0.2, toss: 0.4, draw: 0.7 }
    state.playerX = startX[play]
    state.runDelay = delay[play]
  } else {
    state.runDelay = 0
    buildReceivers(play)
  }
  assignPassProtection(runId, play === 'paPost' || play === 'draw')
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
  quarterEl.textContent = state.quarter >= 5 ? 'OT' : ordinal(state.quarter)
  clockEl.textContent = formatClock(state.gameClock)
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
    const carrierZ = state.ballCarrier?.z ?? state.defenseStartZ
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
  const outOfBounds = Math.abs(state.playerX) >= 24
  const spotYard = ballOnFromZ(state.cameraZ)
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
  gainTo(spotYard, wasAfterCatch ? 'Tackled after the catch.' : 'Tackled.', outOfBounds)
}

export function sack() {
  if (!state.running) return
  state.selectedPlay = null
  state.sacked = true
  gainTo(ballOnFromZ(state.cameraZ), 'Sacked!', false)
}

export function throwAway() {
  if (!state.running || state.throwing || state.afterCatch || isRunId(state.selectedPlay) || state.possession !== 'offense') return
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
  if (state.running) {
    // Game clock runs during a live play.
    state.gameClock = Math.max(0, state.gameClock - delta)
    return
  }
  // Between plays the play clock winds down while the play-call menu is open.
  if (!playCall.classList.contains('is-hidden')) {
    state.playClock = Math.max(0, state.playClock - delta)
    playCallKicker.textContent = `Offense · ${downAndDistance()} · Play clock ${Math.ceil(state.playClock)}`
    if (state.playClock <= 0) delayOfGame()
  }
  // A quarter that expired mid-play is resolved once the ball is dead.
  if (state.gameClock <= 0 && !state.clockEventHandled) {
    handleClockExpired()
  }
}

function delayOfGame() {
  state.playClock = PLAY_CLOCK_SECONDS
  if (state.possession !== 'offense' || state.gameOver) return
  state.ballOn = Math.max(1, state.ballOn - 5)
  state.cameraZ = losZ(state.ballOn)
  state.lastPlayStoppedClock = true
  statusText.textContent = `Delay of game — 5-yard penalty. ${downAndDistance()} on the ${describeSpot(state.ballOn)}.`
  updateHud()
}
