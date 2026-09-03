import * as THREE from 'three'
import {
  EYE_HEIGHT,
  VIKINGS_PURPLE,
  canvas,
  formatClock,
  keys,
  ordinal,
  randomBetween,
  state,
} from './core.ts'
import type { CrowdMember } from './core.ts'

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
export const scene = new THREE.Scene()
export const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 420)
export const world = new THREE.Group()
export const playerView = new THREE.Group()

// First-person look direction. Reassigned by resetView() and the mouse handler.
export const view = { yaw: 0, pitch: 0 }

// The 3D scoreboard's live texture, wired up inside createStadium().
export const scoreboard = {
  canvas: null as HTMLCanvasElement | null,
  texture: null as THREE.CanvasTexture | null,
}

// Crowd & sky collections, populated by createStadium() / createSky().
export const crowdMembers: CrowdMember[] = []
export const clouds: THREE.Group[] = []
export const crowdBodyMeshes: THREE.InstancedMesh[] = []
export const crowdShoulderMeshes: THREE.InstancedMesh[] = []

// The instanced crowd's head layer, wired up inside createStadium().
export const crowdHead = { mesh: null as THREE.InstancedMesh | null }
const crowdTransform = new THREE.Object3D()

// While `performance.now()` is below this, the crowd jumps higher/faster —
// set by celebrateTouchdown() so the stands erupt after a score.
let crowdHypeUntil = 0

export function aimCamera() {
  const distance = 42
  camera.lookAt(
    camera.position.x + Math.sin(view.yaw) * distance,
    camera.position.y + view.pitch * distance,
    camera.position.z - Math.cos(view.yaw) * distance,
  )
}

export function resetView() {
  view.yaw = 0
  view.pitch = 0
  aimCamera()
}

