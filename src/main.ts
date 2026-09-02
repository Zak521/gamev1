import * as THREE from 'three'
import './style.css'

type DefenderRole = 'rush' | 'man' | 'zone' | 'spy'

type Defender = {
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

type Lineman = {
  mesh: THREE.Group
  startX: number
  startZ: number
  blockPhase: number
  assignment: Defender | null
}

type Receiver = {
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

type CrowdMember = {
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

type PassPlayId = 'slant' | 'verticals' | 'flood' | 'mesh' | 'paPost' | 'screen'
type RunPlayId = 'iso' | 'offtackle' | 'toss' | 'draw'
type SpecialPlayId = 'fieldGoal' | 'punt' | 'kneel'
type PlayId = PassPlayId | RunPlayId | SpecialPlayId
type PlayTab = 'pass' | 'run' | 'special'
type DefenseCall = 'base' | 'blitz' | 'cover2' | 'goalline' | 'spy'
type KickType = 'fieldGoal' | 'extraPoint'

type OffensivePlay = { id: PlayId; name: string; blurb: string; tab: PlayTab }

const OFFENSE_PLAYBOOK: OffensivePlay[] = [
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

const DEFENSE_PLAYBOOK: Array<{ id: DefenseCall; name: string; blurb: string }> = [
  { id: 'base', name: 'Base 4-3', blurb: 'Balanced — contain and pursue' },
  { id: 'blitz', name: 'Blitz', blurb: 'Crash downhill — strong vs the run' },
  { id: 'cover2', name: 'Cover 2', blurb: 'Sag back — no big plays, soft underneath' },
  { id: 'goalline', name: 'Goal Line', blurb: 'Sell out to stop the score' },
  { id: 'spy', name: 'QB Spy', blurb: 'Mirror the runner, rally to the ball' },
]

const RUN_IDS: readonly RunPlayId[] = ['iso', 'offtackle', 'toss', 'draw']
const isRunId = (id: PlayId | null): id is RunPlayId => !!id && (RUN_IDS as readonly string[]).includes(id)

const USER_GOAL_LINE_Z = 8
const OPPONENT_GOAL_LINE_Z = -92
const USER_TWENTY_Z = USER_GOAL_LINE_Z - 20

// Game-structure tunables (see plan: Rules & game structure).
const QUARTER_SECONDS = 120
const OT_SECONDS = 180
const INTER_PLAY_RUNOFF = 25
const PLAY_CLOCK_SECONDS = 40

// Movement feel tunables: a global speed trim on every player, and the
// first-person eye height (raise it to make "you" feel taller on the field).
const MOVE_SCALE = 0.9
const EYE_HEIGHT = 2.7

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

// Yard line 0-100 measured from the user's own goal line (100 = opponent goal = TD).
function losZ(yard: number) {
  return USER_GOAL_LINE_Z - yard
}

function ballOnFromZ(z: number) {
  return THREE.MathUtils.clamp(Math.round(USER_GOAL_LINE_Z - z), 0, 100)
}

// Convert "yards from the opponent's own goal" into a world Z for defensive series.
function defensiveSpotZ(oppYard: number) {
  return OPPONENT_GOAL_LINE_Z + oppYard
}

function describeSpot(yard: number) {
  const y = Math.round(yard)
  if (y === 50) return 'MIDFIELD'
  return y < 50 ? `OWN ${y}` : `OPP ${100 - y}`
}

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function downAndDistance() {
  const togo = state.firstDownTarget - state.ballOn
  const distance = state.firstDownTarget >= 100 ? 'Goal' : String(Math.max(1, togo))
  return `${ordinal(state.down)} & ${distance}`
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="game-shell">
    <header class="top-bar">
      <div class="score-card"><span class="label">You</span><strong id="score">0</strong></div>
      <div class="score-card"><span class="label">Opponent</span><strong id="opponentScore">0</strong></div>
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
        <button id="newGameButton" type="button">New Game</button>
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

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!
const scoreEl = document.querySelector<HTMLElement>('#score')!
const opponentScoreEl = document.querySelector<HTMLElement>('#opponentScore')!
const yardsLabelEl = document.querySelector<HTMLElement>('#yardsLabel')!
const yardsEl = document.querySelector<HTMLElement>('#yards')!
const downEl = document.querySelector<HTMLElement>('#down')!
const quarterEl = document.querySelector<HTMLElement>('#quarter')!
const clockEl = document.querySelector<HTMLElement>('#clock')!
const statusText = document.querySelector<HTMLElement>('#statusText')!
const kickMeter = document.querySelector<HTMLDivElement>('#kickMeter')!
const kickPrompt = document.querySelector<HTMLElement>('#kickPrompt')!
const kickFill = document.querySelector<HTMLDivElement>('#kickFill')!
const staminaMeter = document.querySelector<HTMLDivElement>('#staminaMeter')!
const staminaFill = document.querySelector<HTMLDivElement>('#staminaFill')!
const resetButton = document.querySelector<HTMLButtonElement>('#resetButton')!
const playCall = document.querySelector<HTMLDivElement>('#playCall')!
const playCallKicker = document.querySelector<HTMLElement>('#playCallKicker')!
const playTabs = document.querySelector<HTMLDivElement>('#playTabs')!
const playOptions = document.querySelector<HTMLDivElement>('#playOptions')!
const defenseCall = document.querySelector<HTMLDivElement>('#defenseCall')!
const defenseKicker = document.querySelector<HTMLElement>('#defenseKicker')!
const defenseOptions = document.querySelector<HTMLDivElement>('#defenseOptions')!
const gameOverPanel = document.querySelector<HTMLDivElement>('#gameOverPanel')!
const gameOverTitle = document.querySelector<HTMLElement>('#gameOverTitle')!
const gameOverScore = document.querySelector<HTMLElement>('#gameOverScore')!
const newGameButton = document.querySelector<HTMLButtonElement>('#newGameButton')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 420)
const world = new THREE.Group()
const playerView = new THREE.Group()
const defenders: Defender[] = []
const linemen: Lineman[] = []
const receivers: Receiver[] = []
// Your AI defenders that pursue alongside you when the opponent has the ball.
const teammates: Defender[] = []
const crowdMembers: CrowdMember[] = []
const clouds: THREE.Group[] = []
const crowdBodyMeshes: THREE.InstancedMesh[] = []
const crowdShoulderMeshes: THREE.InstancedMesh[] = []
let crowdHeadMesh: THREE.InstancedMesh | null = null
const crowdTransform = new THREE.Object3D()
const passRaycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let viewYaw = 0
let viewPitch = 0

function aimCamera() {
  const distance = 42
  camera.lookAt(
    camera.position.x + Math.sin(viewYaw) * distance,
    camera.position.y + viewPitch * distance,
    camera.position.z - Math.cos(viewYaw) * distance,
  )
}

function resetView() {
  viewYaw = 0
  viewPitch = 0
  aimCamera()
}

function releaseMouse() {
  if (document.pointerLockElement === canvas) document.exitPointerLock()
}

const keys = { left: false, right: false, forward: false, backward: false, sprint: false }
const state = {
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
  opponentPlay: 'Inside Run',
}
let playerFootball: THREE.Mesh
let thrownFootball: THREE.Mesh
let scoreboardCanvas: HTMLCanvasElement | null = null
let scoreboardTexture: THREE.CanvasTexture | null = null

let audioContext: AudioContext | null = null
let musicStep = 0
let footstepTimer = 0
const passStart = new THREE.Vector3()

function startAudio() {
  if (!audioContext) {
    audioContext = new AudioContext()
    window.setInterval(() => {
      if (!audioContext || !state.running) return
      const now = audioContext.currentTime
      const notes = [110, 110, 147, 165, 110, 110, 196, 165]
      const oscillator = audioContext.createOscillator()
      const noteGain = audioContext.createGain()
      oscillator.type = 'sawtooth'
      oscillator.frequency.value = notes[musicStep % notes.length]
      noteGain.gain.setValueAtTime(0.0001, now)
      noteGain.gain.exponentialRampToValueAtTime(0.045, now + 0.015)
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
      oscillator.connect(noteGain).connect(audioContext.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.25)
      musicStep += 1
    }, 250)
    window.setInterval(() => {
      if (audioContext && state.running && Math.random() > 0.35) playCrowdCheer()
    }, 2400)
  }
  if (audioContext.state === 'suspended') void audioContext.resume()
}

function playFootstep() {
  if (!audioContext || audioContext.state !== 'running') return
  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const stepGain = audioContext.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(keys.sprint ? 125 : 105, now)
  oscillator.frequency.exponentialRampToValueAtTime(58, now + 0.11)
  stepGain.gain.setValueAtTime(0.0001, now)
  stepGain.gain.exponentialRampToValueAtTime(keys.sprint ? 0.18 : 0.13, now + 0.012)
  stepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
  oscillator.connect(stepGain).connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.14)
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function labelSprite(text: string, color = '#ffffff') {
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 256
  labelCanvas.height = 128
  const labelContext = labelCanvas.getContext('2d')!
  labelContext.clearRect(0, 0, 256, 128)
  labelContext.fillStyle = color
  labelContext.font = 'bold 58px Arial'
  labelContext.textAlign = 'center'
  labelContext.textBaseline = 'middle'
  labelContext.fillText(text, 128, 64)
  const texture = new THREE.CanvasTexture(labelCanvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(5, 2.5, 1)
  return sprite
}

// The Vikings wear purple; everyone else on the field is the Bears.
const VIKINGS_PURPLE = 0x8b5cf6
function teamName(jerseyColor: number) {
  return jerseyColor === VIKINGS_PURPLE ? 'VIKINGS' : 'BEARS'
}

// A jersey nameplate across the chest. It respects depth so players in front
// cleanly occlude the ones behind them instead of the text stacking up.
function jerseyNameplate(jerseyColor: number) {
  const plate = labelSprite(teamName(jerseyColor), jerseyColor === VIKINGS_PURPLE ? '#ede9fe' : '#ffedd5')
  plate.scale.set(1.7, 0.44, 1)
  plate.renderOrder = 1
  return plate
}

function fieldNumber(text: string) {
  const numberCanvas = document.createElement('canvas')
  numberCanvas.width = 256
  numberCanvas.height = 128
  const numberContext = numberCanvas.getContext('2d')!
  numberContext.fillStyle = '#ffffff'
  numberContext.font = 'bold 78px Arial'
  numberContext.textAlign = 'center'
  numberContext.textBaseline = 'middle'
  numberContext.fillText(text, 128, 64)
  const texture = new THREE.CanvasTexture(numberCanvas)
  const number = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 2.75),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  number.rotation.x = -Math.PI / 2
  return number
}

function createField() {
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(53.3, 120),
    new THREE.MeshStandardMaterial({ color: 0x168044, roughness: 0.95 }),
  )
  field.rotation.x = -Math.PI / 2
  field.position.set(0, 0, -42)
  world.add(field)

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  for (let yard = 0; yard <= 100; yard += 5) {
    const z = 8 - yard
    const line = new THREE.Mesh(new THREE.PlaneGeometry(53.3, yard % 10 === 0 ? 0.16 : 0.08), lineMaterial)
    line.rotation.x = -Math.PI / 2
    line.position.set(0, 0.025, z)
    world.add(line)

    if (yard % 10 === 0 && yard > 0 && yard < 100) {
      for (const x of [-18.5, 18.5]) {
        const number = fieldNumber(String(yard))
        number.position.set(x, 0.035, z + 1.2)
        world.add(number)
      }
    }

    if (yard > 0 && yard < 100) {
      for (const x of [-10, 10]) {
        const hash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.08), lineMaterial)
        hash.rotation.x = -Math.PI / 2
        hash.position.set(x, 0.03, z)
        world.add(hash)
      }
    }
  }

  for (const x of [-26.7, 26.7]) {
    const sideline = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 120), lineMaterial)
    sideline.rotation.x = -Math.PI / 2
    sideline.position.set(x, 0.03, -42)
    world.add(sideline)
  }

  const endZone = new THREE.Mesh(
    new THREE.PlaneGeometry(53.3, 10),
    new THREE.MeshStandardMaterial({ color: 0xf97316 }),
  )
  endZone.rotation.x = -Math.PI / 2
  endZone.position.set(0, 0.02, -97)
  world.add(endZone)
  const touchdown = labelSprite('BOO BEARS', '#fff7ed')
  touchdown.position.set(0, 0.08, -97)
  touchdown.rotation.x = -Math.PI / 2
  touchdown.scale.set(11, 3.3, 1)
  world.add(touchdown)

  const homeEndZone = new THREE.Mesh(
    new THREE.PlaneGeometry(53.3, 10),
    new THREE.MeshStandardMaterial({ color: 0x4c1d95 }),
  )
  homeEndZone.rotation.x = -Math.PI / 2
  homeEndZone.position.set(0, 0.02, 13)
  world.add(homeEndZone)
  const homeEndZoneLabel = labelSprite('GO VIKINGS', '#fef08a')
  homeEndZoneLabel.position.set(0, 0.08, 13)
  homeEndZoneLabel.rotation.x = -Math.PI / 2
  homeEndZoneLabel.scale.set(11, 3.3, 1)
  world.add(homeEndZoneLabel)

  createGoalPost(-102, 1)
  createGoalPost(18, -1)
}

