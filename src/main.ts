import * as THREE from 'three'
import './style.css'

type Defender = {
  mesh: THREE.Group
  x: number
  z: number
  runPhase: number
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="game-shell">
    <header class="top-bar">
      <div class="score-card"><span class="label">Score</span><strong id="score">0</strong></div>
      <div class="score-card"><span class="label">Yards</span><strong id="yards">0 / 100</strong></div>
      <button id="resetButton" class="reset-button" type="button">New Drive</button>
    </header>
    <div class="game-frame">
      <canvas id="gameCanvas" width="960" height="540" aria-label="3D first-person football game"></canvas>
      <div class="status-panel"><span id="statusText">Break through the defense!</span></div>
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
const statusText = document.querySelector<HTMLElement>('#statusText')!
const resetButton = document.querySelector<HTMLButtonElement>('#resetButton')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 260)
const world = new THREE.Group()
const playerView = new THREE.Group()
const defenders: Defender[] = []

const keys = { left: false, right: false, sprint: false }
const state = { score: 0, yards: 0, playerX: 0, cameraZ: 8, running: true, lastTime: 0 }

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
        const number = labelSprite(String(yard))
        number.position.set(x, 0.04, z + 1.2)
        number.rotation.x = -Math.PI / 2
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
  const standColors = [0x24324a, 0x334155, 0x475569]
  const seatGeometry = new THREE.BoxGeometry(2.5, 1.45, 110)
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row += 1) {
      const seats = new THREE.Mesh(
        seatGeometry,
        new THREE.MeshStandardMaterial({ color: standColors[row % standColors.length], roughness: 0.8 }),
      )
      seats.position.set(side * (29 + row * 1.35), 0.65 + row * 0.85, -47)
      world.add(seats)
    }
  }

  const fanHeadGeometry = new THREE.SphereGeometry(0.16, 8, 6)
  const fanBodyGeometry = new THREE.CylinderGeometry(0.2, 0.26, 0.52, 6)
  const fanColors = [0xf8fafc, 0xfbbf24, 0x38bdf8, 0xf43f5e, 0x22c55e, 0xa78bfa]
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row += 1) {
      for (let seat = 0; seat < 20; seat += 1) {
        const fan = new THREE.Group()
        const fanMaterial = new THREE.MeshStandardMaterial({ color: fanColors[(seat + row * 2) % fanColors.length] })
        const head = new THREE.Mesh(fanHeadGeometry, new THREE.MeshStandardMaterial({ color: 0xf0b48a }))
        const body = new THREE.Mesh(fanBodyGeometry, fanMaterial)
        head.position.y = 0.72
        body.position.y = 0.32
        fan.add(head, body)
        fan.position.set(
          side * (29 + row * 1.35),
          1.05 + row * 0.85,
          -101 + seat * 5.5 + (row % 2) * 1.2,
        )
        world.add(fan)
      }
    }
  }

  const endStandGeometry = new THREE.BoxGeometry(64, 1.15, 2.2)
  for (let row = 0; row < 4; row += 1) {
    const seats = new THREE.Mesh(
      endStandGeometry,
      new THREE.MeshStandardMaterial({ color: standColors[(row + 1) % standColors.length], roughness: 0.8 }),
    )
    seats.position.set(0, 0.55 + row * 0.78, -105 - row * 1.15)
    world.add(seats)
  }

  for (let row = 0; row < 4; row += 1) {
    for (let seat = 0; seat < 16; seat += 1) {
      const fan = new THREE.Group()
      const head = new THREE.Mesh(fanHeadGeometry, new THREE.MeshStandardMaterial({ color: 0xf0b48a }))
      const body = new THREE.Mesh(
        fanBodyGeometry,
        new THREE.MeshStandardMaterial({ color: fanColors[(seat * 2 + row) % fanColors.length] }),
      )
      head.position.y = 0.66
      body.position.y = 0.28
      fan.add(head, body)
      fan.position.set(-30 + seat * 4, 1.05 + row * 0.78, -104 - row * 1.15)
      world.add(fan)
    }
  }

  const stadiumWall = new THREE.Mesh(
    new THREE.BoxGeometry(78, 5, 2),
    new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.9 }),
  )
  stadiumWall.position.set(0, -1.5, -109)
  world.add(stadiumWall)

  const scoreboard = new THREE.Mesh(
    new THREE.BoxGeometry(13, 6, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55 }),
  )
  scoreboard.position.set(0, 9, -108)
  world.add(scoreboard)
  const scoreboardText = labelSprite('HOME  0   AWAY  0', '#fbbf24')
  scoreboardText.position.set(0, 9, -107.5)
  scoreboardText.scale.set(8, 1.6, 1)
  world.add(scoreboardText)

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.35 })
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff7cc, emissive: 0xffd166, emissiveIntensity: 2.5 })
  for (const x of [-35, 35]) {
    for (const z of [-18, -76]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 13, 10), poleMaterial)
      pole.position.set(x, 6.5, z)
      world.add(pole)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.8), lampMaterial)
      lamp.position.set(x, 13.15, z)
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

  const football = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x8b451f }),
  )
  football.scale.set(0.72, 1.35, 0.72)
  football.position.set(0, -1.05, -1.7)
  football.rotation.z = -0.2
  playerView.add(football)
  camera.add(playerView)
}

function buildDefense() {
  while (defenders.length) {
    const defender = defenders.pop()!
    world.remove(defender.mesh)
  }
  for (let index = 0; index < 11; index += 1) {
    createDefender(randomBetween(-22, 22), -18 - index * 7 - randomBetween(0, 5), 0xf97316, index + 1)
  }
}

function resetDrive() {
  state.yards = 0
  state.playerX = 0
  state.cameraZ = 8
  state.running = true
  buildDefense()
  statusText.textContent = 'Break through the defense!'
  updateHud()
}

function updateHud() {
  scoreEl.textContent = String(state.score)
  yardsEl.textContent = `${Math.min(Math.floor(state.yards), 100)} / 100`
}

function updateGame(delta: number) {
  if (!state.running) return
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
  button.addEventListener('pointerdown', () => setActive(true))
  button.addEventListener('pointerup', () => setActive(false))
  button.addEventListener('pointerleave', () => setActive(false))
  button.addEventListener('pointercancel', () => setActive(false))
}
resetButton.addEventListener('click', resetDrive)
requestAnimationFrame(frame)