export function releaseMouse() {
  if (document.pointerLockElement === canvas) document.exitPointerLock()
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null
let musicStep = 0

export function startAudio() {
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

export function playFootstep() {
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

// ---------------------------------------------------------------------------
// Text sprites & team marks
// ---------------------------------------------------------------------------

export function labelSprite(text: string, color = '#ffffff') {
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

function teamName(jerseyColor: number) {
  return jerseyColor === VIKINGS_PURPLE ? 'VIKINGS' : 'BEARS'
}

// A jersey nameplate across the chest. It respects depth so players in front
// cleanly occlude the ones behind them instead of the text stacking up.
export function jerseyNameplate(jerseyColor: number) {
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

// --- Team marks ---------------------------------------------------------------
// Trace a single Viking horn: a thick base at (cx,cy) that sweeps sideways in
// `dir` (+1 right, -1 left) and curls upward to a hooked point. Used one-per-side
// on helmets and as a mirrored pair for the midfield roundel.
// One horn as a tapered crescent bowing upward: thick through the middle, pointed
// at the base and the tip, drawn along a local axis then rotated to splay up/out.
function hornPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, dir: number) {
  const len = 150 * s
  const thick = 62 * s
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(dir * -0.62)
  ctx.scale(dir, 1)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  // outer (upper) edge bows high, inner (lower) edge bows shallow -> crescent
  ctx.quadraticCurveTo(len * 0.52, -thick * 2.0, len, -thick * 0.15)
  ctx.quadraticCurveTo(len * 0.5, -thick * 0.55, 0, 0)
  ctx.closePath()
  ctx.restore()
}

function paintHorns(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, pair: boolean, fill: string, stroke: string, lineWidth: number) {
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  for (const dir of pair ? [-1, 1] : [1]) {
    hornPath(ctx, cx, cy, s, dir)
    ctx.fill()
    ctx.stroke()
  }
}

// A four-toe bear paw print on a 256px canvas, centred on (128,128).
function drawPaw(ctx: CanvasRenderingContext2D, fill: string, stroke: string) {
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.ellipse(128, 156, 46, 42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  for (const [x, y, rx, ry] of [[74, 100, 19, 25], [110, 74, 19, 27], [146, 74, 19, 27], [182, 100, 19, 25]]) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

let hornsDecalTextureCache: THREE.CanvasTexture | null = null
function hornsDecalTexture() {
  if (hornsDecalTextureCache) return hornsDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  // A single rearward-curling horn, low and toward the back of the helmet.
  paintHorns(ctx, 66, 178, 0.95, false, '#f4efe0', '#e0a92c', 12)
  hornsDecalTextureCache = new THREE.CanvasTexture(c)
  return hornsDecalTextureCache
}

let pawDecalTextureCache: THREE.CanvasTexture | null = null
function pawDecalTexture() {
  if (pawDecalTextureCache) return pawDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  drawPaw(ctx, '#f8fafc', '#1f2937')
  pawDecalTextureCache = new THREE.CanvasTexture(c)
  return pawDecalTextureCache
}

// A helmet decal: a small plane on each side of the helmet, textured with the
// team's mark. The far side is mirrored so a directional mark (the horn) reads
// correctly from both profiles.
export function helmetDecal(teamColor: number, radius: number, y: number) {
  const group = new THREE.Group()
  const isVikings = teamColor === VIKINGS_PURPLE
  const texture = isVikings ? hornsDecalTexture() : pawDecalTexture()
  const w = radius * (isVikings ? 1.35 : 1.05)
  const h = radius * (isVikings ? 1.2 : 1.05)
  for (const side of [-1, 1]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    )
    decal.position.set(side * (radius + 0.02), y, isVikings ? -radius * 0.1 : 0)
    decal.rotation.y = side * Math.PI / 2
    decal.scale.x = side
    decal.renderOrder = 2
    group.add(decal)
  }
  return group
}

// Minnesota Vikings midfield mark: the horns in a gold-ringed purple roundel
// with the wordmark beneath, painted flat into the turf at the 50.
let vikingsLogoTextureCache: THREE.CanvasTexture | null = null
function vikingsLogoTexture() {
  if (vikingsLogoTextureCache) return vikingsLogoTextureCache
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 236, 0, Math.PI * 2)
  ctx.fillStyle = '#4f2d8f'
  ctx.fill()
  ctx.lineWidth = 18
  ctx.strokeStyle = '#f2c14a'
  ctx.stroke()
  // A mirrored pair of horns splaying out and up from the centre.
  paintHorns(ctx, size / 2, size / 2 + 40, 1.25, true, '#f4efe0', '#e0a92c', 12)
  ctx.fillStyle = '#f4efe0'
  ctx.font = 'bold 82px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VIKINGS', size / 2, size / 2 + 150)
  vikingsLogoTextureCache = new THREE.CanvasTexture(c)
  return vikingsLogoTextureCache
}

// ---------------------------------------------------------------------------
// Field, stadium, sky, sidelines
// ---------------------------------------------------------------------------

export function createField() {
  // A groundskeeping apron beyond the sidelines so the field doesn't end at the
  // white line, then the playing surface itself.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 240),
    new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 1 }),
  )
  apron.rotation.x = -Math.PI / 2
  apron.position.set(0, -0.04, -42)
  world.add(apron)

  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(53.3, 120),
    new THREE.MeshStandardMaterial({ color: 0x1a7a3f, roughness: 0.95 }),
  )
  field.rotation.x = -Math.PI / 2
  field.position.set(0, 0, -42)
  world.add(field)

  // Alternating mow stripes down the 100 yards of playing field.
  const stripeShades = [0x1c8446, 0x17703b]
  for (let yard = 0; yard < 100; yard += 5) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(53.3, 5),
      new THREE.MeshStandardMaterial({ color: stripeShades[(yard / 5) % 2], roughness: 0.95 }),
    )
    stripe.rotation.x = -Math.PI / 2
    stripe.position.set(0, 0.008, 8 - yard - 2.5)
    world.add(stripe)
  }

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  // NFL hash marks sit 70' 9" off each sideline — about 3.1 yards from centre —
  // and there's a mark on every single yard, not every five.
  for (let yard = 1; yard < 100; yard += 1) {
    const z = 8 - yard
    const big = yard % 5 === 0
    for (const x of [-3.1, 3.1]) {
      const hash = new THREE.Mesh(new THREE.PlaneGeometry(big ? 1 : 0.6, 0.09), lineMaterial)
      hash.rotation.x = -Math.PI / 2
      hash.position.set(x, 0.03, z)
      world.add(hash)
    }
    // Short reference ticks just inside each sideline.
    for (const x of [-25.5, 25.5]) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.09), lineMaterial)
      tick.rotation.x = -Math.PI / 2
      tick.position.set(x, 0.03, z)
      world.add(tick)
    }
  }

  for (let yard = 0; yard <= 100; yard += 5) {
    const z = 8 - yard
    const goalLine = yard === 0 || yard === 100
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(53.3, goalLine ? 0.34 : yard % 10 === 0 ? 0.16 : 0.09),
      lineMaterial,
    )
    line.rotation.x = -Math.PI / 2
    line.position.set(0, 0.025, z)
    world.add(line)

    if (yard % 10 === 0 && yard > 0 && yard < 100) {
      const label = yard <= 50 ? yard : 100 - yard
      for (const x of [-13.8, 13.8]) {
        const number = fieldNumber(String(label))
        number.position.set(x, 0.035, z)
        world.add(number)
        // Direction arrow pointing to the nearer goal line (omitted at the 50).
        if (label !== 50) {
          const arrowShape = new THREE.Shape()
          arrowShape.moveTo(0, 0.42)
          arrowShape.lineTo(-0.34, -0.22)
          arrowShape.lineTo(0.34, -0.22)
          arrowShape.closePath()
          const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), lineMaterial)
          arrow.rotation.x = -Math.PI / 2
          arrow.rotation.z = yard < 50 ? Math.PI : 0
          arrow.position.set(x < 0 ? x - 2.1 : x + 2.1, 0.035, z)
          world.add(arrow)
        }
      }
    }
  }

  // Vikings mark at midfield (the 50 is at z = -42).
  const midfieldLogo = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 17),
    new THREE.MeshBasicMaterial({ map: vikingsLogoTexture(), transparent: true, depthWrite: false }),
  )
  midfieldLogo.rotation.x = -Math.PI / 2
  midfieldLogo.position.set(0, 0.028, -42)
  world.add(midfieldLogo)

  for (const x of [-26.7, 26.7]) {
    const sideline = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 120), lineMaterial)
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