function createGoalPost(z: number, facing: number) {
  const gold = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.45, roughness: 0.3 })
  const post = new THREE.Group()
  const addBar = (x: number, y: number, length: number, horizontal = false) => {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, length, 10), gold)
    bar.position.set(x, y, 0)
    if (horizontal) bar.rotation.z = Math.PI / 2
    post.add(bar)
  }
  // The support is behind the end line; the uprights frame every kick from either direction.
  addBar(0, 4, 8)
  addBar(0, 7.2, 18.5, true)
  addBar(-9.25, 12, 9.6)
  addBar(9.25, 12, 9.6)
  post.position.set(0, 0, z)
  post.rotation.y = facing === 1 ? 0 : Math.PI
  world.add(post)
}

function createStadium() {
  const standColors = [0x17233b, 0x253654, 0x334b70]
  const fanColors = [0xf8fafc, 0xfbbf24, 0x38bdf8, 0xf43f5e, 0x22c55e, 0xa78bfa, 0xfb923c]
  const fanHeadGeometry = new THREE.SphereGeometry(0.15, 8, 6)
  const fanBodyGeometry = new THREE.CylinderGeometry(0.19, 0.26, 0.52, 7)
  const fanShoulderGeometry = new THREE.BoxGeometry(0.52, 0.24, 0.32)
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.85 })
  const fanBodyMatrices = fanColors.map(() => [] as THREE.Matrix4[])
  const fanShoulderMatrices = fanColors.map(() => [] as THREE.Matrix4[])
  const fanHeadMatrices: THREE.Matrix4[] = []
  const fanTransform = new THREE.Object3D()

  const addFan = (x: number, y: number, z: number, colorIndex: number, facing = 0) => {
    const normalizedColorIndex = colorIndex % fanColors.length
    const bodyIndex = fanBodyMatrices[normalizedColorIndex].length
    const headIndex = fanHeadMatrices.length
    const scale = randomBetween(0.82, 1.12)
    fanTransform.rotation.set(0, facing, 0)
    fanTransform.scale.setScalar(scale)
    fanTransform.position.set(x, y + 0.28 * scale, z)
    fanTransform.updateMatrix()
    fanBodyMatrices[normalizedColorIndex].push(fanTransform.matrix.clone())
    fanTransform.position.y = y + 0.56 * scale
    fanTransform.updateMatrix()
    fanShoulderMatrices[normalizedColorIndex].push(fanTransform.matrix.clone())
    fanTransform.position.y = y + 0.72 * scale
    fanTransform.updateMatrix()
    fanHeadMatrices.push(fanTransform.matrix.clone())
    fanTransform.scale.setScalar(1)
    crowdMembers.push({ x, y, z, facing, phase: randomBetween(0, Math.PI * 2), scale, colorIndex: normalizedColorIndex, bodyIndex, headIndex })
  }

  // A deep bowl of stands wraps the field; the front rows sit back far enough to
  // leave a sideline apron for the benches.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 19; row += 1) {
      const x = side * (32 + row * 1.16)
      const y = 0.5 + row * 0.75
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 1.2, 122),
        new THREE.MeshStandardMaterial({ color: standColors[row % standColors.length], roughness: 0.82 }),
      )
      seats.position.set(x, y, -47)
      world.add(seats)
      for (let seat = 0; seat < 58; seat += 1) {
        addFan(x - side * 1.2, y + 0.52, -105 + seat * 2.08 + (row % 2) * 0.55, seat + row * 3, -side * Math.PI / 2)
      }
    }
  }

  for (const end of [1, -1]) {
    for (let row = 0; row < 15; row += 1) {
      const z = end === 1 ? 21 + row * 1.2 : -105 - row * 1.2
      const y = 0.5 + row * 0.75
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(102, 1.18, 2.3),
        new THREE.MeshStandardMaterial({ color: standColors[(row + 1) % standColors.length], roughness: 0.82 }),
      )
      seats.position.set(0, y, z)
      world.add(seats)
      for (let seat = 0; seat < 46; seat += 1) {
        addFan(-45 + seat * 2.0, y + 0.52, z - end * 1.2, seat * 2 + row, end === 1 ? Math.PI : 0)
      }
    }
  }

  // Use instancing so the packed crowd (several thousand fans) stays cheap.
  const buildFanLayer = (buckets: THREE.Matrix4[][], geometry: THREE.BufferGeometry, target: THREE.InstancedMesh[], skin = false) => {
    for (const [colorIndex, matrices] of buckets.entries()) {
      const mesh = new THREE.InstancedMesh(
        geometry,
        skin ? skinMaterial : new THREE.MeshStandardMaterial({ color: fanColors[colorIndex], roughness: 0.8 }),
        matrices.length,
      )
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
      mesh.instanceMatrix.needsUpdate = true
      world.add(mesh)
      target[colorIndex] = mesh
    }
  }
  buildFanLayer(fanBodyMatrices, fanBodyGeometry, crowdBodyMeshes)
  buildFanLayer(fanShoulderMatrices, fanShoulderGeometry, crowdShoulderMeshes)
  const heads = new THREE.InstancedMesh(fanHeadGeometry, skinMaterial, fanHeadMatrices.length)
  fanHeadMatrices.forEach((matrix, index) => heads.setMatrixAt(index, matrix))
  heads.instanceMatrix.needsUpdate = true
  world.add(heads)
  crowdHeadMesh = heads

  const outerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x111c30, roughness: 0.88 })
  for (const x of [-58, 58]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 24, 168), outerWallMaterial)
    wall.position.set(x, 9, -47)
    world.add(wall)
  }
  for (const z of [46, -140]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(126, 24, 2.6), outerWallMaterial)
    wall.position.set(0, 9, z)
    world.add(wall)
  }

  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x17243a, metalness: 0.45, roughness: 0.5, side: THREE.DoubleSide })
  const trussMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 })
  const roof = new THREE.Mesh(new THREE.BoxGeometry(118, 1.2, 168), roofMaterial)
  roof.position.set(0, 28, -47)
  world.add(roof)
  const skylight = new THREE.Mesh(
    new THREE.PlaneGeometry(45, 94),
    new THREE.MeshStandardMaterial({ color: 0x6ea7c8, emissive: 0x163b58, emissiveIntensity: 0.7, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  )
  skylight.rotation.x = Math.PI / 2
  skylight.position.set(0, 25.35, -47)
  world.add(skylight)
  for (let z = -105; z <= 11; z += 16) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(88, 0.32, 0.42), trussMaterial)
    truss.position.set(0, 24.95, z)
    world.add(truss)
  }
  for (let x = -38; x <= 38; x += 19) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 126), trussMaterial)
    truss.position.set(x, 24.95, -47)
    world.add(truss)
  }

  const scoreboard = new THREE.Mesh(
    new THREE.BoxGeometry(13, 6, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55 }),
  )
  scoreboard.position.set(0, 13, -110.5)
  world.add(scoreboard)
  scoreboardCanvas = document.createElement('canvas')
  scoreboardCanvas.width = 512
  scoreboardCanvas.height = 128
  scoreboardTexture = new THREE.CanvasTexture(scoreboardCanvas)
  const scoreboardText = new THREE.Sprite(new THREE.SpriteMaterial({ map: scoreboardTexture, transparent: true }))
  scoreboardText.position.set(0, 13, -110)
  scoreboardText.scale.set(12, 3, 1)
  world.add(scoreboardText)
  updateScoreboard()

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.35 })
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff7cc, emissive: 0xffd166, emissiveIntensity: 2.5 })
  for (const x of [-40, 40]) {
    for (const z of [-18, -76]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 21, 10), poleMaterial)
      pole.position.set(x, 13, z)
      world.add(pole)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.8), lampMaterial)
      lamp.position.set(x, 23.15, z)
      world.add(lamp)
    }
  }
}

