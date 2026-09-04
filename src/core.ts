import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DefenderRole = 'rush' | 'man' | 'zone' | 'spy'

export type Defender = {
  mesh: THREE.Group
  x: number
  z: number
  runPhase: number
  football: THREE.Mesh
  role: DefenderRole
  coverIndex: number
  speed: number
  homeX: number
  stumbleUntil: number
  blockedUntil: number
}

export type Lineman = {
  mesh: THREE.Group
  startX: number
  startZ: number
  blockPhase: number
  assignment: Defender | null
}

export type Receiver = {
  mesh: THREE.Group
  target: THREE.Mesh
  heldFootball: THREE.Mesh
  startX: number
  breakX: number
  targetX: number
  startZ: number
  routeDepth: number
  routePhase: number
}

export type CrowdMember = {
  x: number
  y: number
  z: number
  facing: number
  phase: number
  scale: number
  colorIndex: number
  bodyIndex: number
  headIndex: number
}

export type PassPlayId = 'slant' | 'verticals' | 'flood' | 'mesh' | 'paPost' | 'screen'
export type RunPlayId = 'iso' | 'offtackle' | 'toss' | 'draw'
export type SpecialPlayId = 'fieldGoal' | 'punt' | 'kneel'
export type PlayId = PassPlayId | RunPlayId | SpecialPlayId
export type PlayTab = 'pass' | 'run' | 'special'
export type DefenseCall = 'base' | 'blitz' | 'cover2' | 'goalline' | 'spy'
export type KickType = 'fieldGoal' | 'extraPoint'

export type OffensivePlay = { id: PlayId; name: string; blurb: string; tab: PlayTab }

// ---------------------------------------------------------------------------
// Playbooks & rule constants
// ---------------------------------------------------------------------------

export const OFFENSE_PLAYBOOK: OffensivePlay[] = [
  { id: 'slant', name: 'Quick Slant', blurb: 'Fast inside-breaking routes', tab: 'pass' },
  { id: 'verticals', name: 'Four Verticals', blurb: 'Attack deep downfield', tab: 'pass' },
  { id: 'flood', name: 'Flood Right', blurb: 'Three-level sideline read', tab: 'pass' },
  { id: 'mesh', name: 'Mesh', blurb: 'Rub crossers underneath', tab: 'pass' },
  { id: 'paPost', name: 'PA Post', blurb: 'Play-action deep shot', tab: 'pass' },
  { id: 'screen', name: 'Y-Screen', blurb: 'Screen behind the line', tab: 'pass' },
  { id: 'iso', name: 'Inside Zone', blurb: 'Downhill between the tackles', tab: 'run' },
  { id: 'offtackle', name: 'Off Tackle', blurb: 'Pull a guard, hit the edge', tab: 'run' },
  { id: 'toss', name: 'Toss Sweep', blurb: 'Get outside in a hurry', tab: 'run' },
  { id: 'draw', name: 'QB Draw', blurb: 'Sell the pass, then run', tab: 'run' },
  { id: 'fieldGoal', name: 'Field Goal', blurb: 'Kick for 3 — better odds up close', tab: 'special' },
  { id: 'punt', name: 'Punt', blurb: 'Flip the field on 4th down', tab: 'special' },
  { id: 'kneel', name: 'Victory Kneel', blurb: 'Burn ~40s, lose a yard', tab: 'special' },
]

export const DEFENSE_PLAYBOOK: Array<{ id: DefenseCall; name: string; blurb: string }> = [
  { id: 'base', name: 'Base 4-3', blurb: 'Balanced — contain and pursue' },
  { id: 'blitz', name: 'Blitz', blurb: 'Crash downhill — strong vs the run' },
  { id: 'cover2', name: 'Cover 2', blurb: 'Sag back — no big plays, soft underneath' },
  { id: 'goalline', name: 'Goal Line', blurb: 'Sell out to stop the score' },
  { id: 'spy', name: 'QB Spy', blurb: 'Mirror the runner, rally to the ball' },
]

const RUN_IDS: readonly RunPlayId[] = ['iso', 'offtackle', 'toss', 'draw']
export const isRunId = (id: PlayId | null): id is RunPlayId => !!id && (RUN_IDS as readonly string[]).includes(id)

export const USER_GOAL_LINE_Z = 8
export const OPPONENT_GOAL_LINE_Z = -92
export const USER_TWENTY_Z = USER_GOAL_LINE_Z - 20

// Depth of each end zone, and the Z boundaries a player can physically reach
// before hitting the back wall / bleachers. Crossing the near one while on
// offense is a safety (see simulation.ts); the far one is unreachable without
// already scoring a touchdown, since that's checked every frame first.
export const END_ZONE_DEPTH = 10
export const USER_END_ZONE_BACK_Z = USER_GOAL_LINE_Z + END_ZONE_DEPTH
export const OPPONENT_END_ZONE_BACK_Z = OPPONENT_GOAL_LINE_Z - END_ZONE_DEPTH