export function createStadium() {
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
  crowdHead.mesh = heads

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

  const scoreboardBox = new THREE.Mesh(
    new THREE.BoxGeometry(13, 6, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55 }),
  )
  scoreboardBox.position.set(0, 13, -110.5)
  world.add(scoreboardBox)
  scoreboard.canvas = document.createElement('canvas')
  scoreboard.canvas.width = 512
  scoreboard.canvas.height = 128
  scoreboard.texture = new THREE.CanvasTexture(scoreboard.canvas)
  const scoreboardText = new THREE.Sprite(new THREE.SpriteMaterial({ map: scoreboard.texture, transparent: true }))
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
export function createSky() {
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
export function createSidelines() {
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

// ---------------------------------------------------------------------------
// Per-frame world updates
// ---------------------------------------------------------------------------

export function updateScoreboard() {
  const sbCanvas = scoreboard.canvas
  const sbTexture = scoreboard.texture
  if (!sbCanvas || !sbTexture) return
  const ctx = sbCanvas.getContext('2d')!
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
  sbTexture.needsUpdate = true
}

export function updateCrowd(time: number) {
  const headMesh = crowdHead.mesh
  if (!headMesh) return
  const hype = time < crowdHypeUntil ? 1 : 0
  for (const fan of crowdMembers) {
    const s = fan.scale
    const jump = Math.max(0, Math.sin(time * (0.008 + hype * 0.004) + fan.phase)) * (0.2 + hype * 0.6)
    const sway = Math.sin(time * 0.0022 + fan.phase) * (0.05 + hype * 0.05)
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
    headMesh.setMatrixAt(fan.headIndex, crowdTransform.matrix)
  }
  crowdTransform.scale.setScalar(1)
  crowdBodyMeshes.forEach((bodies) => { bodies.instanceMatrix.needsUpdate = true })
  crowdShoulderMeshes.forEach((shoulders) => { shoulders.instanceMatrix.needsUpdate = true })
  headMesh.instanceMatrix.needsUpdate = true
}

// ---------------------------------------------------------------------------
// Touchdown celebration: a loud crowd roar + fireworks bursting over the bowl
// ---------------------------------------------------------------------------

// A very loud, layered stadium roar — filtered noise for the crowd, a rising
// tonal sheen on top, and a short whistle. Peaks far above the ambient cheer.
function playTouchdownRoar() {
  const ac = audioContext
  if (!ac || ac.state !== 'running') return
  const now = ac.currentTime
  const dur = 3.2

  const noise = ac.createBufferSource()
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  noise.buffer = buffer
  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 0.7
  band.frequency.setValueAtTime(500, now)
  band.frequency.linearRampToValueAtTime(1500, now + 1.2)
  band.frequency.linearRampToValueAtTime(900, now + dur)
  const roarGain = ac.createGain()
  roarGain.gain.setValueAtTime(0.0001, now)
  roarGain.gain.exponentialRampToValueAtTime(0.16, now + 0.08)
  roarGain.gain.linearRampToValueAtTime(0.45, now + 0.8)
  roarGain.gain.setValueAtTime(0.45, now + 1.7)
  roarGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  noise.connect(band).connect(roarGain).connect(ac.destination)
  noise.start(now)
  noise.stop(now + dur)

  for (const detune of [-6, 5]) {
    const osc = ac.createOscillator()
    const oscGain = ac.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180 + detune * 3, now)
    osc.frequency.linearRampToValueAtTime(430 + detune * 4, now + 1)
    oscGain.gain.setValueAtTime(0.0001, now)
    oscGain.gain.exponentialRampToValueAtTime(0.06, now + 0.15)
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4)
    osc.connect(oscGain).connect(ac.destination)
    osc.start(now)
    osc.stop(now + 2.5)
  }

  const whistle = ac.createOscillator()
  const whistleGain = ac.createGain()
  whistle.type = 'sine'
  whistle.frequency.setValueAtTime(2200, now)
  whistle.frequency.linearRampToValueAtTime(2650, now + 0.3)
  whistleGain.gain.setValueAtTime(0.0001, now)
  whistleGain.gain.exponentialRampToValueAtTime(0.035, now + 0.05)
  whistleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
  whistle.connect(whistleGain).connect(ac.destination)
  whistle.start(now)
  whistle.stop(now + 0.65)
}