// The sky: a hazy sun low over the far end zone plus puffy clouds ringing the
// bowl. Both use fog-exempt materials so distance doesn't wash them into the
// backdrop, and the clouds drift slowly across in the animation loop.
function createSky() {
  const sun = new THREE.Group()
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(7, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6da, fog: false }),
  )
  sun.add(sunCore)
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0xfff0bf, transparent: true, opacity: 0.5, depthWrite: false, fog: false }),
  )
  sunGlow.scale.set(42, 42, 1)
  sun.add(sunGlow)
  sun.position.set(-46, 33, -210)
  world.add(sun)

  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f8ff,
    roughness: 1,
    emissive: 0xbcd0ea,
    emissiveIntensity: 0.4,
    fog: false,
  })
  const puff = new THREE.SphereGeometry(1, 12, 8)
  const addCloud = (x: number, y: number, z: number, scale: number) => {
    const cloud = new THREE.Group()
    const lobes = 3 + Math.floor(Math.random() * 4)
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const blob = new THREE.Mesh(puff, cloudMaterial)
      const size = randomBetween(0.7, 1.5) * scale
      blob.scale.set(
        size * randomBetween(1.1, 1.9),
        size * randomBetween(0.45, 0.7),
        size * randomBetween(0.9, 1.4),
      )
      blob.position.set(randomBetween(-1.6, 1.6) * scale, randomBetween(-0.3, 0.4) * scale, randomBetween(-1, 1) * scale)
      cloud.add(blob)
    }
    cloud.position.set(x, y, z)
    cloud.userData.drift = randomBetween(0.8, 2.4)
    world.add(cloud)
    clouds.push(cloud)
  }
  // A band along the downfield horizon, framed by the open end of the stadium.
  for (let i = 0; i < 7; i += 1) addCloud(randomBetween(-160, 160), randomBetween(22, 46), randomBetween(-270, -180), randomBetween(6, 11))
  // A band behind the player for when you spin the camera around.
  for (let i = 0; i < 5; i += 1) addCloud(randomBetween(-160, 160), randomBetween(24, 50), randomBetween(150, 250), randomBetween(6, 10))
  // High scattered puffs, seen overhead through the skylight.
  for (let i = 0; i < 6; i += 1) addCloud(randomBetween(-100, 100), randomBetween(58, 92), randomBetween(-150, 60), randomBetween(7, 12))
}

// A single standing sideline figure: a benched player (with pads + helmet) or a
// head coach (bare head, ball cap, khakis). Both wear their team's colors.
function createSidelineFigure(x: number, z: number, jersey: number, trim: number, facing: number, isCoach: boolean) {
  const group = new THREE.Group()
  const jerseyMat = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.8 })
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.7 })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.85 })
  const pantsMat = new THREE.MeshStandardMaterial({ color: isCoach ? 0xcbb58a : 0xe5e7eb, roughness: 0.8 })
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.82, isCoach ? 1.15 : 1.45, 0.5), jerseyMat)
  torso.position.y = isCoach ? 1.12 : 1.22
  group.add(torso)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.2, 8), skinMat)
  neck.position.y = isCoach ? 1.74 : 1.98
  group.add(neck)
  if (!isCoach) {
    const pads = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), trimMat)
    pads.scale.set(1, 0.34, 0.6)
    pads.position.y = 1.95
    group.add(pads)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), trimMat)
    helmet.scale.set(1.04, 0.92, 1.04)
    helmet.position.y = 2.4
    group.add(helmet)
    const facemask = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 8), shoeMat)
    facemask.rotation.z = Math.PI / 2
    facemask.position.set(0, 2.28, 0.36)
    group.add(facemask)
  } else {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), skinMat)
    head.position.y = 1.92
    group.add(head)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), jerseyMat)
    cap.position.y = 2.02
    group.add(cap)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), jerseyMat)
    brim.position.set(0, 1.99, 0.27)
    group.add(brim)
  }
  // Arms: jersey (or polo) sleeve, bare forearm, hand. Coaches keep one arm bent
  // up holding a play sheet; benched players let both arms hang.
  const shoulderY = isCoach ? 1.55 : 1.72
  for (const armSide of [-1, 1]) {
    const raised = isCoach && armSide === 1
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.62, 8), jerseyMat)
    upper.position.set(armSide * 0.55, shoulderY - 0.3, raised ? 0.12 : 0)
    upper.rotation.z = -armSide * 0.2
    if (raised) upper.rotation.x = -0.5
    group.add(upper)
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.58, 8), skinMat)
    forearm.position.set(armSide * 0.66, shoulderY - 0.82, raised ? 0.5 : 0.04)
    forearm.rotation.z = -armSide * 0.12
    if (raised) forearm.rotation.x = -1.1
    group.add(forearm)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skinMat)
    hand.position.set(armSide * 0.7, raised ? shoulderY - 0.5 : shoulderY - 1.12, raised ? 0.66 : 0.06)
    group.add(hand)
  }
  if (isCoach) {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.4), new THREE.MeshStandardMaterial({ color: 0xf8fafc }))
    sheet.position.set(0.66, shoulderY - 0.44, 0.62)
    sheet.rotation.x = -0.5
    group.add(sheet)
  }
  for (const legX of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, isCoach ? 1.15 : 0.95, 7), pantsMat)
    leg.position.set(legX, isCoach ? 0.58 : 0.42, 0)
    group.add(leg)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.42), shoeMat)
    shoe.position.set(legX, 0.06, 0.12)
    group.add(shoe)
  }
  group.position.set(x, 0, z)
  group.rotation.y = facing + randomBetween(-0.35, 0.35)
  group.scale.setScalar(randomBetween(0.94, 1.06))
  world.add(group)
}

// Benches and coaching staff on each sideline, in the right team colors:
// the Vikings (purple) on the near sideline, the Bears (orange) across the way.
function createSidelines() {
  const khaki = 0xcbb58a
  const teams = [
    { jersey: 0x8b5cf6, trim: 0x0f172a, coachTop: 0x4c1d95, sideX: -29, facing: Math.PI / 2 },
    { jersey: 0xf97316, trim: 0x111827, coachTop: 0xc2410c, sideX: 29, facing: -Math.PI / 2 },
  ]
  for (const team of teams) {
    const inward = team.sideX < 0 ? 1 : -1
    // A deep bench: three staggered rows of players milling in the team area,
    // spanning most of the sideline between the 25s.
    for (let i = 0; i < 26; i += 1) {
      const z = -12 - i * 2.35
      const rowOffset = (i % 3) * 1.05
      const x = team.sideX + inward * (rowOffset + randomBetween(-0.3, 0.3))
      createSidelineFigure(x, z, team.jersey, team.trim, team.facing, false)
    }
    // Head coach out front near midfield, plus two assistants down the line.
    createSidelineFigure(team.sideX + inward * 2.1, -42, team.coachTop, khaki, team.facing, true)
    createSidelineFigure(team.sideX + inward * 1.6, -24, team.coachTop, khaki, team.facing, true)
    createSidelineFigure(team.sideX + inward * 1.6, -66, team.coachTop, khaki, team.facing, true)
  }
}

