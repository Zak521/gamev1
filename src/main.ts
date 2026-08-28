import './style.css'

type Defender = {
  x: number
  z: number
  color: string
  lane: number
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App container not found')
}

app.innerHTML = `
  <div class="game-shell">
    <header class="top-bar">
      <div class="score-card">
        <span class="label">Score</span>
        <strong id="score">0</strong>
      </div>
      <div class="score-card">
        <span class="label">Yards</span>
        <strong id="yards">0 / 100</strong>
      </div>
      <button id="resetButton" class="reset-button" type="button">New Drive</button>
    </header>

    <div class="game-frame">
      <canvas id="gameCanvas" width="960" height="560" aria-label="3D football game"></canvas>
      <div class="status-panel">
        <span id="statusText">Break through the defense!</span>
      </div>
    </div>

    <div class="controls-panel">
      <div class="instructions">
        <span>Move: A / D or ← / →</span>
        <span>Sprint: Shift or Space</span>
        <span>Goal: reach the end zone</span>
      </div>
      <div class="touch-controls">
        <button type="button" data-move="left">Left</button>
        <button type="button" data-move="right">Right</button>
        <button type="button" data-move="sprint">Sprint</button>
      </div>
    </div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!
const scoreEl = document.querySelector<HTMLElement>('#score')!
const yardsEl = document.querySelector<HTMLElement>('#yards')!
const statusText = document.querySelector<HTMLElement>('#statusText')!
const resetButton = document.querySelector<HTMLButtonElement>('#resetButton')!

const ctx = canvas.getContext('2d')!

const keyState = {
  left: false,
  right: false,
  sprint: false,
}

const gameState = {
  score: 0,
  yards: 0,
  goal: 100,
  playerX: 0,
  defenders: [] as Defender[],
  running: true,
  lastFrame: 0,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function buildDefenders() {
  const next: Defender[] = []

  for (let index = 0; index < 8; index += 1) {
    next.push({
      x: randomBetween(-18, 18),
      z: 32 + index * 11 + randomBetween(0, 8),
      color: index % 2 === 0 ? '#f97316' : '#ef4444',
      lane: index,
    })
  }

  return next
}

function resetDrive() {
  gameState.playerX = 0
  gameState.yards = 0
  gameState.running = true
  gameState.defenders = buildDefenders()
  statusText.textContent = 'Break through the defense!'
  updateHud()
}

function updateHud() {
  scoreEl.textContent = String(gameState.score)
  yardsEl.textContent = `${Math.min(Math.floor(gameState.yards), gameState.goal)} / ${gameState.goal}`
}

function worldToScreen(z: number, x: number) {
  const horizonY = canvas.height * 0.24
  const groundY = canvas.height * 0.96
  const depth = 100
  const progress = 1 - z / depth
  const y = horizonY + progress * (groundY - horizonY)
  const offset = 30 + progress * 210
  const screenX = canvas.width / 2 + x * (0.8 + progress * 1.8) * 10 + (x * offset) / 120
  return { x: screenX, y, scale: 0.5 + progress * 1.5 }
}

function drawField() {
  const width = canvas.width
  const height = canvas.height
  const horizonY = height * 0.24
  const groundY = height * 0.96

  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#dfe7ff')
  sky.addColorStop(0.22, '#bccbff')
  sky.addColorStop(0.35, '#7ac7a7')
  sky.addColorStop(0.7, '#127a3d')
  sky.addColorStop(1, '#0a4d2a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#138a49'
  ctx.beginPath()
  ctx.moveTo(width * 0.22, horizonY)
  ctx.lineTo(width * 0.78, horizonY)
  ctx.lineTo(width * 0.92, groundY)
  ctx.lineTo(width * 0.08, groundY)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#0a5f34'
  ctx.fillRect(0, groundY - 10, width, 12)

  for (let index = 0; index < 14; index += 1) {
    const t = index / 14
    const y = horizonY + t * (groundY - horizonY)
    const left = width * 0.22 + t * (width * 0.7)
    const right = width * 0.78 - t * (width * 0.7)
    const lineAlpha = 0.7 - t * 0.4

    ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()

    if (index % 2 === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath()
      ctx.moveTo(width * 0.5 - 16, y)
      ctx.lineTo(width * 0.5 + 16, y)
      ctx.stroke()
    }
  }

  for (let yard = 0; yard < 10; yard += 1) {
    const t = yard / 10
    const x = width * 0.5 + (t - 0.5) * 340
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x - 2, horizonY + 12, 4, groundY - horizonY - 18)
  }

  ctx.fillStyle = '#dfefff'
  ctx.fillRect(width * 0.32, horizonY - 8, width * 0.36, 44)
  ctx.fillStyle = '#102a55'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('END ZONE', width * 0.5, horizonY + 20)

  ctx.strokeStyle = 'rgba(30, 41, 59, 0.65)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(width * 0.1, groundY)
  ctx.lineTo(width * 0.9, groundY)
  ctx.stroke()
}

function drawDefender(defender: Defender) {
  const point = worldToScreen(defender.z, defender.x)
  const { x, y, scale } = point

  ctx.fillStyle = 'rgba(11, 17, 25, 0.32)'
  ctx.beginPath()
  ctx.ellipse(x, y + 30 * scale, 18 * scale, 10 * scale, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#1f2937'
  ctx.beginPath()
  ctx.arc(x, y - 20 * scale, 11 * scale, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = defender.color
  ctx.fillRect(x - 14 * scale, y - 8 * scale, 28 * scale, 34 * scale)

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(x - 8 * scale, y - 4 * scale, 6 * scale, 20 * scale)
  ctx.fillRect(x + 2 * scale, y - 4 * scale, 6 * scale, 20 * scale)

  ctx.strokeStyle = '#131f2b'
  ctx.lineWidth = 2.5 * scale
  ctx.beginPath()
  ctx.moveTo(x - 12 * scale, y + 28 * scale)
  ctx.lineTo(x - 22 * scale, y + 40 * scale)
  ctx.moveTo(x + 12 * scale, y + 28 * scale)
  ctx.lineTo(x + 22 * scale, y + 40 * scale)
  ctx.stroke()
}

function drawPlayer() {
  const x = canvas.width / 2 + gameState.playerX * 18
  const y = canvas.height * 0.88

  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)'
  ctx.beginPath()
  ctx.ellipse(x, y + 34, 36, 12, 0, 0, Math.PI * 2)
  ctx.fill()

  const bodyGradient = ctx.createLinearGradient(x - 18, y - 48, x + 18, y + 22)
  bodyGradient.addColorStop(0, '#67e8f9')
  bodyGradient.addColorStop(0.5, '#2563eb')
  bodyGradient.addColorStop(1, '#1d4ed8')

  ctx.fillStyle = bodyGradient
  ctx.fillRect(x - 16, y - 42, 32, 34)

  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(x, y - 56, 12, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#dbeafe'
  ctx.fillRect(x - 8, y - 2, 6, 20)
  ctx.fillRect(x + 2, y - 2, 6, 20)

  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x - 14, y + 10)
  ctx.lineTo(x - 20, y + 34)
  ctx.moveTo(x + 14, y + 10)
  ctx.lineTo(x + 20, y + 34)
  ctx.stroke()

  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.arc(x + 22, y - 12, 6, 0, Math.PI * 2)
  ctx.fill()
}

function updateGame(delta: number) {
  if (!gameState.running) {
    return
  }

  const direction = (keyState.left ? -1 : 0) + (keyState.right ? 1 : 0)
  const sprintBoost = keyState.sprint ? 18 : 0
  const forwardSpeed = 24 + sprintBoost

  gameState.playerX += direction * delta * 22
  gameState.playerX = clamp(gameState.playerX, -18, 18)
  gameState.yards += forwardSpeed * delta * 0.75

  for (const defender of gameState.defenders) {
    defender.z -= forwardSpeed * delta * 0.65

    if (defender.z <= 2 && defender.z >= -1 && Math.abs(defender.x - gameState.playerX) < 2.8) {
      gameState.running = false
      statusText.textContent = 'Tackle! Hit New Drive to try again.'
      updateHud()
      return
    }
  }

  gameState.defenders = gameState.defenders.filter((defender) => defender.z > -6)

  if (gameState.yards >= gameState.goal) {
    gameState.running = false
    gameState.score += 1
    statusText.textContent = 'TOUCHDOWN! Nice run.'
    updateHud()
    return
  }

  while (gameState.defenders.length < 8) {
    gameState.defenders.push({
      x: randomBetween(-18, 18),
      z: 90 + randomBetween(0, 40),
      color: Math.random() > 0.5 ? '#f97316' : '#ef4444',
      lane: 0,
    })
  }

  updateHud()
}

function render() {
  drawField()

  for (const defender of gameState.defenders) {
    drawDefender(defender)
  }

  drawPlayer()
}

function frame(timestamp: number) {
  const delta = Math.min((timestamp - gameState.lastFrame) / 1000 || 0.016, 0.033)
  gameState.lastFrame = timestamp

  updateGame(delta)
  render()
  requestAnimationFrame(frame)
}

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
    keyState.left = true
    event.preventDefault()
  }

  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
    keyState.right = true
    event.preventDefault()
  }

  if (event.key === ' ' || event.key === 'Shift' || event.key.toLowerCase() === 'shift') {
    keyState.sprint = true
    event.preventDefault()
  }
})

window.addEventListener('keyup', (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
    keyState.left = false
  }

  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
    keyState.right = false
  }

  if (event.key === ' ' || event.key === 'Shift' || event.key.toLowerCase() === 'shift') {
    keyState.sprint = false
  }
})

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) {
  const moveType = button.dataset.move

  const activate = (active: boolean) => {
    if (moveType === 'left') {
      keyState.left = active
    }

    if (moveType === 'right') {
      keyState.right = active
    }

    if (moveType === 'sprint') {
      keyState.sprint = active
    }
  }

  button.addEventListener('pointerdown', () => activate(true))
  button.addEventListener('pointerup', () => activate(false))
  button.addEventListener('pointerleave', () => activate(false))
  button.addEventListener('pointercancel', () => activate(false))
}

resetButton.addEventListener('click', () => {
  resetDrive()
})

resetDrive()
requestAnimationFrame(frame)
