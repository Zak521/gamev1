import * as THREE from 'three'
import './style.css'

type Defender = {
  mesh: THREE.Group
  x: number
  z: number
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

function createDefender(x: number, z: number, color: number) {
  const group = new THREE.Group()
  const uniform = new THREE.MeshStandardMaterial({ color })
  const dark = new THREE.MeshStandardMaterial({ color: 0x111827 })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.75), uniform)
  torso.position.y = 1.25
  group.add(torso)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), dark)
  helmet.position.y = 2.45
  group.add(helmet)
  for (const legX of [-0.32, 0.32]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.1, 8), dark)
    leg.position.set(legX, 0.42, 0)
    group.add(leg)
  }
  group.position.set(x, 0, z)
  world.add(group)
  defenders.push({ mesh: group, x, z })
}

function createPlayerView() {
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b48a })
  const jersey = new THREE.MeshStandardMaterial({ color: 0x2563eb })
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
    createDefender(randomBetween(-22, 22), -18 - index * 7 - randomBetween(0, 5), index % 2 ? 0xef4444 : 0xf97316)
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
    defender.mesh.position.y = Math.sin(performance.now() * 0.008 + defender.z) * 0.04
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