type Firework = {
  points: THREE.Points
  material: THREE.PointsMaterial
  posAttr: THREE.BufferAttribute
  position: Float32Array
  velocity: Float32Array
  origin: THREE.Vector3
  phase: 'idle' | 'armed' | 'burst'
  t: number
  delay: number
  life: number
}

const FIREWORK_SHELLS = 8
const SPARKS_PER_SHELL = 80
const fireworks: Firework[] = []

function buildFireworks() {
  for (let i = 0; i < FIREWORK_SHELLS; i += 1) {
    const position = new Float32Array(SPARKS_PER_SHELL * 3)
    const posAttr = new THREE.BufferAttribute(position, 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', posAttr)
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.visible = false
    points.frustumCulled = false
    world.add(points)
    fireworks.push({
      points, material, posAttr, position,
      velocity: new Float32Array(SPARKS_PER_SHELL * 3),
      origin: new THREE.Vector3(),
      phase: 'idle', t: 0, delay: 0, life: 1.4,
    })
  }
}

const FIREWORK_PALETTE = [0xfbbf24, 0xf43f5e, 0x38bdf8, 0x22c55e, 0xa78bfa, 0xffffff, 0xfb923c, 0x34d399]

// Arm every shell to burst over the next ~2s at a staggered delay.
function launchFireworks() {
  fireworks.forEach((fw, i) => {
    fw.phase = 'armed'
    fw.t = 0
    fw.delay = i * 0.26 + randomBetween(0, 0.16)
    fw.life = randomBetween(1.2, 1.7)
    fw.material.color.setHex(FIREWORK_PALETTE[i % FIREWORK_PALETTE.length])
    // Downfield and low enough to sit in a first-person glance up from the field.
    fw.origin.set(randomBetween(-28, 28), randomBetween(13, 27), randomBetween(-100, -52))
  })
}

// Step the fireworks; call once per frame from the render loop.
export function updateFireworks(delta: number) {
  const gravity = 11
  for (const fw of fireworks) {
    if (fw.phase === 'idle') continue
    fw.t += delta

    if (fw.phase === 'armed') {
      if (fw.t < fw.delay) continue
      const speed = randomBetween(9, 14)
      for (let s = 0; s < SPARKS_PER_SHELL; s += 1) {
        const k = s * 3
        fw.position[k] = fw.origin.x
        fw.position[k + 1] = fw.origin.y
        fw.position[k + 2] = fw.origin.z
        const u = Math.random() * 2 - 1
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(1 - u * u)
        const mag = speed * (0.35 + Math.random() * 0.65)
        fw.velocity[k] = Math.cos(a) * r * mag
        fw.velocity[k + 1] = u * mag + 2
        fw.velocity[k + 2] = Math.sin(a) * r * mag
      }
      fw.points.visible = true
      fw.material.opacity = 1
      fw.phase = 'burst'
      fw.t = 0
    }

    if (fw.phase === 'burst') {
      const drag = Math.max(0, 1 - delta * 1.1)
      for (let s = 0; s < SPARKS_PER_SHELL; s += 1) {
        const k = s * 3
        fw.velocity[k + 1] -= gravity * delta
        fw.velocity[k] *= drag
        fw.velocity[k + 1] *= drag
        fw.velocity[k + 2] *= drag
        fw.position[k] += fw.velocity[k] * delta
        fw.position[k + 1] += fw.velocity[k + 1] * delta
        fw.position[k + 2] += fw.velocity[k + 2] * delta
      }
      fw.posAttr.needsUpdate = true
      fw.material.opacity = Math.max(0, 1 - fw.t / fw.life)
      if (fw.t >= fw.life) {
        fw.phase = 'idle'
        fw.points.visible = false
        fw.material.opacity = 0
      }
    }
  }
}

// One call, fired on a touchdown: deafening roar, fireworks, and a crowd that
// leaps out of its seats for a few seconds.
export function celebrateTouchdown() {
  playTouchdownRoar()
  launchFireworks()
  crowdHypeUntil = performance.now() + 4200
}

// ---------------------------------------------------------------------------
// Scene lighting & composition (runs on import)
// ---------------------------------------------------------------------------

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
buildFireworks()
