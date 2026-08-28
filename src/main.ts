import * as THREE from 'three'
import './style.css'

type Defender = {
  mesh: THREE.Group
  x: number
  z: number
  runPhase: number
}

type Receiver = {
  mesh: THREE.Group
  target: THREE.Mesh
  startX: number
  breakX: number
  targetX: number
  startZ: number
  routeDepth: number
  routePhase: number
}

type PlayId = 'slant' | 'verticals' | 'flood'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="game-shell">
    <header class="top-bar">
      <div class="score-card"><span class="label">Score</span><strong id="score">0</strong></div>
      <div class="score-card"><span class="label">Yards</span><strong id="yards">0 / 100</strong></div>
      <div class="score-card"><span class="label">Down</span><strong id="down">1 / 4</strong></div>
      <button id="resetButton" class="reset-button" type="button">New Drive</button>
    </header>
    <div class="game-frame">
      <canvas id="gameCanvas" width="960" height="540" aria-label="3D first-person football game"></canvas>
      <div class="status-panel"><span id="statusText">Break through the defense!</span></div>
      <div id="playCall" class="play-call" role="dialog" aria-label="Choose an offensive play">
        <span class="play-call-kicker">Offense · 1st &amp; 10</span>
        <h2>Pick a play</h2>
        <p>Choose a concept, then click a glowing receiver target to throw.</p>
        <div class="play-options">
          <button type="button" data-play="slant"><strong>Quick Slant</strong><span>Fast inside-breaking routes</span></button>
          <button type="button" data-play="verticals"><strong>Four Verticals</strong><span>Attack deep downfield</span></button>
          <button type="button" data-play="flood"><strong>Flood Right</strong><span>Three-level sideline read</span></button>
        </div>
      </div>
    </div>
    <div class="controls-panel">
      <div class="instructions">
        <span>Move: A / D or ← / →</span><span>Sprint: Shift or Space</span><span>Goal: reach the end zone</span>
      </div>
      <div class="touch-controls">
        <button type="button" data-move="left">Left</button><button type="button" data-move="right">Right</button><button type="button" data-move="sprint">Sprint</button>
      </div>
    </div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!
const scoreEl = document.querySelector<HTMLElement>('#score')!
const yardsEl = document.querySelector<HTMLElement>('#yards')!
const downEl = document.querySelector<HTMLElement>('#down')!
const statusText = document.querySelector<HTMLElement>('#statusText')!
const resetButton = document.querySelector<HTMLButtonElement>('#resetButton')!
const playCall = document.querySelector<HTMLDivElement>('#playCall')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 260)
const world = new THREE.Group()
const playerView = new THREE.Group()
const defenders: Defender[] = []
const receivers: Receiver[] = []
const passRaycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

const keys = { left: false, right: false, sprint: false }
const state = {
  score: 0,
  yards: 0,
  down: 1,
  firstDownYards: 0,
  playerX: 0,
  cameraZ: 8,
  running: false,
  lastTime: 0,
  playTime: 0,
  selectedPlay: null as PlayId | null,
  throwing: false,
  passTime: 0,
  passTarget: null as Receiver | null,
  passComplete: true,
}
let playerFootball: THREE.Mesh
let thrownFootball: THREE.Mesh

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
    new THREE.PlaneGeometry(53.3, 110),
    new THREE.MeshStandardMaterial({ color: 0x168044, roughness: 0.95 }),
  )
  field.rotation.x = -Math.PI / 2
  field.position.set(0, 0, -47)
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
    const sideline = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 110), lineMaterial)
    sideline.rotation.x = -Math.PI / 2
    sideline.position.set(x, 0.03, -47)
    world.add(sideline)
  }

  const endZone = new THREE.Mesh(
    new THREE.PlaneGeometry(53.3, 10),
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }),
  )
  endZone.rotation.x = -Math.PI / 2
  endZone.position.set(0, 0.02, -97)
  world.add(endZone)
  const touchdown = labelSprite('TOUCHDOWN')
  touchdown.position.set(0, 0.08, -97)
  touchdown.rotation.x = -Math.PI / 2
  touchdown.scale.set(11, 3.5, 1)
  world.add(touchdown)
}