// Game-structure tunables (see plan: Rules & game structure).
export const QUARTER_SECONDS = 120
export const OT_SECONDS = 180
export const INTER_PLAY_RUNOFF = 25
export const PLAY_CLOCK_SECONDS = 40

// Movement feel tunables: a global speed trim on every player, and the
// first-person eye height (raise it to make "you" feel taller on the field).
export const MOVE_SCALE = 0.9
export const EYE_HEIGHT = 2.7

// The Vikings wear purple; the opponent is whichever NFC North rival the
// player picks from the team-select dialog at the start of a game.
export const VIKINGS_PURPLE = 0x8b5cf6

export type TeamId = 'vikings' | 'lions' | 'packers' | 'bears'

export type TeamInfo = {
  id: TeamId
  name: string // short scoreboard/jersey name, e.g. "PACKERS"
  fullName: string // e.g. "Green Bay Packers"
  primary: number // jersey, helmet, and end-zone color
  accent: number // ball-carrier highlight, coach polo, and nameplate text tint
  nameplateText: string // hex string, readable against the jersey color
}

export const TEAMS: Record<TeamId, TeamInfo> = {
  vikings: {
    id: 'vikings',
    name: 'VIKINGS',
    fullName: 'Minnesota Vikings',
    primary: VIKINGS_PURPLE,
    accent: 0x4c1d95,
    nameplateText: '#ede9fe',
  },
  lions: {
    id: 'lions',
    name: 'LIONS',
    fullName: 'Detroit Lions',
    primary: 0x0076b6,
    accent: 0xb0b7bc,
    nameplateText: '#e8f4ff',
  },
  packers: {
    id: 'packers',
    name: 'PACKERS',
    fullName: 'Green Bay Packers',
    primary: 0x203731,
    accent: 0xffb612,
    nameplateText: '#ffe6a3',
  },
  bears: {
    id: 'bears',
    name: 'BEARS',
    fullName: 'Chicago Bears',
    primary: 0x0b162a,
    accent: 0xc83803,
    nameplateText: '#ff9a63',
  },
}

// NFC North rivals the player can choose to play against on a new game.
export const OPPONENT_TEAM_IDS: TeamId[] = ['lions', 'packers', 'bears']

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

export function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

// Yard line 0-100 measured from the user's own goal line (100 = opponent goal = TD).
export function losZ(yard: number) {
  return USER_GOAL_LINE_Z - yard
}