function createDefender(x: number, z: number, color: number, number: number, hasFootball = false, bucket: Defender[] = defenders) {
  const group = new THREE.Group()
  const uniform = new THREE.MeshStandardMaterial({ color })
  const dark = new THREE.MeshStandardMaterial({ color: 0x111827 })
  const padMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.75), uniform)
  torso.position.y = 1.25
  group.add(torso)
  const shoulderPads = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), padMaterial)
  shoulderPads.scale.set(0.88, 0.28, 0.5)
  shoulderPads.position.y = 1.95
  group.add(shoulderPads)
  const jerseyNumber = labelSprite(String(number))
  jerseyNumber.position.set(0, 1.25, 0.47)
  jerseyNumber.scale.set(1.3, 0.7, 1)
  jerseyNumber.renderOrder = 2
  ;(jerseyNumber.material as THREE.SpriteMaterial).depthTest = false
  group.add(jerseyNumber)
  const nameplate = jerseyNameplate(color)
  nameplate.position.set(0, 1.85, 0.4)
  nameplate.scale.set(1.7, 0.42, 1)
  group.add(nameplate)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), dark)
  helmet.scale.set(1.05, 0.92, 1.05)
  helmet.position.y = 2.45
  group.add(helmet)
  const facemaskBar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 8), padMaterial)
  facemaskBar.rotation.z = Math.PI / 2
  facemaskBar.position.set(0, 2.3, 0.48)
  group.add(facemaskBar)
  for (const barX of [-0.3, 0.3]) {
    const facemaskSupport = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), padMaterial)
    facemaskSupport.position.set(barX, 2.42, 0.48)
    group.add(facemaskSupport)
  }
  for (const legX of [-0.32, 0.32]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.1, 8), dark)
    leg.position.set(legX, 0.42, 0)
    group.add(leg)
    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), padMaterial)
    kneePad.scale.set(1, 0.7, 0.55)
    kneePad.position.set(legX, 0.42, 0.17)
    group.add(kneePad)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.62), dark)
    shoe.position.set(legX, 0.06, 0.16)
    group.add(shoe)
  }
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.85 })
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.26, 8), skinMaterial)
  neck.position.y = 2.05
  group.add(neck)
  // Arms: a short jersey sleeve over a bare forearm, ending in a gloved hand.
  for (const armSide of [-0.72, 0.72]) {
    const inward = armSide < 0 ? -1 : 1
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.7, 8), uniform)
    sleeve.position.set(armSide, 1.55, 0)
    sleeve.rotation.z = -inward * 0.24
    group.add(sleeve)
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.68, 8), skinMaterial)
    forearm.position.set(armSide + inward * 0.14, 0.95, 0.05)
    forearm.rotation.z = -inward * 0.12
    group.add(forearm)
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), padMaterial)
    glove.position.set(armSide + inward * 0.2, 0.6, 0.08)
    group.add(glove)
  }
  const football = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 14, 9),
    new THREE.MeshStandardMaterial({ color: 0x8b451f, roughness: 0.7 }),
  )
  football.scale.set(0.72, 1.35, 0.72)
  football.position.set(0.42, 1.08, -0.42)
  football.rotation.z = -0.5
  football.visible = hasFootball
  group.add(football)
  if (hasFootball) {
    const ballMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.25, 24),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
    )
    ballMarker.rotation.x = -Math.PI / 2
    ballMarker.position.y = 0.05
    group.add(ballMarker)
    const ballLabel = labelSprite('BALL CARRIER', '#fef08a')
    ballLabel.position.set(0, 3.8, 0)
    ballLabel.scale.set(2.6, 0.75, 1)
    ballLabel.renderOrder = 3
    ;(ballLabel.material as THREE.SpriteMaterial).depthTest = false
    group.add(ballLabel)
  }
  group.position.set(x, 0, z)
  world.add(group)
  const defender: Defender = {
    mesh: group,
    x,
    z,
    runPhase: randomBetween(0, Math.PI * 2),
    football,
    role: 'rush',
    coverIndex: -1,
    speed: 8,
    homeX: x,
    stumbleUntil: 0,
    blockedUntil: 0,
  }
  bucket.push(defender)
  return defender
}

function playCrowdCheer() {
  if (!audioContext || audioContext.state !== 'running') return
  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const cheerGain = audioContext.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(randomBetween(180, 280), now)
  oscillator.frequency.linearRampToValueAtTime(randomBetween(260, 390), now + 0.32)
  cheerGain.gain.setValueAtTime(0.0001, now)
  cheerGain.gain.exponentialRampToValueAtTime(0.018, now + 0.06)
  cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
  oscillator.connect(cheerGain).connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.56)
}

function createReceiver(x: number, breakX: number, targetX: number, routeDepth: number, number: number) {
  const group = new THREE.Group()
  const uniform = new THREE.MeshStandardMaterial({ color: 0x8b5cf6 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x0f172a })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.35, 0.58), uniform)
  torso.position.y = 1.12
  group.add(torso)
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.85 })
  const shoulderPads = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), dark)
  shoulderPads.scale.set(1, 0.32, 0.6)
  shoulderPads.position.y = 1.72
  group.add(shoulderPads)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.22, 8), skin)
  neck.position.y = 1.84
  group.add(neck)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), dark)
  helmet.scale.set(1.02, 0.94, 1.02)
  helmet.position.y = 2.05
  group.add(helmet)
  const facemask = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), dark)
  facemask.rotation.z = Math.PI / 2
  facemask.position.set(0, 1.93, 0.34)
  group.add(facemask)
  const nameplate = jerseyNameplate(0x8b5cf6)
  nameplate.position.set(0, 1.42, 0.31)
  nameplate.scale.set(1.5, 0.4, 1)
  group.add(nameplate)
  for (const legX of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 7), dark)
    leg.position.set(legX, 0.38, 0)
    group.add(leg)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.13, 0.5), dark)
    shoe.position.set(legX, 0.05, 0.14)
    group.add(shoe)
  }
  for (const armX of [-0.52, 0.52]) {
    const inward = armX < 0 ? -1 : 1
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 7), uniform)
    arm.position.set(armX, 1.5, -0.06)
    arm.rotation.z = -inward * 0.32
    group.add(arm)
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.5, 7), skin)
    forearm.position.set(armX + inward * 0.14, 1.06, 0)
    forearm.rotation.z = -inward * 0.16
    group.add(forearm)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin)
    hand.position.set(armX + inward * 0.22, 0.82, 0.02)
    group.add(hand)
  }
  const heldFootball = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 14, 9),
    new THREE.MeshStandardMaterial({ color: 0x8b451f, roughness: 0.7 }),
  )
  heldFootball.scale.set(0.72, 1.35, 0.72)
  heldFootball.position.set(0.42, 1.08, -0.42)
  heldFootball.rotation.z = -0.5
  heldFootball.visible = false
  group.add(heldFootball)
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.68, 20),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  )
  marker.rotation.x = -Math.PI / 2
  marker.position.y = 0.04
  group.add(marker)
  const label = labelSprite(String(number), '#fef08a')
  label.position.set(0, 3.05, 0)
  label.scale.set(0.8, 0.42, 1)
  group.add(label)
  group.position.set(x, 0, state.cameraZ - 8)
  world.add(group)
  receivers.push({ mesh: group, target: marker, heldFootball, startX: x, breakX, targetX, startZ: group.position.z, routeDepth, routePhase: randomBetween(0, Math.PI * 2) })
}

function createLineman(x: number, z: number, number: number) {
  const group = new THREE.Group()
  const uniform = new THREE.MeshStandardMaterial({ color: 0x8b5cf6 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x0f172a })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.65, 0.9), uniform)
  torso.position.y = 1.22
  group.add(torso)
  const pads = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), uniform)
  pads.scale.set(1.05, 0.32, 0.58)
  pads.position.y = 1.92
  group.add(pads)
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.85 })
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.24, 8), skin)
  neck.position.y = 2.02
  group.add(neck)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), dark)
  helmet.scale.set(1.05, 0.92, 1.05)
  helmet.position.y = 2.4
  group.add(helmet)
  const facemask = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.58, 8), dark)
  facemask.rotation.z = Math.PI / 2
  facemask.position.set(0, 2.26, 0.44)
  group.add(facemask)
  // Beefy arms braced forward, ending in gloved hands, plus cleats.
  for (const armX of [-0.86, 0.86]) {
    const inward = armX < 0 ? -1 : 1
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.66, 8), uniform)
    sleeve.position.set(armX, 1.5, 0.02)
    sleeve.rotation.z = -inward * 0.3
    group.add(sleeve)
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.62, 8), skin)
    forearm.position.set(armX + inward * 0.16, 0.94, 0.16)
    forearm.rotation.z = -inward * 0.18
    forearm.rotation.x = -0.5
    group.add(forearm)
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), dark)
    glove.position.set(armX + inward * 0.24, 0.64, 0.4)
    group.add(glove)
  }
  for (const legX of [-0.34, 0.34]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 1.05, 8), dark)
    leg.position.set(legX, 0.44, 0)
    group.add(leg)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.56), dark)
    shoe.position.set(legX, 0.06, 0.16)
    group.add(shoe)
  }
  const label = labelSprite(String(number), '#fef08a')
  label.position.set(0, 1.3, -0.5)
  label.scale.set(0.72, 0.38, 1)
  group.add(label)
  group.position.set(x, 0, z)
  world.add(group)
  linemen.push({ mesh: group, startX: x, startZ: z, blockPhase: randomBetween(0, Math.PI * 2), assignment: null })
}