function createStadium() {
  const standColors = [0x17233b, 0x253654, 0x334b70]
  const fanColors = [0xf8fafc, 0xfbbf24, 0x38bdf8, 0xf43f5e, 0x22c55e, 0xa78bfa, 0xfb923c]
  const fanHeadGeometry = new THREE.SphereGeometry(0.14, 7, 5)
  const fanBodyGeometry = new THREE.CylinderGeometry(0.19, 0.25, 0.5, 6)
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.85 })
  const fanBodyMatrices = fanColors.map(() => [] as THREE.Matrix4[])
  const fanHeadMatrices: THREE.Matrix4[] = []
  const fanTransform = new THREE.Object3D()

  const addFan = (x: number, y: number, z: number, colorIndex: number, facing = 0) => {
    fanTransform.position.set(x, y + 0.28, z)
    fanTransform.rotation.set(0, facing, 0)
    fanTransform.updateMatrix()
    fanBodyMatrices[colorIndex % fanColors.length].push(fanTransform.matrix.clone())
    fanTransform.position.y = y + 0.67
    fanTransform.updateMatrix()
    fanHeadMatrices.push(fanTransform.matrix.clone())
  }

  // A deeper bowl makes the stadium feel full while retaining a clear field-level view.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 12; row += 1) {
      const x = side * (29 + row * 1.18)
      const y = 0.55 + row * 0.72
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(2.25, 1.15, 112),
        new THREE.MeshStandardMaterial({ color: standColors[row % standColors.length], roughness: 0.82 }),
      )
      seats.position.set(x, y, -47)
      world.add(seats)
      for (let seat = 0; seat < 52; seat += 1) {
        addFan(x - side * 1.18, y + 0.5, -101 + seat * 2.1 + (row % 2) * 0.55, seat + row * 3, -side * Math.PI / 2)
      }
    }
  }

  for (const end of [1, -1]) {
    for (let row = 0; row < 10; row += 1) {
      const z = end === 1 ? 11.2 + row * 1.22 : -105.2 - row * 1.22
      const y = 0.5 + row * 0.72
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(82, 1.12, 2.25),
        new THREE.MeshStandardMaterial({ color: standColors[(row + 1) % standColors.length], roughness: 0.82 }),
      )
      seats.position.set(0, y, z)
      world.add(seats)
      for (let seat = 0; seat < 36; seat += 1) {
        addFan(-36 + seat * 2.05, y + 0.5, z - end * 1.15, seat * 2 + row, end === 1 ? Math.PI : 0)
      }
    }
  }

  // Use instancing so the packed crowd remains inexpensive to render.
  for (const [colorIndex, matrices] of fanBodyMatrices.entries()) {
    const bodies = new THREE.InstancedMesh(
      fanBodyGeometry,
      new THREE.MeshStandardMaterial({ color: fanColors[colorIndex], roughness: 0.8 }),
      matrices.length,
    )
    matrices.forEach((matrix, index) => bodies.setMatrixAt(index, matrix))
    bodies.instanceMatrix.needsUpdate = true
    world.add(bodies)
  }
  const heads = new THREE.InstancedMesh(fanHeadGeometry, skinMaterial, fanHeadMatrices.length)
  fanHeadMatrices.forEach((matrix, index) => heads.setMatrixAt(index, matrix))
  heads.instanceMatrix.needsUpdate = true
  world.add(heads)

  const outerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x111c30, roughness: 0.88 })
  for (const x of [-44, 44]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 13, 128), outerWallMaterial)
    wall.position.set(x, 4.5, -47)
    world.add(wall)
  }
  for (const z of [18, -112]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(90, 13, 2.6), outerWallMaterial)
    wall.position.set(0, 4.5, z)
    world.add(wall)
  }

  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x17243a, metalness: 0.45, roughness: 0.5, side: THREE.DoubleSide })
  const trussMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 })
  const roof = new THREE.Mesh(new THREE.BoxGeometry(90, 1.2, 130), roofMaterial)
  roof.position.set(0, 26, -47)
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
  const scoreboardText = labelSprite('HOME  0   AWAY  0', '#fbbf24')
  scoreboardText.position.set(0, 13, -110)
  scoreboardText.scale.set(8, 1.6, 1)
  world.add(scoreboardText)

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