export function ballOnFromZ(z: number) {
  return THREE.MathUtils.clamp(Math.round(USER_GOAL_LINE_Z - z), 0, 100)
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

export function downAndDistance() {
  const togo = state.firstDownTarget - state.ballOn
  const distance = state.firstDownTarget >= 100 ? 'Goal' : String(Math.max(1, togo))
  return `${ordinal(state.down)} & ${distance}`
}

// ---------------------------------------------------------------------------
// Season record — carried between games (Retro Bowl-style season progression),
// stored locally so it survives reloads. Any read/write is guarded because
// private-mode browsers throw on localStorage access.
// ---------------------------------------------------------------------------

export type SeasonRecord = { w: number; l: number; t: number }
const SEASON_KEY = 'touchdownRush.season'

export function loadSeason(): SeasonRecord {
  try {
    const raw = localStorage.getItem(SEASON_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SeasonRecord>
      return { w: parsed.w ?? 0, l: parsed.l ?? 0, t: parsed.t ?? 0 }
    }
  } catch {
    /* storage unavailable — fall through to a fresh record */
  }
  return { w: 0, l: 0, t: 0 }
}

export function saveSeason(season: SeasonRecord) {
  try {
    localStorage.setItem(SEASON_KEY, JSON.stringify(season))
  } catch {
    /* storage unavailable — the record just won't persist this session */
  }
}

export function formatRecord(season: SeasonRecord) {
  return season.t > 0 ? `${season.w}-${season.l}-${season.t}` : `${season.w}-${season.l}`
}

// ---------------------------------------------------------------------------
// DOM shell + element references
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="game-shell">
    <header class="top-bar">
      <div class="score-card"><span class="label">You</span><strong id="score">0</strong></div>
      <div class="score-card"><span id="opponentLabel" class="label">Opponent</span><strong id="opponentScore">0</strong></div>
      <div class="score-card"><span class="label">Qtr</span><strong id="quarter">1st</strong></div>
      <div class="score-card"><span class="label">Clock</span><strong id="clock">5:00</strong></div>
      <div class="score-card"><span id="yardsLabel" class="label">Ball on</span><strong id="yards">OWN 20</strong></div>
      <div class="score-card"><span class="label">Down</span><strong id="down">1st &amp; 10</strong></div>
      <button id="resetButton" class="reset-button" type="button">New Game</button>
    </header>
    <div class="game-frame">
      <canvas id="gameCanvas" width="960" height="540" aria-label="3D first-person football game"></canvas>
      <div class="status-panel"><span id="statusText">Break through the defense!</span></div>
      <div id="kickMeter" class="kick-meter is-hidden" aria-live="polite">
        <span id="kickPrompt">Press Space to kick</span>
        <div class="kick-track"><div id="kickFill" class="kick-fill"></div><i class="kick-sweet-spot"></i></div>
        <small>Hit the gold zone for a clean kick</small>
      </div>
      <div id="staminaMeter" class="stamina-meter is-hidden" aria-hidden="true">
        <span>Stamina</span>
        <div class="stamina-track"><div id="staminaFill" class="stamina-fill"></div></div>
      </div>
      <div id="gameOverPanel" class="game-over is-hidden" role="dialog" aria-label="Final score">
        <span class="play-call-kicker">Final</span>
        <h2 id="gameOverTitle">Final</h2>
        <p id="gameOverScore">0 - 0</p>
        <p id="seasonRecord" class="season-line">Season 0-0</p>
        <button id="newGameButton" type="button">New Game</button>
      </div>
      <div id="patCall" class="play-call is-hidden" role="dialog" aria-label="Point after touchdown">
        <span class="play-call-kicker">Touchdown · Point after</span>
        <h2>Kick it, or go for two?</h2>
        <div class="play-options">
          <button id="patKick" type="button"><strong>Extra Point</strong><span>Kick through the uprights — routine, worth 1</span></button>
          <button id="patGo" type="button"><strong>Go for Two</strong><span>One shot from the 2 — about 50/50, worth 2</span></button>
        </div>
      </div>
      <div id="playCall" class="play-call" role="dialog" aria-label="Choose an offensive play">
        <span id="playCallKicker" class="play-call-kicker">Offense · 1st &amp; 10 · Play clock 40</span>
        <h2>Pick a play</h2>
        <div id="playTabs" class="play-tabs">
          <button type="button" data-tab="pass">Pass</button>
          <button type="button" data-tab="run">Run</button>
          <button type="button" data-tab="special">Special Teams</button>
        </div>
        <div id="playOptions" class="play-options"></div>
      </div>
      <div id="defenseCall" class="play-call is-hidden" role="dialog" aria-label="Choose a defensive call">
        <span id="defenseKicker" class="play-call-kicker">Defense</span>
        <h2>Call your defense</h2>
        <div id="defenseOptions" class="play-options"></div>
      </div>
      <div id="teamSelect" class="play-call is-hidden" role="dialog" aria-label="Choose your opponent">
        <span class="play-call-kicker">NFC North · New Game</span>
        <h2>Pick your opponent</h2>
        <div id="teamOptions" class="play-options team-options"></div>
      </div>
    </div>
    <div class="controls-panel">
      <div class="instructions">
        <span>Move: WASD or Arrow keys</span><span>Look: mouse (click field)</span><span>Sprint: Shift or Space (burns stamina)</span><span>Goal: reach the end zone</span>
      </div>
      <div class="touch-controls">
        <button type="button" data-move="left">Left</button><button type="button" data-move="right">Right</button><button type="button" data-move="sprint">Sprint</button>
      </div>
    </div>
  </div>
`

export const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!
export const scoreEl = document.querySelector<HTMLElement>('#score')!
export const opponentScoreEl = document.querySelector<HTMLElement>('#opponentScore')!
export const opponentLabelEl = document.querySelector<HTMLElement>('#opponentLabel')!
export const yardsLabelEl = document.querySelector<HTMLElement>('#yardsLabel')!
export const yardsEl = document.querySelector<HTMLElement>('#yards')!
export const downEl = document.querySelector<HTMLElement>('#down')!
export const quarterEl = document.querySelector<HTMLElement>('#quarter')!
export const clockEl = document.querySelector<HTMLElement>('#clock')!
export const statusText = document.querySelector<HTMLElement>('#statusText')!
export const kickMeter = document.querySelector<HTMLDivElement>('#kickMeter')!
export const kickPrompt = document.querySelector<HTMLElement>('#kickPrompt')!
export const kickFill = document.querySelector<HTMLDivElement>('#kickFill')!
export const staminaMeter = document.querySelector<HTMLDivElement>('#staminaMeter')!
export const staminaFill = document.querySelector<HTMLDivElement>('#staminaFill')!
export const resetButton = document.querySelector<HTMLButtonElement>('#resetButton')!
export const playCall = document.querySelector<HTMLDivElement>('#playCall')!
export const playCallKicker = document.querySelector<HTMLElement>('#playCallKicker')!
export const playTabs = document.querySelector<HTMLDivElement>('#playTabs')!
export const playOptions = document.querySelector<HTMLDivElement>('#playOptions')!
export const defenseCall = document.querySelector<HTMLDivElement>('#defenseCall')!
export const defenseKicker = document.querySelector<HTMLElement>('#defenseKicker')!
export const defenseOptions = document.querySelector<HTMLDivElement>('#defenseOptions')!
export const teamSelect = document.querySelector<HTMLDivElement>('#teamSelect')!
export const teamOptions = document.querySelector<HTMLDivElement>('#teamOptions')!
export const gameOverPanel = document.querySelector<HTMLDivElement>('#gameOverPanel')!
export const gameOverTitle = document.querySelector<HTMLElement>('#gameOverTitle')!
export const gameOverScore = document.querySelector<HTMLElement>('#gameOverScore')!
export const seasonRecordEl = document.querySelector<HTMLElement>('#seasonRecord')!
export const newGameButton = document.querySelector<HTMLButtonElement>('#newGameButton')!
export const patCall = document.querySelector<HTMLDivElement>('#patCall')!
export const patKickButton = document.querySelector<HTMLButtonElement>('#patKick')!
export const patGoButton = document.querySelector<HTMLButtonElement>('#patGo')!

// ---------------------------------------------------------------------------
// Shared mutable game state
// ---------------------------------------------------------------------------

export const keys = { left: false, right: false, forward: false, backward: false, sprint: false }

export const state = {
  score: 0,
  opponentScore: 0,
  possession: 'offense' as 'offense' | 'defense',
  ballOn: 20,
  firstDownTarget: 30,
  down: 1,
  playerX: 0,
  cameraZ: 8,
  running: false,
  lastTime: 0,
  playTime: 0,
  selectedPlay: null as PlayId | null,
  throwing: false,
  afterCatch: false,
  passTime: 0,
  passTarget: null as Receiver | null,
  passComplete: true,
  passContested: false,
  passPickable: false,
  passPI: false,
  playerVX: 0,
  playerVZ: 0,
  prevDirection: 0,
  pressureAnnounced: false,
  sacked: false,
  snapZ: 0,
  playerBlockedUntil: 0,
  carrierJukeVX: 0,
  carrierJukeUntil: 0,
  carrierNextJuke: 0,
  carrierLaneX: 0,
  bigPlayAllowed: true,
  playTab: 'pass' as PlayTab,
  runDelay: 0,
  defenseCall: 'base' as DefenseCall,
  defTackleRadius: 1.7,
  defCarrierSpeedMul: 1,
  defenseStartZ: 0,
  defenseFirstDownZ: 0,
  defenseDown: 1,
  ballCarrier: null as Defender | null,
  quarter: 1,
  gameClock: QUARTER_SECONDS,
  playClock: PLAY_CLOCK_SECONDS,
  clockRunning: false,
  clockEventHandled: false,
  lastPlayStoppedClock: true,
  gameOver: false,
  // Guards the season record from being counted twice on one final whistle.
  recorded: false,
  // True while a two-point conversion is being played out as a live snap from
  // the 2 (reach the end zone = +2, any other dead ball = no good).
  twoPointActive: false,
  firstPossession: 'offense' as 'offense' | 'defense',
  kickType: null as KickType | null,
  kickPower: 0,
  kickDistance: 0,
  // Live kick in flight toward the uprights (field goal / extra point).
  kickFlight: null as null | {
    t: number
    dur: number
    from: THREE.Vector3
    ctrl: THREE.Vector3
    to: THREE.Vector3
    type: KickType
    distance: number
    made: boolean
  },
  // Brief window after a catch where you can't be tackled, so you get a step.
  catchGraceUntil: 0,
  // Down & distance shown on the HUD is frozen at the snap and only refreshed
  // once the ball is dead and re-spotted — a live play never changes the marker.
  snapDownText: '1st & 10',
  snapYardsText: 'OWN 20',
  // Sprint stamina: 1 = fresh, 0 = gassed. Sprinting drains it; jogging/standing
  // refills it. `gassed` locks sprint out until stamina recovers past a threshold.
  stamina: 1,
  gassed: false,
  sprinting: false,
  // Countdown between footstep sound effects; frame-scratch, reset on each snap.
  footstepTimer: 0,
  opponentPlay: 'Inside Run',
  // Which NFC North rival is on the other sideline this game — set by the
  // team-select dialog before startGame() runs.
  opponentTeam: 'bears' as TeamId,
}

// ---------------------------------------------------------------------------
// Entity collections — populated by entities.ts, read across the game.
// ---------------------------------------------------------------------------

export const defenders: Defender[] = []
export const linemen: Lineman[] = []
export const receivers: Receiver[] = []
// Your AI defenders that pursue alongside you when the opponent has the ball.
export const teammates: Defender[] = []