function buildOffensiveLine() {
  while (linemen.length) world.remove(linemen.pop()!.mesh)
  for (const [index, x] of [-7.2, -3.6, 0, 3.6, 7.2].entries()) {
    createLineman(x, state.cameraZ - 5.5, 60 + index)
  }
}

function buildReceivers(play: PassPlayId) {
  while (receivers.length) world.remove(receivers.pop()!.mesh)
  const routes: Record<PassPlayId, Array<[number, number, number, number]>> = {
    slant: [[-14, -8, 4, 29], [0, 4, 14, 33], [14, 8, -3, 28]],
    verticals: [[-16, -18, -20, 52], [0, 1, 2, 48], [16, 18, 20, 52]],
    flood: [[-15, -9, -2, 20], [-2, 8, 17, 34], [13, 18, 23, 46]],
    mesh: [[-16, -2, 14, 7], [16, 2, -14, 8], [2, 4, 6, 15]],
    paPost: [[-4, -8, 3, 42], [-18, -20, -22, 20], [18, 21, 23, 22]],
    screen: [[-11, -13, -15, -2], [11, 14, 17, 4], [1, 2, 3, 13]],
  }
  routes[play].forEach(([startX, breakX, targetX, routeDepth], index) => createReceiver(startX, breakX, targetX, routeDepth, index + 1))
}

function createPlayerView() {
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b48a })
  const jersey = new THREE.MeshStandardMaterial({ color: 0x8b5cf6 })
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.4, 10), armMaterial)
    arm.position.set(side * 0.62, -1.18, -1.75)
    arm.rotation.z = side * 0.35
    arm.rotation.x = side * 0.18
    playerView.add(arm)
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.48), jersey)
    sleeve.position.set(side * 0.7, -0.65, -1.65)
    playerView.add(sleeve)
  }

  playerFootball = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x8b451f }),
  )
  playerFootball.scale.set(0.72, 1.35, 0.72)
  playerFootball.position.set(0, -1.05, -1.7)
  playerFootball.rotation.z = -0.2
  playerView.add(playerFootball)
  thrownFootball = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x8b451f, roughness: 0.7 }),
  )
  thrownFootball.scale.set(0.72, 1.35, 0.72)
  thrownFootball.visible = false
  world.add(thrownFootball)
  camera.add(playerView)
}

function buildDefense() {
  while (defenders.length) {
    const defender = defenders.pop()!
    world.remove(defender.mesh)
  }
  const los = state.cameraZ
  // Four down linemen rushing the passer / attacking the run.
  const lineX = [-6.5, -2.4, 2.4, 6.5]
  for (let i = 0; i < 4; i += 1) {
    const d = createDefender(lineX[i] + randomBetween(-0.4, 0.4), los - 8 - randomBetween(0, 1), 0xf97316, 90 + i)
    d.role = 'rush'
    d.speed = 12
  }
  // Three linebackers: a spy on the quarterback plus two underneath defenders.
  const lbX = [-6, 0, 6]
  for (let i = 0; i < 3; i += 1) {
    const d = createDefender(lbX[i], los - 15 - randomBetween(0, 2), 0xf97316, 50 + i)
    d.role = i === 1 ? 'spy' : 'man'
    d.coverIndex = i === 0 ? 0 : 2
    d.homeX = lbX[i]
    d.speed = 13
  }
  // Two corners in man coverage, two safeties playing deep zone.
  const dbX = [-15, 15, -6, 6]
  for (let i = 0; i < 4; i += 1) {
    const deep = i >= 2
    const d = createDefender(dbX[i], los - (deep ? 30 : 17) - randomBetween(0, 3), 0xf97316, 20 + i)
    d.role = deep ? 'zone' : 'man'
    d.coverIndex = deep ? -1 : i
    d.homeX = dbX[i]
    d.speed = deep ? 12.5 : 13.5
  }
}

function clearPlayers() {
  while (defenders.length) world.remove(defenders.pop()!.mesh)
  while (linemen.length) world.remove(linemen.pop()!.mesh)
  while (receivers.length) world.remove(receivers.pop()!.mesh)
  while (teammates.length) world.remove(teammates.pop()!.mesh)
}

function startDefensiveSeries(spotZ: number, isKickoff: boolean, newSeries = true) {
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
  playerFootball.visible = false
  thrownFootball.visible = false

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
  const won = state.score > state.opponentScore
  const tied = state.score === state.opponentScore
  gameOverTitle.textContent = tied ? 'Final — Tie' : won ? 'Final — You win' : 'Final — You lose'
  gameOverScore.textContent = `You ${state.score} · Opponent ${state.opponentScore}`
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

function startGame() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = undefined
  state.score = 0
  state.opponentScore = 0
  state.quarter = 1
  state.gameClock = QUARTER_SECONDS
  state.playClock = PLAY_CLOCK_SECONDS
  state.clockEventHandled = false
  state.gameOver = false
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
  statusText.textContent = state.firstPossession === 'offense'
    ? 'You won the toss and will receive.'
    : 'Opponent won the toss and will receive.'
  schedule(() => kickoff(state.firstPossession), 900)
}