function createDefender(x: number, z: number, color: number, number: number) {
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
  jerseyNumber.position.set(0, 1.35, 0.47)
  jerseyNumber.scale.set(1.3, 0.7, 1)
  jerseyNumber.renderOrder = 2
  ;(jerseyNumber.material as THREE.SpriteMaterial).depthTest = false
  group.add(jerseyNumber)
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
  group.position.set(x, 0, z)
  world.add(group)
  defenders.push({ mesh: group, x, z, runPhase: randomBetween(0, Math.PI * 2) })
}

function createReceiver(x: number, breakX: number, targetX: number, routeDepth: number, number: number) {
  const group = new THREE.Group()
  const uniform = new THREE.MeshStandardMaterial({ color: 0x8b5cf6 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x0f172a })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.35, 0.58), uniform)
  torso.position.y = 1.12
  group.add(torso)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), dark)
  helmet.position.y = 2.05
  group.add(helmet)
  for (const legX of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 7), dark)
    leg.position.set(legX, 0.38, 0)
    group.add(leg)
  }
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
  receivers.push({ mesh: group, target: marker, startX: x, breakX, targetX, startZ: group.position.z, routeDepth, routePhase: randomBetween(0, Math.PI * 2) })
}

function buildReceivers(play: PlayId) {
  while (receivers.length) world.remove(receivers.pop()!.mesh)
  const routes: Record<PlayId, Array<[number, number, number, number]>> = {
    slant: [[-14, -8, 4, 29], [0, 4, 14, 33], [14, 8, -3, 28]],
    verticals: [[-16, -18, -20, 52], [0, 1, 2, 48], [16, 18, 20, 52]],
    flood: [[-15, -9, -2, 20], [-2, 8, 17, 34], [13, 18, 23, 46]],
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
  for (let index = 0; index < 11; index += 1) {
    createDefender(randomBetween(-22, 22), state.cameraZ - 24 - index * 7 - randomBetween(0, 5), 0xf97316, index + 1)
  }
}

function resetDrive() {
  startAudio()
  state.yards = 0
  state.down = 1
  state.firstDownYards = 0
  state.playerX = 0
  state.cameraZ = 8
  state.running = false
  state.playTime = 0
  state.selectedPlay = null
  state.throwing = false
  state.passTime = 0
  state.passTarget = null
  buildDefense()
  while (receivers.length) world.remove(receivers.pop()!.mesh)
  playerFootball.visible = true
  thrownFootball.visible = false
  playCall.classList.remove('is-hidden')
  statusText.textContent = 'Choose a play to start the drive.'
  updateHud()
  footstepTimer = 0
}

function startPlay(play: PlayId) {
  startAudio()
  state.selectedPlay = play
  state.playTime = 0
  state.running = true
  buildDefense()
  buildReceivers(play)
  playCall.classList.add('is-hidden')
  statusText.textContent = `${state.down}${state.down === 1 ? 'st' : state.down === 2 ? 'nd' : state.down === 3 ? 'rd' : 'th'} down — click a glowing receiver, or press 1, 2, or 3 to throw.`
  updateHud()
}

function throwTo(receiver: Receiver) {
  if (!state.running || state.throwing) return
  state.throwing = true
  state.passTime = 0
  state.passTarget = receiver
  const closestDefender = defenders.reduce((nearest, defender) => Math.min(nearest, defender.mesh.position.distanceTo(receiver.mesh.position)), Infinity)
  state.passComplete = closestDefender > 4.5 || Math.random() > 0.62
  playerFootball.visible = false
  thrownFootball.visible = true
  passStart.set(camera.position.x, camera.position.y - 0.55, camera.position.z - 1.4)
  thrownFootball.position.copy(passStart)
  statusText.textContent = 'Pass away!'
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
  if (!state.passComplete) {
    state.down += 1
    if (state.down > 4) {
      statusText.textContent = 'GAME OVER — four downs without a first down.'
      updateHud()
      window.setTimeout(resetDrive, 1800)
    } else {
      state.selectedPlay = null
      playCall.classList.remove('is-hidden')
      statusText.textContent = `Incomplete pass. ${state.down}${state.down === 2 ? 'nd' : state.down === 3 ? 'rd' : 'th'} down — pick another play.`
      updateHud()
    }
    return
  }
  state.playerX = receiver.mesh.position.x
  state.cameraZ = receiver.mesh.position.z + 4
  camera.position.set(state.playerX, 2.35, state.cameraZ)
  camera.lookAt(state.playerX, 1.8, state.cameraZ - 42)
  state.yards = Math.min(100, Math.max(0, Math.round(8 - state.cameraZ)))
  if (state.yards >= 100) {
    state.score += 1
    statusText.textContent = 'TOUCHDOWN! Hit New Drive for another play.'
  } else {
    state.selectedPlay = null
    if (state.yards - state.firstDownYards >= 10) {
      state.firstDownYards = state.yards
      state.down = 1
      statusText.textContent = `Complete! First down at the ${state.yards}-yard line. Pick the next play.`
    } else {
      state.down += 1
      if (state.down > 4) {
        statusText.textContent = 'GAME OVER — four downs without a first down.'
        updateHud()
        window.setTimeout(resetDrive, 1800)
        return
      }
      statusText.textContent = `Complete! Ball at the ${state.yards}-yard line. ${state.down}${state.down === 2 ? 'nd' : state.down === 3 ? 'rd' : 'th'} down.`
    }
    playCall.classList.remove('is-hidden')
  }
  updateHud()
}

function updateHud() {
  scoreEl.textContent = String(state.score)
  yardsEl.textContent = `${Math.min(Math.floor(state.yards), 100)} / 100`
  downEl.textContent = `${Math.min(state.down, 4)} / 4`
}

function updateGame(delta: number) {
  if (!state.running) return
  updateReceivers(delta)
  if (state.throwing) {
    updatePass(delta)
    return
  }
  const direction = (keys.left ? -1 : 0) + (keys.right ? 1 : 0)
  const speed = (keys.sprint ? 31 : 20) * delta
  state.playerX = THREE.MathUtils.clamp(state.playerX + direction * delta * 12, -22, 22)
  state.cameraZ -= speed
  state.yards = Math.max(0, 8 - state.cameraZ)
  camera.position.x += (state.playerX - camera.position.x) * Math.min(1, delta * 10)
  camera.position.z = state.cameraZ
  camera.lookAt(camera.position.x, 1.8, state.cameraZ - 42)
  playerView.position.x = (state.playerX - camera.position.x) * 0.18
  playerView.rotation.z = -direction * 0.04
  footstepTimer -= delta
  if (footstepTimer <= 0) {
    playFootstep()
    footstepTimer = keys.sprint ? 0.2 : 0.3
  }

  for (const defender of defenders) {
    defender.z += 5.2 * delta
    defender.x += THREE.MathUtils.clamp(state.playerX - defender.x, -7, 7) * delta
    defender.mesh.position.set(
      defender.x,
      Math.abs(Math.sin(performance.now() * 0.012 + defender.runPhase)) * 0.08,
      defender.z,
    )
    defender.mesh.rotation.z = Math.sin(performance.now() * 0.012 + defender.runPhase) * 0.035
    const distance = defender.z - state.cameraZ
    if (distance > -1.2 && distance < 1.4 && Math.abs(defender.x - state.playerX) < 1.7) {
      state.running = false
      statusText.textContent = 'Tackle! Hit New Drive to try again.'
      return
    }
  }

  if (state.yards >= 100) {
    state.running = false
    state.score += 1
    statusText.textContent = 'TOUCHDOWN! Nice run.'
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

function frame(time: number) {
  const delta = Math.min((time - state.lastTime) / 1000 || 0.016, 0.04)
  state.lastTime = time
  updateGame(delta)
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
camera.position.set(0, 2.35, state.cameraZ)
camera.add(new THREE.AmbientLight(0xffffff, 0.5))
createField()
createStadium()
createPlayerView()
resetDrive()
resize()
window.addEventListener('resize', resize)
window.addEventListener('keydown', (event) => {
  startAudio()
  if (['1', '2', '3'].includes(event.key) && state.running && !state.throwing) {
    const receiver = receivers[Number(event.key) - 1]
    if (receiver) throwTo(receiver)
    event.preventDefault()
    return
  }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = true
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = true
  if (event.key === ' ' || event.key.toLowerCase() === 'shift') keys.sprint = true
  if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'd'].includes(event.key)) event.preventDefault()
})
window.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = false
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = false
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
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-play]')) {
  button.addEventListener('click', () => startPlay(button.dataset.play as PlayId))
}
canvas.addEventListener('pointerdown', (event) => {
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
resetButton.addEventListener('click', resetDrive)
requestAnimationFrame(frame)