// Central down-and-distance advance for every way the offense can end a play.
function gainTo(newBallOn: number, lead = '', clockStops = false) {
  state.lastPlayStoppedClock = clockStops
  state.running = false
  state.ballOn = THREE.MathUtils.clamp(Math.round(newBallOn), 0, 100)
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

function offensiveMenu(lead: string) {
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
function giveBallToOpponent(oppYard: number, message: string) {
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

function startKick(type: KickType, distance: number) {
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
  playerFootball.visible = true
  thrownFootball.visible = false
  kickPrompt.textContent = `${type === 'extraPoint' ? 'Extra point' : `${distance}-yard field goal`} — press Space to kick`
  kickFill.style.width = '0%'
  kickMeter.classList.remove('is-hidden')
  statusText.textContent = `Line up the ${type === 'extraPoint' ? 'extra point' : 'field goal'} — time the meter!`
}

function resolveKick() {
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
  playerFootball.visible = false
  thrownFootball.visible = true
  thrownFootball.position.copy(from)
  statusText.textContent = 'The kick is up…'
}

function updateKickFlight(delta: number) {
  const k = state.kickFlight
  if (!k) return
  k.t += delta
  const p = Math.min(1, k.t / k.dur)
  const m = 1 - p
  // Quadratic Bezier: tee -> apex -> uprights.
  thrownFootball.position.set(
    m * m * k.from.x + 2 * m * p * k.ctrl.x + p * p * k.to.x,
    m * m * k.from.y + 2 * m * p * k.ctrl.y + p * p * k.to.y,
    m * m * k.from.z + 2 * m * p * k.ctrl.z + p * p * k.to.z,
  )
  thrownFootball.rotation.x += delta * 12
  if (p >= 1) {
    thrownFootball.visible = false
    const done = k
    state.kickFlight = null
    settleKick(done.type, done.distance, done.made)
  }
}

function settleKick(type: KickType, distance: number, made: boolean) {
  if (made) {
    state.score += type === 'extraPoint' ? 1 : 3
    statusText.textContent = `${type === 'extraPoint' ? 'EXTRA POINT' : `${distance}-YARD FIELD GOAL`} IS GOOD! You lead ${state.score}-${state.opponentScore}.`
    updateHud()
    if (state.quarter >= 5) {
      schedule(endGame, 1600)
      return
    }
    schedule(() => kickoff('defense'), 1500)
    return
  }
  if (type === 'extraPoint') {
    statusText.textContent = 'Extra point is NO GOOD. Kicking off.'
    updateHud()
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

function turnOverOnDowns() {
  state.running = false
  const oppYard = 100 - state.ballOn
  statusText.textContent = 'TURNOVER ON DOWNS — get ready to play defense!'
  updateHud()
  schedule(() => startDefensiveSeries(defensiveSpotZ(oppYard), false), 1200)
}

function scoreTouchdown() {
  state.running = false
  state.score += 6
  statusText.textContent = `TOUCHDOWN! You lead ${state.score}-${state.opponentScore}. Set up for the extra point.`
  updateHud()
  schedule(() => startKick('extraPoint', 33), 900)
}

function finishDefensivePlay(tackled: boolean) {
  state.running = false
  if (tackled) {
    const spotZ = state.ballCarrier?.z ?? state.defenseFirstDownZ
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
  playerFootball.visible = true
  thrownFootball.visible = false
  defenseCall.classList.add('is-hidden')
  playCall.classList.remove('is-hidden')
  statusText.textContent = `Your ball — 1st & 10 on the ${describeSpot(state.ballOn)}. Choose a play.`
  updateHud()
  footstepTimer = 0
}

function lineUpForSnap() {
  state.playerX = 0
  state.passTarget = null
  playerFootball.visible = true
  thrownFootball.visible = false
  camera.position.set(0, EYE_HEIGHT, state.cameraZ)
  resetView()
  playerView.position.x = 0
  playerView.rotation.z = 0
  buildDefense()
  buildOffensiveLine()
}

function renderPlayOptions() {
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
  }
}

function renderDefenseOptions() {
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

function startPlay(play: PlayId) {
  startAudio()
  if (state.gameOver || (!state.running && state.possession !== 'offense')) return
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

function throwTo(receiver: Receiver) {
  if (!state.running || state.throwing || state.afterCatch || isRunId(state.selectedPlay)) return
  state.throwing = true
  state.passTime = 0
  state.passTarget = receiver
  const flightTime = 0.72
  const catchX = receiver.mesh.position.x
  const catchZ = receiver.mesh.position.z
  // Nearest defender to the catch point, projected forward over the ball's flight.
  let separation = Infinity
  for (const d of defenders) {
    const towardX = Math.sign(catchX - d.x) * d.speed * flightTime * (d.role === 'man' || d.role === 'zone' ? 0.85 : 0.4)
    const projX = d.x + towardX
    const projZ = d.z - d.speed * flightTime * 0.35
    separation = Math.min(separation, Math.hypot(catchX - projX, catchZ - projZ))
  }
  const openness = THREE.MathUtils.clamp((separation - 1) / 4, 0, 1)
  const deep = receiver.routeDepth > 24
  state.passContested = separation < 2.2
  state.passComplete = Math.random() < 0.15 + openness * 0.8
  state.passPickable = !state.passComplete && state.passContested && Math.random() < 0.22
  state.passPI = !state.passComplete && !state.passPickable && state.passContested && deep && Math.random() < 0.28
  playerFootball.visible = false
  thrownFootball.visible = true
  passStart.set(camera.position.x, camera.position.y - 0.55, camera.position.z - 1.4)
  thrownFootball.position.copy(passStart)
  statusText.textContent = state.passContested ? 'Pass away — into tight coverage!' : 'Pass away!'
}

function updateReceivers(delta: number) {
  state.playTime += delta
  receivers.forEach((receiver) => {
    const routeProgress = Math.min(1, state.playTime / 3.4)
    const x = routeProgress < 0.35
      ? THREE.MathUtils.lerp(receiver.startX, receiver.breakX, routeProgress / 0.35)
      : THREE.MathUtils.lerp(receiver.breakX, receiver.targetX, (routeProgress - 0.35) / 0.65)
    const depth = Math.min(receiver.routeDepth, 8 + state.playTime * 8)
    receiver.mesh.position.set(x, 0, state.cameraZ - depth)
    receiver.mesh.rotation.y = Math.atan2(x - receiver.startX, -depth) * 0.25
    ;(receiver.target.material as THREE.MeshBasicMaterial).opacity = 0.72 + Math.sin(state.playTime * 7 + receiver.routePhase) * 0.23
  })
}

function updatePass(delta: number) {
  const receiver = state.passTarget
  if (!receiver) return
  state.passTime += delta
  const progress = Math.min(1, state.passTime / 0.72)
  const destination = receiver.mesh.position.clone().add(new THREE.Vector3(state.passComplete ? 0 : 2.4, state.passComplete ? 1.45 : 0.12, 0))
  thrownFootball.position.lerpVectors(passStart, destination, progress)
  thrownFootball.position.y += Math.sin(progress * Math.PI) * 4.2
  thrownFootball.rotation.x += delta * 22
  if (progress < 1) return

  state.throwing = false
  thrownFootball.visible = false
  state.running = false
  const spotYard = ballOnFromZ(receiver.mesh.position.z)
  if (state.passPickable) {
    // Interception: opponent takes over at the spot of the catch.
    giveBallToOpponent(100 - spotYard, 'INTERCEPTED! Opponent takes over.')
    return
  }
  if (state.passPI) {
    state.ballOn = THREE.MathUtils.clamp(spotYard, 1, 99)
    state.cameraZ = losZ(state.ballOn)
    state.down = 1
    state.firstDownTarget = Math.min(state.ballOn + 10, 100)
    state.lastPlayStoppedClock = true
    offensiveMenu('Defensive pass interference — automatic first down.')
    return
  }
  if (!state.passComplete) {
    state.lastPlayStoppedClock = true
    state.down += 1
    if (state.down > 4) {
      turnOverOnDowns()
      return
    }
    offensiveMenu(state.passContested ? 'Broken up.' : 'Incomplete.')
    return
  }
  // Completed pass: you take over as the ball carrier at the catch point and run
  // it yourself until the defense tackles you (or you reach the end zone).
  state.playerX = receiver.mesh.position.x
  state.cameraZ = receiver.mesh.position.z + 1.5
  state.ballOn = ballOnFromZ(state.cameraZ)
  camera.position.set(state.playerX, EYE_HEIGHT, state.cameraZ)
  aimCamera()
  if (state.ballOn >= 100) {
    gainTo(100, 'Complete — touchdown!')
    return
  }
  // Clear the routes so the catch can't be re-thrown, then hand you the ball.
  while (receivers.length) world.remove(receivers.pop()!.mesh)
  state.afterCatch = true
  state.running = true
  state.prevDirection = 0
  state.playerVX = 0
  state.playerVZ = 0
  footstepTimer = 0
  playerFootball.visible = true
  // Give yourself a step: a short no-tackle window, and the nearest defender in
  // coverage has to break down before he can bring you in.
  state.catchGraceUntil = state.playTime + 0.55
  let closest: Defender | null = null
  let closestDist = Infinity
  for (const d of defenders) {
    const dist = Math.hypot(d.x - state.playerX, d.z - state.cameraZ)
    if (dist < closestDist) {
      closestDist = dist
      closest = d
    }
  }
  if (closest && closestDist < 4.5) closest.stumbleUntil = state.playTime + 0.55
  statusText.textContent = 'Caught it — now run! WASD to move, Shift or Space to sprint.'
}

function updateScoreboard() {
  if (!scoreboardCanvas || !scoreboardTexture) return
  const ctx = scoreboardCanvas.getContext('2d')!
  ctx.clearRect(0, 0, 512, 128)
  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 44px Arial'
  ctx.fillText(`VIKINGS ${state.score}   BEARS ${state.opponentScore}`, 256, 42)
  ctx.font = 'bold 30px Arial'
  ctx.fillStyle = '#e2e8f0'
  ctx.fillText(`${state.quarter >= 5 ? 'OT' : ordinal(state.quarter)}   ${formatClock(state.gameClock)}`, 256, 92)
  scoreboardTexture.needsUpdate = true
}

function updateHud() {
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

function finishRunPlay() {
  state.selectedPlay = null
  const wasAfterCatch = state.afterCatch
  state.afterCatch = false
  const outOfBounds = Math.abs(state.playerX) >= 24
  gainTo(ballOnFromZ(state.cameraZ), wasAfterCatch ? 'Tackled after the catch.' : 'Tackled.', outOfBounds)
}

function sack() {
  if (!state.running) return
  state.selectedPlay = null
  state.sacked = true
  gainTo(ballOnFromZ(state.cameraZ), 'Sacked!', false)
}

function throwAway() {
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

// Steer a defender toward where the ball carrier will be, not where it is now,
// so pursuit reads as an angle rather than lateral teleporting.
function pursueTarget(d: Defender, tx: number, tz: number, tvx: number, tvz: number, delta: number) {
  const reachX = tx - d.x
  const reachZ = tz - d.z
  const dist = Math.hypot(reachX, reachZ) || 0.0001
  const lead = Math.min(dist / Math.max(d.speed, 1), 1.1)
  let aimX = tx + tvx * lead - d.x
  let aimZ = tz + tvz * lead - d.z
  const len = Math.hypot(aimX, aimZ) || 0.0001
  const slowed = d.stumbleUntil > state.playTime ? 0.34 : 1
  const step = d.speed * delta * slowed * MOVE_SCALE
  d.x = THREE.MathUtils.clamp(d.x + (aimX / len) * step, -25, 25)
  d.z += (aimZ / len) * step
}

// Resolve this frame's sprint state against the stamina pool and return the
// forward-speed target (yd/s): 17 sprinting, 12 jogging, ~10.5 when running on empty.
function resolveSprint(delta: number, moving: boolean) {
  const sprinting = keys.sprint && !state.gassed && state.stamina > 0
  if (sprinting && moving) {
    state.stamina = Math.max(0, state.stamina - delta * 0.4)
    if (state.stamina === 0) state.gassed = true
  } else {
    state.stamina = Math.min(1, state.stamina + delta * (moving ? 0.22 : 0.45))
    if (state.gassed && state.stamina > 0.4) state.gassed = false
  }
  state.sprinting = sprinting
  if (sprinting) return 17
  return state.stamina < 0.15 ? 10.5 : 12
}

function updateGame(delta: number) {
  if (!state.running) return
  if (state.possession === 'defense') {
    updateDefense(delta)
    return
  }
  updateReceivers(delta)
  if (state.throwing) {
    updatePass(delta)
    return
  }
  const isRunPlay = isRunId(state.selectedPlay)
  const runReady = !isRunPlay || state.playTime >= state.runDelay
  const direction = (keys.left ? -1 : 0) + (keys.right ? 1 : 0)
  const depthDirection = isRunPlay ? (runReady ? 1 : 0) : (keys.forward ? 1 : 0) + (keys.backward ? -1 : 0)
  const moving = isRunPlay || direction !== 0 || depthDirection !== 0
  const perSecond = resolveSprint(delta, moving) * MOVE_SCALE
  const speed = perSecond * delta
  state.playerX = THREE.MathUtils.clamp(state.playerX + direction * delta * 12 * MOVE_SCALE, -22, 22)
  state.cameraZ -= depthDirection * speed
  state.ballOn = ballOnFromZ(state.cameraZ)
  state.playerVX = direction * 12 * MOVE_SCALE
  state.playerVZ = -depthDirection * perSecond
  const cutThisFrame = direction !== 0 && Math.sign(direction) !== Math.sign(state.prevDirection) && state.prevDirection !== 0
  state.prevDirection = direction
  camera.position.x += (state.playerX - camera.position.x) * Math.min(1, delta * 10)
  camera.position.z = state.cameraZ
  aimCamera()
  playerView.position.x = (state.playerX - camera.position.x) * 0.18
  playerView.rotation.z = -direction * 0.04
  if (moving) {
    footstepTimer -= delta
    if (footstepTimer <= 0) {
      playFootstep()
      footstepTimer = state.sprinting ? 0.2 : 0.3
    }
  }

  const ballLive = !state.throwing
  // After a catch you are a runner, not a passer — no sack, everyone pursues you.
  const passDropback = !isRunPlay && !state.throwing && !state.afterCatch
  const crossedLos = state.afterCatch || state.cameraZ < state.snapZ - 0.5

  for (const lineman of linemen) {
    const foe = lineman.assignment
    if (foe && foe.blockedUntil > state.playTime) {
      // Actively wall the assigned rusher off from the quarterback.
      const guardX = THREE.MathUtils.lerp(foe.x, state.playerX, 0.35)
      const guardZ = foe.z - 0.9
      lineman.mesh.position.set(guardX, Math.abs(Math.sin(state.playTime * 9 + lineman.blockPhase)) * 0.05, guardZ)
      lineman.mesh.rotation.y = Math.atan2(state.playerX - foe.x, 0.8) * 0.4
    } else {
      const drive = Math.min(state.playTime * (isRunPlay ? 2.6 : 1.2), isRunPlay ? 5 : 3)
      lineman.mesh.position.set(
        lineman.startX + Math.sin(state.playTime * 5 + lineman.blockPhase) * 0.18,
        Math.abs(Math.sin(state.playTime * 8 + lineman.blockPhase)) * 0.05,
        lineman.startZ - drive,
      )
      lineman.mesh.rotation.y = Math.sin(state.playTime * 3 + lineman.blockPhase) * 0.08
    }
  }

  let freeRushersAtQb = 0
  for (const defender of defenders) {
    const covered = defender.coverIndex >= 0 ? receivers[defender.coverIndex] : undefined
    if (defender.blockedUntil > state.playTime && defender.role === 'rush') {
      // Held up at the line — shove against the blocker but make no ground.
      defender.x += Math.sin(state.playTime * 7 + defender.runPhase) * 0.4 * delta
      defender.z += 0.5 * delta
    } else if (defender.role === 'rush') {
      pursueTarget(defender, state.playerX, state.cameraZ, state.playerVX, state.playerVZ, delta)
      if (passDropback && Math.hypot(defender.x - state.playerX, defender.z - state.cameraZ) < 1.7) freeRushersAtQb += 1
    } else if (defender.role === 'spy') {
      if (isRunPlay || crossedLos) {
        pursueTarget(defender, state.playerX, state.cameraZ, state.playerVX, state.playerVZ, delta)
      } else {
        defender.x += (state.playerX - defender.x) * Math.min(1, delta * 4)
        defender.z += ((state.cameraZ - 5) - defender.z) * Math.min(1, delta * 3)
      }
    } else if (defender.role === 'man') {
      if (covered && !state.throwing) {
        pursueTarget(defender, covered.mesh.position.x, covered.mesh.position.z - 1.1, 0, 0, delta)
      } else {
        pursueTarget(defender, state.playerX, state.cameraZ, state.playerVX, state.playerVZ, delta)
      }
    } else {
      // Zone: hold a landmark until the ball carrier commits, then drive on it.
      if (isRunPlay || crossedLos || state.playTime > 2.4) {
        pursueTarget(defender, state.playerX, state.cameraZ, state.playerVX, state.playerVZ, delta)
      } else {
        const landmarkZ = state.cameraZ - 16
        defender.x += (defender.homeX * 1.2 - defender.x) * Math.min(1, delta * 2.4)
        defender.z += (landmarkZ - defender.z) * Math.min(1, delta * 2.2)
      }
    }

    defender.mesh.position.set(
      defender.x,
      Math.abs(Math.sin(performance.now() * 0.012 + defender.runPhase)) * 0.08,
      defender.z,
    )
    defender.mesh.rotation.z = Math.sin(performance.now() * 0.012 + defender.runPhase) * 0.035

    const inCatchGrace = state.afterCatch && state.playTime < state.catchGraceUntil
    if (ballLive && !inCatchGrace) {
      const near = Math.hypot(defender.x - state.playerX, defender.z - state.cameraZ)
      if (near < 1.7) {
        if (passDropback && defender.role === 'rush') {
          sack()
          return
        }
        // Break-down tackle: a hard cut at speed can make a poor-angle defender whiff.
        const badAngle = Math.abs(defender.x - state.playerX) > 1.1
        if (state.sprinting && cutThisFrame && badAngle && Math.random() < 0.5) {
          defender.stumbleUntil = state.playTime + 0.8
        } else {
          finishRunPlay()
          return
        }
      }
    }
  }

  if (passDropback && freeRushersAtQb === 0 && state.playTime > 2.4 && !state.pressureAnnounced) {
    state.pressureAnnounced = true
    statusText.textContent = 'PRESSURE — get rid of it! (press Q to throw it away)'
  }

  if (state.ballOn >= 100) {
    gainTo(100)
    return
  }
  updateHud()
}

function updateDefense(delta: number) {
  state.playTime += delta
  // On defense you face the offense, so forward takes you into the gap toward the runner.
  const direction = (keys.left ? 1 : 0) + (keys.right ? -1 : 0)
  const depthDirection = (keys.forward ? 1 : 0) + (keys.backward ? -1 : 0)
  const blocked = state.playerBlockedUntil > state.playTime
  const perSecond = resolveSprint(delta, direction !== 0 || depthDirection !== 0) * (blocked ? 0.45 : 1) * MOVE_SCALE
  state.playerX = THREE.MathUtils.clamp(state.playerX + direction * delta * 12 * (blocked ? 0.4 : 1) * MOVE_SCALE, -22, 22)
  state.cameraZ -= depthDirection * perSecond * delta
  camera.position.x += (state.playerX - camera.position.x) * Math.min(1, delta * 10)
  camera.position.z = state.cameraZ
  aimCamera()
  playerView.position.x = (state.playerX - camera.position.x) * 0.18
  playerView.rotation.z = -direction * 0.04

  footstepTimer -= delta
  if ((direction !== 0 || depthDirection !== 0) && footstepTimer <= 0) {
    playFootstep()
    footstepTimer = state.sprinting ? 0.2 : 0.3
  }

  const carrier = state.ballCarrier
  if (!carrier) {
    updateHud()
    return
  }

  // Pursuers: you plus your AI teammates, each with a way to be slowed by a blocker.
  const pursuers = [
    { getX: () => state.playerX, getZ: () => state.cameraZ, slow: () => { state.playerBlockedUntil = state.playTime + 0.28 } },
    ...teammates.map((t) => ({ getX: () => t.x, getZ: () => t.z, slow: () => { t.stumbleUntil = state.playTime + 0.28 } })),
  ]

  // --- Ball-carrier AI: run to the emptiest lane, juke a closing defender, break away.
  const lanes = [-16, -8, 0, 8, 16]
  let bestLane = state.carrierLaneX
  let bestCrowd = Infinity
  for (const laneX of lanes) {
    let crowd = Math.abs(laneX) * 0.05
    for (const p of pursuers) {
      const ahead = p.getZ() - carrier.z
      crowd += Math.max(0, 7 - Math.abs(p.getX() - laneX)) * (ahead > -3 ? 1.7 : 0.5)
    }
    if (crowd < bestCrowd) {
      bestCrowd = crowd
      bestLane = laneX
    }
  }
  state.carrierLaneX += (bestLane - state.carrierLaneX) * Math.min(1, delta * 1.8)

  let nearDist = Infinity
  for (const p of pursuers) nearDist = Math.min(nearDist, Math.hypot(p.getX() - carrier.x, p.getZ() - carrier.z))

  if (state.playTime > state.carrierNextJuke && nearDist < 3.6) {
    state.carrierJukeVX = (Math.random() < 0.5 ? -1 : 1) * randomBetween(7, 11)
    state.carrierJukeUntil = state.playTime + 0.32
    state.carrierNextJuke = state.playTime + randomBetween(1.1, 1.9)
  }
  const juking = state.playTime < state.carrierJukeUntil
  const fwd = (nearDist > 6 ? 15.5 : nearDist < 2.6 ? 8.5 : carrier.speed) * state.defCarrierSpeedMul * MOVE_SCALE
  carrier.z += fwd * delta
  const aimX = juking ? carrier.x + state.carrierJukeVX : state.carrierLaneX
  carrier.x = THREE.MathUtils.clamp(carrier.x + (aimX - carrier.x) * Math.min(1, delta * (juking ? 9 : 2.6)), -23, 23)
  carrier.mesh.position.set(carrier.x, Math.abs(Math.sin(performance.now() * 0.014 + carrier.runPhase)) * 0.1, carrier.z)
  carrier.mesh.rotation.z = Math.sin(performance.now() * 0.014 + carrier.runPhase) * 0.04

  // --- Blockers wall off whichever pursuer is closest to the carrier.
  for (const blocker of defenders) {
    if (blocker === carrier) continue
    let nearest = pursuers[0]
    let nd = Infinity
    for (const p of pursuers) {
      const d = Math.hypot(p.getX() - carrier.x, p.getZ() - carrier.z)
      if (d < nd) {
        nd = d
        nearest = p
      }
    }
    const guardX = THREE.MathUtils.lerp(nearest.getX(), carrier.x, 0.4)
    const guardZ = THREE.MathUtils.lerp(nearest.getZ(), carrier.z, 0.4)
    blocker.x += (guardX - blocker.x) * Math.min(1, delta * 3)
    blocker.z += (guardZ - blocker.z) * Math.min(1, delta * 3)
    if (Math.hypot(blocker.x - nearest.getX(), blocker.z - nearest.getZ()) < 1.4) nearest.slow()
    blocker.mesh.position.set(blocker.x, Math.abs(Math.sin(performance.now() * 0.012 + blocker.runPhase)) * 0.08, blocker.z)
  }

  // --- Teammate pursuit + tackle checks (you or a teammate can make the stop).
  const tackleRadius = state.defTackleRadius
  let tackled = Math.hypot(state.playerX - carrier.x, state.cameraZ - carrier.z) < tackleRadius
  for (const t of teammates) {
    pursueTarget(t, carrier.x, carrier.z, state.carrierJukeVX * (juking ? 1 : 0), fwd, delta)
    t.mesh.position.set(t.x, Math.abs(Math.sin(performance.now() * 0.013 + t.runPhase)) * 0.08, t.z)
    if (Math.hypot(t.x - carrier.x, t.z - carrier.z) < tackleRadius) tackled = true
  }
  // A clean juke can beat a defender with a poor angle.
  if (tackled && juking && Math.abs(state.playerX - carrier.x) > 1.2 && state.bigPlayAllowed && Math.random() < 0.5) {
    state.bigPlayAllowed = false
    tackled = false
    state.playerBlockedUntil = state.playTime + 0.5
  }
  if (tackled) {
    finishDefensivePlay(true)
    return
  }
  if (carrier.z >= USER_GOAL_LINE_Z) {
    finishDefensivePlay(false)
    return
  }
  updateHud()
}

function resize() {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  renderer.setSize(width, height, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function updateCrowd(time: number) {
  if (!crowdHeadMesh) return
  for (const fan of crowdMembers) {
    const s = fan.scale
    const jump = Math.max(0, Math.sin(time * 0.008 + fan.phase)) * 0.2
    const sway = Math.sin(time * 0.0022 + fan.phase) * 0.05
    crowdTransform.rotation.set(0, fan.facing + sway, 0)
    crowdTransform.scale.setScalar(s)
    crowdTransform.position.set(fan.x, fan.y + 0.28 * s + jump, fan.z)
    crowdTransform.updateMatrix()
    crowdBodyMeshes[fan.colorIndex].setMatrixAt(fan.bodyIndex, crowdTransform.matrix)
    crowdTransform.position.y = fan.y + 0.56 * s + jump
    crowdTransform.updateMatrix()
    crowdShoulderMeshes[fan.colorIndex].setMatrixAt(fan.bodyIndex, crowdTransform.matrix)
    crowdTransform.position.y = fan.y + 0.72 * s + jump * 1.05
    crowdTransform.updateMatrix()
    crowdHeadMesh.setMatrixAt(fan.headIndex, crowdTransform.matrix)
  }
  crowdTransform.scale.setScalar(1)
  crowdBodyMeshes.forEach((bodies) => { bodies.instanceMatrix.needsUpdate = true })
  crowdShoulderMeshes.forEach((shoulders) => { shoulders.instanceMatrix.needsUpdate = true })
  crowdHeadMesh.instanceMatrix.needsUpdate = true
}

function tickClocks(delta: number) {
  if (state.gameOver) return
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

function frame(time: number) {
  const delta = Math.min((time - state.lastTime) / 1000 || 0.016, 0.04)
  state.lastTime = time
  tickClocks(delta)
  if (state.kickType) {
    // The marker sweeps back and forth; Space locks in the current timing.
    state.kickPower = (Math.sin(time * 0.006) * 0.5 + 0.5) * 100
    kickFill.style.width = `${state.kickPower}%`
  }
  if (state.kickFlight) updateKickFlight(delta)
  updateGame(delta)
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.drift * delta
    if (cloud.position.x > 300) cloud.position.x -= 600
  }
  updateCrowd(time)
  const showStamina = state.running && !state.gameOver && !state.throwing && !state.kickType
  staminaMeter.classList.toggle('is-hidden', !showStamina)
  if (showStamina) {
    staminaFill.style.width = `${Math.round(state.stamina * 100)}%`
    staminaFill.style.backgroundColor = state.gassed ? '#ef4444' : state.stamina < 0.3 ? '#f59e0b' : '#22c55e'
    staminaMeter.classList.toggle('is-gassed', state.gassed)
  }
  if (!state.gameOver && state.running) updateHud()
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

scene.background = new THREE.Color(0x9bc7ed)
scene.fog = new THREE.Fog(0x9bc7ed, 35, 145)
scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0b5b2d, 2.5))
const sun = new THREE.DirectionalLight(0xffffff, 3)
sun.position.set(-20, 35, 15)
scene.add(sun)
scene.add(world)
scene.add(camera)
camera.position.set(0, EYE_HEIGHT, state.cameraZ)
camera.add(new THREE.AmbientLight(0xffffff, 0.5))
createField()
createStadium()
createSky()
createSidelines()
createPlayerView()
startGame()
resize()
window.addEventListener('resize', resize)
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return
  viewYaw -= event.movementX * 0.0025
  viewPitch = THREE.MathUtils.clamp(viewPitch - event.movementY * 0.0018, -0.3, 0.42)
  aimCamera()
})
window.addEventListener('keydown', (event) => {
  startAudio()
  if (event.key === ' ' && state.kickType) {
    resolveKick()
    event.preventDefault()
    return
  }
  if (['1', '2', '3'].includes(event.key) && state.running && !state.throwing) {
    const receiver = receivers[Number(event.key) - 1]
    if (receiver) throwTo(receiver)
    event.preventDefault()
    return
  }
  if (event.key.toLowerCase() === 'q' && state.running && !state.throwing && state.possession === 'offense') {
    throwAway()
    event.preventDefault()
    return
  }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = true
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = true
  if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.forward = true
  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') keys.backward = true
  if (event.key === ' ' || event.key.toLowerCase() === 'shift') keys.sprint = true
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's'].includes(event.key)) event.preventDefault()
})
window.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = false
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = false
  if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.forward = false
  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') keys.backward = false
  if (event.key === ' ' || event.key.toLowerCase() === 'shift') keys.sprint = false
})
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) {
  const move = button.dataset.move
  const setActive = (active: boolean) => {
    if (move === 'left') keys.left = active
    if (move === 'right') keys.right = active
    if (move === 'sprint') keys.sprint = active
  }
  button.addEventListener('pointerdown', () => {
    startAudio()
    setActive(true)
  })
  button.addEventListener('pointerup', () => setActive(false))
  button.addEventListener('pointerleave', () => setActive(false))
  button.addEventListener('pointercancel', () => setActive(false))
}
for (const tab of playTabs.querySelectorAll<HTMLButtonElement>('button')) {
  tab.addEventListener('click', () => {
    state.playTab = tab.dataset.tab as PlayTab
    renderPlayOptions()
  })
}
renderPlayOptions()
renderDefenseOptions()
canvas.addEventListener('pointerdown', (event) => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock()
  if (!state.running || state.throwing || receivers.length === 0) return
  const bounds = canvas.getBoundingClientRect()
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
  passRaycaster.setFromCamera(pointer, camera)
  const hits = passRaycaster.intersectObjects(receivers.map((receiver) => receiver.target), false)
  if (hits.length > 0) {
    const receiver = receivers.find((candidate) => candidate.target === hits[0].object)
    if (receiver) throwTo(receiver)
  }
})
resetButton.addEventListener('click', () => startGame())
newGameButton.addEventListener('click', () => startGame())
requestAnimationFrame(frame)
