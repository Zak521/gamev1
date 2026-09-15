import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  END_ZONE_DEPTH,
  EYE_HEIGHT,
  TEAMS,
  canvas,
  cssHex,
  downAndDistance,
  formatClock,
  keys,
  ordinal,
  pickSkinTone,
  randomBetween,
  state,
} from './core.ts'
import type { CrowdMember, TeamId, TeamInfo } from './core.ts'
import {
  UNIFORM_KITS,
  addKitHelmetStripe,
  addKitLegStripe,
  addKitSleeveHoops,
  addKitSock,
  addKitYoke,
} from './kits.ts'

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

// The jumbotron's live score-bug texture, wired up inside createJumbotron().
export const scoreboard = {
  canvas: null as HTMLCanvasElement | null,
  texture: null as THREE.CanvasTexture | null,
}

// The jumbotron's scrolling sponsor ticker: a repeating texture whose UV
// offset is nudged forward every frame by updateJumbotronTicker(), rather
// than redrawing the canvas — cheap enough to run continuously.
const jumbotronTicker = {
  canvas: null as HTMLCanvasElement | null,
  texture: null as THREE.CanvasTexture | null,
  offset: 0,
}

// Crowd & sky collections, populated by createStadium() / createSky().
export const crowdMembers: CrowdMember[] = []
export const clouds: THREE.Group[] = []
export const crowdBodyMeshes: THREE.InstancedMesh[] = []
export const crowdShoulderMeshes: THREE.InstancedMesh[] = []
let crowdGroup: THREE.Group | null = null

// The instanced crowd's head and arm layers (both skin-toned, shared across
// every color bucket), wired up inside rebuildCrowd().
export const crowdHead = { mesh: null as THREE.InstancedMesh | null }
export const crowdArms = { mesh: null as THREE.InstancedMesh | null }
const crowdTransform = new THREE.Object3D()

// While `performance.now()` is below this, the Vikings portion of the crowd
// jumps higher/faster after a user touchdown. Away fans remain subdued.
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

// A short airy whoosh as the ball leaves your hand — filtered noise sweeping
// from a hiss down to a low rush, roughly the length of the release.
export function playThrow() {
  if (!audioContext || audioContext.state !== 'running') return
  const now = audioContext.currentTime
  const dur = 0.32
  const noise = audioContext.createBufferSource()
  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * dur), audioContext.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  noise.buffer = buffer
  const band = audioContext.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.4
  band.frequency.setValueAtTime(1900, now)
  band.frequency.exponentialRampToValueAtTime(340, now + dur)
  const whooshGain = audioContext.createGain()
  whooshGain.gain.setValueAtTime(0.0001, now)
  whooshGain.gain.exponentialRampToValueAtTime(0.16, now + 0.04)
  whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  noise.connect(band).connect(whooshGain).connect(audioContext.destination)
  noise.start(now)
  noise.stop(now + dur)
}

// The catch: a low leather thump of the ball into the hands plus a brief slap
// of high noise for the smack against the pads.
export function playCatch() {
  if (!audioContext || audioContext.state !== 'running') return
  const now = audioContext.currentTime
  const thump = audioContext.createOscillator()
  const thumpGain = audioContext.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(185, now)
  thump.frequency.exponentialRampToValueAtTime(72, now + 0.14)
  thumpGain.gain.setValueAtTime(0.0001, now)
  thumpGain.gain.exponentialRampToValueAtTime(0.22, now + 0.012)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
  thump.connect(thumpGain).connect(audioContext.destination)
  thump.start(now)
  thump.stop(now + 0.22)

  const slapDur = 0.12
  const slap = audioContext.createBufferSource()
  const slapBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * slapDur), audioContext.sampleRate)
  const slapData = slapBuffer.getChannelData(0)
  for (let i = 0; i < slapData.length; i += 1) slapData[i] = (Math.random() * 2 - 1) * (1 - i / slapData.length)
  slap.buffer = slapBuffer
  const highpass = audioContext.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 1200
  const slapGain = audioContext.createGain()
  slapGain.gain.setValueAtTime(0.14, now)
  slapGain.gain.exponentialRampToValueAtTime(0.0001, now + slapDur)
  slap.connect(highpass).connect(slapGain).connect(audioContext.destination)
  slap.start(now)
  slap.stop(now + slapDur)
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
  labelContext.textAlign = 'center'
  labelContext.textBaseline = 'middle'
  // Shrink the font for longer team names (e.g. "BUCCANEERS") so they don't
  // run off the edge of the fixed-size canvas the way a short one like "BEARS" would.
  let fontSize = 58
  labelContext.font = `bold ${fontSize}px Arial`
  while (fontSize > 30 && labelContext.measureText(text).width > 232) {
    fontSize -= 2
    labelContext.font = `bold ${fontSize}px Arial`
  }
  labelContext.fillText(text, 128, 64)
  const texture = new THREE.CanvasTexture(labelCanvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(5, 2.5, 1)
  return sprite
}

// A jersey nameplate across the chest. It respects depth so players in front
// cleanly occlude the ones behind them instead of the text stacking up.
export function jerseyNameplate(teamId: TeamId) {
  const team = TEAMS[teamId]
  const plate = labelSprite(team.name, team.nameplateText)
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

// Wide banner text baked onto a flat plane and laid down like turf paint —
// unlike a Sprite, a Mesh's rotation is respected, so this actually lies flat
// on the field instead of standing up and billboarding toward the camera.
function groundBanner(text: string, color: string) {
  const bannerCanvas = document.createElement('canvas')
  bannerCanvas.width = 512
  bannerCanvas.height = 154
  const ctx = bannerCanvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.font = 'bold 92px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 80)
  const texture = new THREE.CanvasTexture(bannerCanvas)
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 3.3),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  banner.rotation.x = -Math.PI / 2
  return banner
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

// Chicago Bears helmet mark: the wishbone "C" — white, outlined in burnt orange.
let bearsCDecalTextureCache: THREE.CanvasTexture | null = null
function bearsCDecalTexture() {
  if (bearsCDecalTextureCache) return bearsCDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 246px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 30
  ctx.strokeStyle = '#c83803'
  ctx.strokeText('C', 128, 146)
  ctx.fillStyle = '#f8fafc'
  ctx.fillText('C', 128, 146)
  bearsCDecalTextureCache = new THREE.CanvasTexture(c)
  return bearsCDecalTextureCache
}

// Detroit Lions helmet mark: three diagonal claw-slash strokes.
let lionClawsDecalTextureCache: THREE.CanvasTexture | null = null
function lionClawsDecalTexture() {
  if (lionClawsDecalTextureCache) return lionClawsDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.lineCap = 'round'
  for (const [width, color] of [[20, '#e8f4ff'], [7, '#0076b6']] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    for (const offset of [-42, 0, 42]) {
      ctx.beginPath()
      ctx.moveTo(128 + offset - 44, 78)
      ctx.lineTo(128 + offset + 44, 208)
      ctx.stroke()
    }
  }
  lionClawsDecalTextureCache = new THREE.CanvasTexture(c)
  return lionClawsDecalTextureCache
}

// Green Bay Packers helmet mark: the gold-ringed oval "G".
let packersGDecalTextureCache: THREE.CanvasTexture | null = null
function packersGDecalTexture() {
  if (packersGDecalTextureCache) return packersGDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.beginPath()
  ctx.ellipse(128, 128, 100, 78, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#203731'
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = '#ffb612'
  ctx.stroke()
  ctx.fillStyle = '#ffb612'
  ctx.font = 'bold 132px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('G', 128, 140)
  packersGDecalTextureCache = new THREE.CanvasTexture(c)
  return packersGDecalTextureCache
}

// Atlanta Falcons helmet mark: the wishbone "F" — black, outlined in red.
let falconsFDecalTextureCache: THREE.CanvasTexture | null = null
function falconsFDecalTexture() {
  if (falconsFDecalTextureCache) return falconsFDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 246px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 30
  ctx.strokeStyle = '#a71930'
  ctx.strokeText('F', 128, 146)
  ctx.fillStyle = '#101820'
  ctx.fillText('F', 128, 146)
  falconsFDecalTextureCache = new THREE.CanvasTexture(c)
  return falconsFDecalTextureCache
}

// Carolina Panthers helmet mark: the wishbone "P" — black, outlined in blue.
let panthersPDecalTextureCache: THREE.CanvasTexture | null = null
function panthersPDecalTexture() {
  if (panthersPDecalTextureCache) return panthersPDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 246px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 30
  ctx.strokeStyle = '#0085ca'
  ctx.strokeText('P', 128, 146)
  ctx.fillStyle = '#101820'
  ctx.fillText('P', 128, 146)
  panthersPDecalTextureCache = new THREE.CanvasTexture(c)
  return panthersPDecalTextureCache
}

// New Orleans Saints helmet mark: a gold fleur-de-lis, outlined in black —
// three petals fanned from a wrapped base, built from the same tapered-crescent
// horn shape used for the Vikings mark.
let saintsFleurDecalTextureCache: THREE.CanvasTexture | null = null
function saintsFleurDecalTexture() {
  if (saintsFleurDecalTextureCache) return saintsFleurDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#d3bc8d'
  ctx.strokeStyle = '#101820'
  ctx.lineWidth = 9
  ctx.lineJoin = 'round'
  ctx.save()
  ctx.translate(128, 150)
  ctx.rotate(Math.PI)
  hornPath(ctx, 0, 0, 0.72, -1)
  ctx.fill()
  ctx.stroke()
  hornPath(ctx, 0, 0, 0.72, 1)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(128, 46)
  ctx.quadraticCurveTo(96, 90, 128, 152)
  ctx.quadraticCurveTo(160, 90, 128, 46)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(94, 148, 68, 26, 8)
  ctx.fill()
  ctx.stroke()
  saintsFleurDecalTextureCache = new THREE.CanvasTexture(c)
  return saintsFleurDecalTextureCache
}

// Tampa Bay Buccaneers helmet mark: the wishbone "TB" — white, outlined in pewter.
let buccaneersTBDecalTextureCache: THREE.CanvasTexture | null = null
function buccaneersTBDecalTexture() {
  if (buccaneersTBDecalTextureCache) return buccaneersTBDecalTextureCache
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 158px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 18
  ctx.strokeStyle = '#34302b'
  ctx.strokeText('TB', 128, 138)
  ctx.fillStyle = '#f8fafc'
  ctx.fillText('TB', 128, 138)
  buccaneersTBDecalTextureCache = new THREE.CanvasTexture(c)
  return buccaneersTBDecalTextureCache
}

function decalTextureForTeam(teamId: TeamId) {
  switch (teamId) {
    case 'vikings':
      return hornsDecalTexture()
    case 'lions':
      return lionClawsDecalTexture()
    case 'packers':
      return packersGDecalTexture()
    case 'bears':
      return bearsCDecalTexture()
    case 'falcons':
      return falconsFDecalTexture()
    case 'panthers':
      return panthersPDecalTexture()
    case 'saints':
      return saintsFleurDecalTexture()
    case 'buccaneers':
      return buccaneersTBDecalTexture()
  }
}

// A helmet decal: a small plane on each side of the helmet, textured with the
// team's mark. The far side is mirrored so a directional mark (the horn) reads
// correctly from both profiles.
export function helmetDecal(teamId: TeamId, radius: number, y: number) {
  const group = new THREE.Group()
  const isVikings = teamId === 'vikings'
  const texture = decalTextureForTeam(teamId)
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

// ---------------------------------------------------------------------------
// Shared player parts — a soft contact shadow and a face inside the helmet.
// Both entities.ts (on-field players) and the sideline figures below use these,
// so they live here in world.ts (entities.ts depends on world.ts, not the
// reverse).
// ---------------------------------------------------------------------------

// A faint dark ellipse laid flat just above the turf, so a player reads as
// standing *on* the field rather than hovering over it. Cheap: one unlit,
// depth-write-free disc per player.
const shadowTextureCache: THREE.CanvasTexture[] = []
function shadowTexture() {
  if (shadowTextureCache[0]) return shadowTextureCache[0]
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  gradient.addColorStop(0, 'rgba(0,0,0,0.5)')
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.28)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  shadowTextureCache[0] = new THREE.CanvasTexture(c)
  return shadowTextureCache[0]
}

export function groundShadow(radius: number) {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.y = 0.62 // squash to an ellipse — sun is high and to the side
  shadow.position.y = 0.015
  shadow.renderOrder = 0
  return shadow
}

// The face seen through the facemask: a rounded skin head filling the helmet,
// a brow shadow, two eyes, and a jaw that peeks below the helmet shell. Sized
// to the helmet radius and dropped in at helmet height, facing +Z (downfield,
// which is where every model is built to look).
export function addFace(group: THREE.Group, opts: { skin: THREE.Material; radius: number; y: number }) {
  const { skin, radius, y } = opts
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.9 })
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.6 })

  const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.74, 12, 10), skin)
  head.scale.set(0.94, 1.06, 0.9)
  head.position.set(0, y - radius * 0.06, radius * 0.06)
  group.add(head)

  // Jaw / chin, tucked just under the front lip of the helmet shell rather than
  // jutting out past it.
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.34, 10, 8), skin)
  jaw.scale.set(0.95, 0.7, 0.85)
  jaw.position.set(0, y - radius * 0.62, radius * 0.42)
  group.add(jaw)

  // Brow shadow band across the top of the mask opening.
  const brow = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.9, radius * 0.12, radius * 0.1), dark)
  brow.position.set(0, y + radius * 0.12, radius * 0.66)
  group.add(brow)

  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.13, 8, 6), white)
    eyeWhite.scale.set(1.2, 0.8, 0.5)
    eyeWhite.position.set(side * radius * 0.3, y - radius * 0.04, radius * 0.68)
    group.add(eyeWhite)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.06, 6, 6), dark)
    pupil.position.set(side * radius * 0.3, y - radius * 0.04, radius * 0.74)
    group.add(pupil)
    // A thin smudge of eye black on the cheekbone.
    const eyeBlack = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.24, radius * 0.06, radius * 0.05), dark)
    eyeBlack.position.set(side * radius * 0.3, y - radius * 0.2, radius * 0.7)
    group.add(eyeBlack)
  }
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

// A small tileable grass-blade texture in shades of the given base color —
// used as the turf's `map` so the field reads as individual mowed blades
// instead of a single flat block of color.
const grassTextureCache = new Map<number, THREE.CanvasTexture>()
function grassTexture(colorHex: number) {
  const cached = grassTextureCache.get(colorHex)
  if (cached) return cached
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const base = new THREE.Color(colorHex)
  ctx.fillStyle = `#${base.getHexString()}`
  ctx.fillRect(0, 0, size, size)
  const blade = new THREE.Color()
  for (let i = 0; i < 1100; i += 1) {
    blade.copy(base).offsetHSL(0, 0, randomBetween(-0.08, 0.08))
    ctx.strokeStyle = `#${blade.getHexString()}`
    ctx.lineWidth = randomBetween(1, 1.8)
    const x = Math.random() * size
    const y = Math.random() * size
    const angle = randomBetween(0, Math.PI * 2)
    const len = randomBetween(2, 5)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(c)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  grassTextureCache.set(colorHex, texture)
  return texture
}

// A clone of the cached grass texture with tiling set for a plane of the
// given world-space size, so the blades stay a consistent size instead of
// stretching across bigger meshes like the apron.
function tiledGrass(colorHex: number, width: number, depth: number) {
  const texture = grassTexture(colorHex).clone()
  texture.needsUpdate = true
  const TILE = 3 // yards per texture repeat
  texture.repeat.set(width / TILE, depth / TILE)
  return texture
}

export function createField() {
  // A groundskeeping apron beyond the sidelines so the field doesn't end at the
  // white line, then the playing surface itself.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 240),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: tiledGrass(0x14532d, 150, 240), roughness: 1 }),
  )
  apron.rotation.x = -Math.PI / 2
  apron.position.set(0, -0.04, -42)
  world.add(apron)

  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(53.3, 120),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: tiledGrass(0x1a7a3f, 53.3, 120), roughness: 0.95 }),
  )
  field.rotation.x = -Math.PI / 2
  field.position.set(0, 0, -42)
  world.add(field)

  // Alternating mow stripes down the 100 yards of playing field.
  const stripeShades = [0x1c8446, 0x17703b]
  for (let yard = 0; yard < 100; yard += 5) {
    const shade = stripeShades[(yard / 5) % 2]
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(53.3, 5),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: tiledGrass(shade, 53.3, 5), roughness: 0.95 }),
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

  // Both end zones belong to the Vikings — they're the home team on this
  // field regardless of who the opponent is, so both ends read "GO VIKINGS".
  for (const z of [-97, 13]) {
    const endZone = new THREE.Mesh(
      new THREE.PlaneGeometry(53.3, END_ZONE_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: tiledGrass(TEAMS.vikings.primary, 53.3, END_ZONE_DEPTH), roughness: 0.92 }),
    )
    endZone.rotation.x = -Math.PI / 2
    endZone.position.set(0, 0.02, z)
    world.add(endZone)
    const banner = groundBanner('GO VIKINGS', '#fef08a')
    banner.position.set(0, 0.08, z)
    world.add(banner)
  }

  // End lines: the thick white stripe across the back of each end zone, level
  // with the goal-post support.
  for (const z of [18, -102]) {
    const endLine = new THREE.Mesh(new THREE.PlaneGeometry(53.3, 0.34), lineMaterial)
    endLine.rotation.x = -Math.PI / 2
    endLine.position.set(0, 0.025, z)
    world.add(endLine)
  }

  // Eight orange pylons, one at every goal-line and end-line corner.
  const pylonMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0x5c2500, emissiveIntensity: 0.4, roughness: 0.5 })
  for (const z of [8, 18, -92, -102]) {
    for (const x of [-26.65, 26.65]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.92, 0.34), pylonMaterial)
      pylon.position.set(x, 0.46, z)
      world.add(pylon)
    }
  }

  // The broken "coaching line" a couple of yards outside each sideline, marking
  // how far the benches and chain crew may creep toward the field.
  for (const x of [-29, 29]) {
    for (let z = 6; z >= -90; z -= 2.4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1.1), lineMaterial)
      dash.rotation.x = -Math.PI / 2
      dash.position.set(x, 0.028, z)
      world.add(dash)
    }
  }

  // Faint traffic wear worn into the turf where it gets hammered: both goal
  // mouths and the middle of the field. Unlit and translucent so the painted
  // lines still read cleanly on top.
  const wearMaterial = new THREE.MeshBasicMaterial({ color: 0x0b3d1f, transparent: true, opacity: 0.16, depthWrite: false })
  for (const z of [8, -42, -92]) {
    const wear = new THREE.Mesh(new THREE.CircleGeometry(7.5, 24), wearMaterial)
    wear.rotation.x = -Math.PI / 2
    wear.scale.set(1, 0.5, 1)
    wear.position.set(0, 0.02, z)
    world.add(wear)
  }

  createChainCrewGear(-29.6, -42)

  createGoalPost(-102, 1)
  createGoalPost(18, -1)
}

// The chain gang's kit parked just outside the near sideline at midfield: two
// orange rod markers linked by a chain, and a flip-style down box on a pole.
function createChainCrewGear(x: number, z: number) {
  const orange = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 })
  const chrome = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.6, roughness: 0.4 })
  const gear = new THREE.Group()

  for (const rz of [z - 5, z + 5]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), chrome)
    rod.position.set(x, 1.2, rz)
    gear.add(rod)
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 10), orange)
    flag.position.set(x, 1.9, rz)
    gear.add(flag)
  }
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 10, 6), chrome)
  chain.rotation.x = Math.PI / 2
  chain.position.set(x, 0.4, z)
  gear.add(chain)

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), chrome)
  pole.position.set(x - 0.6, 1.5, z)
  gear.add(pole)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), orange)
  box.position.set(x - 0.6, 3.05, z)
  gear.add(box)
  const downNumber = labelSprite('1', '#0b1220')
  downNumber.scale.set(0.9, 0.9, 1)
  downNumber.position.set(x - 0.6, 3.05, z + 0.12)
  gear.add(downNumber)

  world.add(gear)
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

// A pair of limbs (two legs, or two arms) as a single merged geometry so the
// instanced crowd can place both with one matrix per fan per layer, keeping
// the same one-mesh-per-body-part draw-call budget the flat blob shapes used.
function buildLimbPairGeometry(radiusTop: number, radiusBottom: number, height: number, offsetX: number, tiltZ = 0) {
  const left = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 6)
  left.rotateZ(tiltZ)
  left.translate(-offsetX, 0, 0)
  const right = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 6)
  right.rotateZ(-tiltZ)
  right.translate(offsetX, 0, 0)
  const merged = mergeGeometries([left, right])
  left.dispose()
  right.dispose()
  return merged
}

// The Vikings are the home team, so their purple jerseys are the single
// biggest block in the bowl. A share of every section wears the selected
// opponent's color, and — since a real crowd is mostly not head-to-toe team
// gear — a smaller share wears plain street clothes in a handful of neutral
// tones. Jersey wearers get a contrast-color torso, just like the real kits
// every on-field player wears, and both the jersey shade and the skin tone
// get a touch of per-fan variance so a packed section doesn't read as one
// molded block of plastic. Each fan is built from the same limbed silhouette
// as the on-field players — legs, torso, bare arms, head — just simplified
// and instanced so thousands of them stay cheap to animate.
export function rebuildCrowd() {
  if (crowdGroup) {
    world.remove(crowdGroup)
    crowdGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
  }
  crowdGroup = new THREE.Group()
  world.add(crowdGroup)
  crowdMembers.length = 0
  crowdBodyMeshes.length = 0
  crowdShoulderMeshes.length = 0
  crowdHead.mesh = null
  crowdArms.mesh = null

  // Bucket 0 is home purple, bucket 1 the chosen opponent, and the rest are
  // plain street-clothes colors. Jersey buckets get their team's accent color
  // on the torso layer; neutral buckets just repeat their own color there,
  // since there's no trim to contrast against.
  const neutralFanColors = [0x334155, 0x1f2937, 0x7c2d12, 0xe2e8f0, 0x64748b, 0x0c4a6e]
  const fanColors = [TEAMS.vikings.primary, TEAMS[state.opponentTeam].primary, ...neutralFanColors]
  const fanAccents = [TEAMS.vikings.accent, TEAMS[state.opponentTeam].accent, ...neutralFanColors]
  const fanHeadGeometry = new THREE.SphereGeometry(0.15, 8, 6)
  // Legs and arms are limb pairs, like the players; the torso is a taller
  // block than the old flat shoulder-yoke so the silhouette actually reads
  // as a person rather than a stacked blob.
  const fanBodyGeometry = buildLimbPairGeometry(0.085, 0.12, 0.5, 0.115)
  const fanShoulderGeometry = new THREE.BoxGeometry(0.46, 0.46, 0.28)
  const fanArmGeometry = buildLimbPairGeometry(0.05, 0.06, 0.46, 0.29, 0.12)
  const fanBodyMatrices = fanColors.map(() => [] as THREE.Matrix4[])
  const fanShoulderMatrices = fanColors.map(() => [] as THREE.Matrix4[])
  const fanBodyColors = fanColors.map(() => [] as THREE.Color[])
  const fanHeadMatrices: THREE.Matrix4[] = []
  const fanHeadColors: THREE.Color[] = []
  const fanArmMatrices: THREE.Matrix4[] = []
  const fanArmColors: THREE.Color[] = []
  const fanTransform = new THREE.Object3D()
  const shadeColor = new THREE.Color()

  const addFan = (x: number, y: number, z: number, colorIndex: number, facing = 0) => {
    const bodyIndex = fanBodyMatrices[colorIndex].length
    const headIndex = fanHeadMatrices.length
    const scale = randomBetween(0.82, 1.12)
    const skin = pickSkinTone()
    fanTransform.rotation.set(0, facing, 0)
    fanTransform.scale.setScalar(scale)
    fanTransform.position.set(x, y + 0.26 * scale, z)
    fanTransform.updateMatrix()
    fanBodyMatrices[colorIndex].push(fanTransform.matrix.clone())
    fanTransform.position.y = y + 0.58 * scale
    fanTransform.updateMatrix()
    fanShoulderMatrices[colorIndex].push(fanTransform.matrix.clone())
    fanArmMatrices.push(fanTransform.matrix.clone())
    fanTransform.position.y = y + 0.82 * scale
    fanTransform.updateMatrix()
    fanHeadMatrices.push(fanTransform.matrix.clone())
    fanTransform.scale.setScalar(1)
    shadeColor.set(fanColors[colorIndex]).offsetHSL(0, 0, randomBetween(-0.1, 0.08))
    fanBodyColors[colorIndex].push(shadeColor.clone())
    fanHeadColors.push(new THREE.Color(skin))
    fanArmColors.push(new THREE.Color(skin))
    crowdMembers.push({ x, y, z, facing, phase: randomBetween(0, Math.PI * 2), scale, colorIndex, bodyIndex, headIndex })
  }

  // Roughly 70% home purple, 10% the chosen opponent's color sprinkled in,
  // and the rest spread evenly across the neutral street-clothes palette.
  const crowdColor = () => {
    const roll = Math.random()
    if (roll < 0.7) return 0
    if (roll < 0.8) return 1
    return 2 + Math.floor(Math.random() * neutralFanColors.length)
  }

  for (const side of [-1, 1]) {
    for (let row = 0; row < 19; row += 1) {
      const x = side * (32 + row * 1.16)
      const y = 0.5 + row * 0.75
      for (let seat = 0; seat < 58; seat += 1) {
        addFan(x - side * 1.2, y + 0.52, -105 + seat * 2.08 + (row % 2) * 0.55, crowdColor(), -side * Math.PI / 2)
      }
    }
  }
  for (const end of [1, -1]) {
    for (let row = 0; row < 15; row += 1) {
      const z = end === 1 ? 21 + row * 1.2 : -105 - row * 1.2
      const y = 0.5 + row * 0.75
      for (let seat = 0; seat < 46; seat += 1) {
        addFan(-45 + seat * 2.0, y + 0.52, z - end * 1.2, crowdColor(), end === 1 ? Math.PI : 0)
      }
    }
  }

  // Instancing keeps the packed stadium inexpensive to animate every frame.
  // Per-instance vertex color layers the shade/skin-tone variance on top of a
  // single shared material per bucket, so the variety costs nothing extra to
  // draw — the color goes on the same InstancedMesh, not a new one.
  const buildFanLayer = (
    buckets: THREE.Matrix4[][],
    geometry: THREE.BufferGeometry,
    target: THREE.InstancedMesh[],
    palette: number[],
    colors?: THREE.Color[][],
  ) => {
    for (const [colorIndex, matrices] of buckets.entries()) {
      const material = new THREE.MeshStandardMaterial({ color: palette[colorIndex], roughness: 0.8, vertexColors: !!colors })
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
      matrices.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix)
        if (colors) mesh.setColorAt(index, colors[colorIndex][index])
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      crowdGroup!.add(mesh)
      target[colorIndex] = mesh
    }
  }
  buildFanLayer(fanBodyMatrices, fanBodyGeometry, crowdBodyMeshes, fanColors, fanBodyColors)
  buildFanLayer(fanShoulderMatrices, fanShoulderGeometry, crowdShoulderMeshes, fanAccents)
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true })
  const heads = new THREE.InstancedMesh(fanHeadGeometry, headMaterial, fanHeadMatrices.length)
  fanHeadMatrices.forEach((matrix, index) => {
    heads.setMatrixAt(index, matrix)
    heads.setColorAt(index, fanHeadColors[index])
  })
  heads.instanceMatrix.needsUpdate = true
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true
  crowdGroup.add(heads)
  crowdHead.mesh = heads
  // Bare arms are skin-toned regardless of jersey color, so they get one
  // shared instanced mesh (like the heads) instead of a per-team bucket.
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true })
  const arms = new THREE.InstancedMesh(fanArmGeometry, armMaterial, fanArmMatrices.length)
  fanArmMatrices.forEach((matrix, index) => {
    arms.setMatrixAt(index, matrix)
    arms.setColorAt(index, fanArmColors[index])
  })
  arms.instanceMatrix.needsUpdate = true
  if (arms.instanceColor) arms.instanceColor.needsUpdate = true
  crowdGroup.add(arms)
  crowdArms.mesh = arms
}

export function createStadium() {
  const standColors = [0x17233b, 0x253654, 0x334b70]
  // A deep bowl of stands wraps the field; the front rows sit back far enough to
  // leave a sideline apron for the benches. Rows 6-7 break from the repeating
  // gray tiers into a purple-and-gold facade band — the colored ring real
  // stadiums use to separate the lower bowl from the upper deck.
  const facadeRow = (row: number, fallback: number) => (row === 6 ? TEAMS.vikings.primary : row === 7 ? 0xf5c542 : fallback)
  for (const side of [-1, 1]) {
    for (let row = 0; row < 19; row += 1) {
      const x = side * (32 + row * 1.16)
      const y = 0.5 + row * 0.75
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 1.2, 122),
        new THREE.MeshStandardMaterial({ color: facadeRow(row, standColors[row % standColors.length]), roughness: 0.82 }),
      )
      seats.position.set(x, y, -47)
      world.add(seats)
    }
  }

  for (const end of [1, -1]) {
    for (let row = 0; row < 15; row += 1) {
      const z = end === 1 ? 21 + row * 1.2 : -105 - row * 1.2
      const y = 0.5 + row * 0.75
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(102, 1.18, 2.3),
        new THREE.MeshStandardMaterial({ color: facadeRow(row, standColors[(row + 1) % standColors.length]), roughness: 0.82 }),
      )
      seats.position.set(0, y, z)
      world.add(seats)
    }
  }
  rebuildCrowd()

  // A glowing LED ribbon board runs the length of the lower bowl's front
  // fascia on all four sides — the modern stadium touch below the seats.
  const ribbonMaterial = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1.4, roughness: 0.4 })
  for (const side of [-1, 1]) {
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.32, 122), ribbonMaterial)
    ribbon.position.set(side * 32, 0.16, -47)
    world.add(ribbon)
  }
  for (const end of [1, -1]) {
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(102, 0.32, 2.5), ribbonMaterial)
    ribbon.position.set(0, 0.16, end === 1 ? 21 : -105)
    world.add(ribbon)
  }

  // Two tunnel entrances cut into the lower bowl at midfield, one per
  // sideline, where the teams would actually run out onto the field.
  const tunnelDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.9 })
  const tunnelFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.5 })
  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3, 6.4), tunnelFrameMaterial)
    frame.position.set(side * 31.4, 1.5, -42)
    world.add(frame)
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 5.6), tunnelDarkMaterial)
    mouth.position.set(side * 31.2, 1.2, -42)
    world.add(mouth)
  }

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
    // A short diagonal brace off every other main truss for a more built,
    // trussed-roof look instead of a flat grid of straight bars.
    if (((z + 105) / 16) % 2 === 0) {
      for (const dx of [-22, 22]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(14, 0.24, 0.3), trussMaterial)
        brace.position.set(dx, 23.7, z + 5)
        brace.rotation.y = dx < 0 ? 0.35 : -0.35
        world.add(brace)
      }
    }
  }
  for (let x = -38; x <= 38; x += 19) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 126), trussMaterial)
    truss.position.set(x, 24.95, -47)
    world.add(truss)
  }

  createJumbotron()

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

// The center-hung style video board every modern stadium has: a deep steel
// frame slung off its own support struts, a big canvas-texture screen
// showing the score bug (see updateScoreboard), and a slim scrolling sponsor
// ticker underneath (see updateJumbotronTicker). Rim lights and hanging
// speaker boxes round out the "big screen" read from out on the field.
function createJumbotron() {
  const z = -111.6
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.55, metalness: 0.3 })
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.75, roughness: 0.35 })
  const rimLightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffcf4d, emissiveIntensity: 2.2 })

  const frame = new THREE.Mesh(new THREE.BoxGeometry(26, 12.5, 1.4), frameMaterial)
  frame.position.set(0, 17, z)
  world.add(frame)

  // Support struts angling down to the back wall, behind the board.
  for (const x of [-9, 9]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 9, 8), trussMat)
    strut.position.set(x, 22, z - 0.9)
    strut.rotation.x = 0.42
    world.add(strut)
  }

  // Everything below faces the field, so it has to sit in front of the
  // frame's near face (toward the camera, at a *larger* z than the frame
  // here — the field side is z > -111.6) or the frame itself would hide it.
  // The frame is 1.4 deep, so its near face sits at z + 0.7.
  const faceZ = z + 0.75

  // Rim lights tracing the top and bottom of the bezel.
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13
    const lx = THREE.MathUtils.lerp(-12.4, 12.4, t)
    for (const ly of [23.1, 10.9]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), rimLightMaterial)
      light.position.set(lx, ly, faceZ + 0.05)
      world.add(light)
    }
  }

  // Two hanging speaker boxes flanking the screen.
  for (const x of [-14.5, 14.5]) {
    const speaker = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.4, 1.6), frameMaterial)
    speaker.position.set(x, 16.5, z)
    world.add(speaker)
    for (let row = 0; row < 4; row += 1) {
      const grille = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10), trussMat)
      grille.position.set(x, 15.3 + row * 0.7, faceZ + 0.1)
      world.add(grille)
    }
  }

  // The main screen: the live score bug, drawn by updateScoreboard().
  scoreboard.canvas = document.createElement('canvas')
  scoreboard.canvas.width = 640
  scoreboard.canvas.height = 256
  scoreboard.texture = new THREE.CanvasTexture(scoreboard.canvas)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(23.6, 9.2),
    new THREE.MeshBasicMaterial({ map: scoreboard.texture }),
  )
  screen.position.set(0, 17.6, faceZ)
  world.add(screen)

  // A slim scrolling sponsor ticker underneath the main screen.
  jumbotronTicker.canvas = document.createElement('canvas')
  jumbotronTicker.canvas.width = 1024
  jumbotronTicker.canvas.height = 64
  jumbotronTicker.texture = new THREE.CanvasTexture(jumbotronTicker.canvas)
  jumbotronTicker.texture.wrapS = THREE.RepeatWrapping
  jumbotronTicker.texture.repeat.set(3, 1)
  const ticker = new THREE.Mesh(
    new THREE.PlaneGeometry(23.6, 1.3),
    new THREE.MeshBasicMaterial({ map: jumbotronTicker.texture }),
  )
  ticker.position.set(0, 11.9, faceZ)
  world.add(ticker)
  drawJumbotronTicker()

  // "TOUCHDOWN RUSH STADIUM" wordmark riding on top of the frame — a wide
  // dedicated canvas rather than labelSprite's small fixed square, since that
  // long a string would overflow a 256px-wide canvas and get clipped.
  const wordmarkCanvas = document.createElement('canvas')
  wordmarkCanvas.width = 1024
  wordmarkCanvas.height = 128
  const wordmarkCtx = wordmarkCanvas.getContext('2d')!
  wordmarkCtx.fillStyle = '#fbbf24'
  wordmarkCtx.font = 'bold 74px Arial'
  wordmarkCtx.textAlign = 'center'
  wordmarkCtx.textBaseline = 'middle'
  wordmarkCtx.fillText('TOUCHDOWN RUSH STADIUM', 512, 64)
  const wordmark = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(wordmarkCanvas), transparent: true, depthWrite: false }),
  )
  wordmark.scale.set(17, 2.1, 1)
  wordmark.position.set(0, 24.3, z)
  world.add(wordmark)

  updateScoreboard()
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
// head coach (bare head, ball cap, khakis). Both wear their team's colors, and
// benched players get the same detailed kit as the on-field ones (coloured
// helmet with the team decal and crown stripe, coloured facemask, shoulder
// yoke, sleeve hoops, striped pants and socks).
function createSidelineFigure(x: number, z: number, jersey: number, trim: number, facing: number, isCoach: boolean, teamId: TeamId, parent: THREE.Object3D = world) {
  const group = new THREE.Group()
  const kit = isCoach ? undefined : UNIFORM_KITS[teamId]
  const jerseyMat = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.8 })
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.7 })
  const skinMat = new THREE.MeshStandardMaterial({ color: pickSkinTone(), roughness: 0.85 })
  const pantsMat = new THREE.MeshStandardMaterial({
    color: isCoach ? 0xcbb58a : kit ? kit.pants : 0xe5e7eb,
    roughness: 0.8,
  })
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
  const helmetMat = kit
    ? new THREE.MeshStandardMaterial({ color: kit.helmet, roughness: 0.35, metalness: kit.helmetMetal })
    : trimMat
  const facemaskMat = kit ? new THREE.MeshStandardMaterial({ color: kit.facemask, roughness: 0.6 }) : shoeMat
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
    if (kit) addKitYoke(group, kit, { width: 0.86, depth: 0.52, bandY: 1.96, lineY: 1.88, collarR: 0.16, collarY: 1.99 })
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), helmetMat)
    helmet.scale.set(1.04, 0.92, 1.04)
    helmet.position.y = 2.4
    group.add(helmet)
    group.add(helmetDecal(teamId, 0.4, 2.4))
    if (kit) addKitHelmetStripe(group, kit, 0.42, 2.4)
    addFace(group, { skin: skinMat, radius: 0.4, y: 2.4 })
    const facemask = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 8), facemaskMat)
    facemask.rotation.z = Math.PI / 2
    facemask.position.set(0, 2.28, 0.36)
    group.add(facemask)
  } else {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), skinMat)
    head.position.y = 1.92
    group.add(head)
    // Small nose and a bar of sunglasses so the coach has a face, not a blank ball.
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat)
    nose.position.set(0, 1.9, 0.24)
    group.add(nose)
    const shades = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.3, metalness: 0.2 }),
    )
    shades.position.set(0, 1.97, 0.22)
    group.add(shades)
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
    if (kit) addKitSleeveHoops(upper, kit, -0.2, 0.115)
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
    if (kit) {
      addKitLegStripe(group, kit, legX + (legX < 0 ? -0.12 : 0.12), 0.46, 0.8)
      addKitSock(group, kit, legX, 0.15)
    }
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.42), shoeMat)
    shoe.position.set(legX, 0.06, 0.12)
    group.add(shoe)
  }
  group.add(groundShadow(0.55))
  group.position.set(x, 0, z)
  group.rotation.y = facing + randomBetween(-0.35, 0.35)
  group.scale.setScalar(randomBetween(0.94, 1.06))
  parent.add(group)
}

const KHAKI = 0xcbb58a

// One sideline's worth of benched players plus a head coach and two
// assistants, all in the given team's colors.
function buildSidelineBench(sideX: number, facing: number, teamId: TeamId, trim: number, coachTop: number, parent: THREE.Object3D) {
  const inward = sideX < 0 ? 1 : -1
  const jersey = TEAMS[teamId].primary
  // A deep bench: three staggered rows of players milling in the team area,
  // spanning most of the sideline between the 25s.
  for (let i = 0; i < 26; i += 1) {
    const z = -12 - i * 2.35
    const rowOffset = (i % 3) * 1.05
    const x = sideX + inward * (rowOffset + randomBetween(-0.3, 0.3))
    createSidelineFigure(x, z, jersey, trim, facing, false, teamId, parent)
  }
  // Head coach out front near midfield, plus two assistants down the line.
  createSidelineFigure(sideX + inward * 2.1, -42, coachTop, KHAKI, facing, true, teamId, parent)
  createSidelineFigure(sideX + inward * 1.6, -24, coachTop, KHAKI, facing, true, teamId, parent)
  createSidelineFigure(sideX + inward * 1.6, -66, coachTop, KHAKI, facing, true, teamId, parent)
}

// The opponent's bench lives in its own group so a new game can rebuild it in
// a different team's colors without touching the (static) Vikings sideline.
let opponentSidelineGroup: THREE.Group | null = null
export function buildOpponentSideline() {
  if (opponentSidelineGroup) world.remove(opponentSidelineGroup)
  const group = new THREE.Group()
  const team = TEAMS[state.opponentTeam]
  buildSidelineBench(29, -Math.PI / 2, state.opponentTeam, 0x111827, team.accent, group)
  world.add(group)
  opponentSidelineGroup = group
}

// Benches and coaching staff on each sideline: the Vikings (home, purple) on
// the near side, and the chosen NFC North opponent across the way.
export function createSidelines() {
  buildSidelineBench(-29, Math.PI / 2, 'vikings', 0x0f172a, TEAMS.vikings.accent, world)
  buildOpponentSideline()
}

// Rebuilds the opponent-colored sideline to match state.opponentTeam. Call
// once, right after the team is chosen. (Both end zones stay Vikings' colors
// — they're the home team regardless of who the opponent is.)
export function applyOpponentTeam() {
  buildOpponentSideline()
  drawJumbotronTicker()
}

// ---------------------------------------------------------------------------
// Per-frame world updates
// ---------------------------------------------------------------------------

// Draws the jumbotron's sponsor ticker text once. It doesn't need to be
// redrawn every frame — the scroll itself is a UV offset animated in
// updateJumbotronTicker() — only when the message changes (a new opponent).
export function drawJumbotronTicker() {
  const c = jumbotronTicker.canvas
  const texture = jumbotronTicker.texture
  if (!c || !texture) return
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#fbbf24'
  ctx.font = 'bold 40px Arial'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const away = TEAMS[state.opponentTeam]
  const message = `TOUCHDOWN RUSH   •   NFC NORTH SHOWDOWN   •   VIKINGS VS ${away.name}   •   `
  ctx.fillText(message.repeat(2), 0, c.height / 2)
  texture.needsUpdate = true
}

// Scrolls the sponsor ticker by nudging its texture's UV offset — cheap
// enough to run every frame, unlike a canvas redraw.
export function updateJumbotronTicker(delta: number) {
  const texture = jumbotronTicker.texture
  if (!texture) return
  jumbotronTicker.offset = (jumbotronTicker.offset + delta * 0.05) % 1
  texture.offset.x = jumbotronTicker.offset
}

// The jumbotron's main screen: a score bug with a color chip per team, the
// clock, and (on offense) the down & distance — plus a soft vignette and a
// blinking "LIVE" tag so it reads as a lit video panel, not a flat poster.
export function updateScoreboard() {
  const sbCanvas = scoreboard.canvas
  const sbTexture = scoreboard.texture
  if (!sbCanvas || !sbTexture) return
  const ctx = sbCanvas.getContext('2d')!
  const w = sbCanvas.width
  const h = sbCanvas.height
  ctx.clearRect(0, 0, w, h)
  const backdrop = ctx.createLinearGradient(0, 0, 0, h)
  backdrop.addColorStop(0, '#111a2e')
  backdrop.addColorStop(1, '#01030a')
  ctx.fillStyle = backdrop
  ctx.fillRect(0, 0, w, h)

  const rowY = [h * 0.28, h * 0.28 + h * 0.27]
  const away = TEAMS[state.opponentTeam]
  const drawTeamRow = (team: TeamInfo, score: number, y: number) => {
    ctx.beginPath()
    ctx.arc(w * 0.13, y, h * 0.1, 0, Math.PI * 2)
    ctx.fillStyle = cssHex(team.primary)
    ctx.fill()
    ctx.lineWidth = h * 0.02
    ctx.strokeStyle = cssHex(team.accent)
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f8fafc'
    ctx.font = `bold ${Math.round(h * 0.11)}px Arial`
    ctx.fillText(team.name, w * 0.21, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#fbbf24'
    ctx.font = `bold ${Math.round(h * 0.13)}px Arial`
    ctx.fillText(String(score), w * 0.93, y)
  }
  drawTeamRow(TEAMS.vikings, state.score, rowY[0])
  drawTeamRow(away, state.opponentScore, rowY[1])

  ctx.strokeStyle = 'rgba(226,232,240,0.22)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w * 0.06, (rowY[0] + rowY[1]) / 2)
  ctx.lineTo(w * 0.94, (rowY[0] + rowY[1]) / 2)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#e2e8f0'
  ctx.font = `bold ${Math.round(h * 0.1)}px Arial`
  ctx.fillText(`${state.quarter >= 5 ? 'OT' : ordinal(state.quarter)}   ${formatClock(state.gameClock)}`, w / 2, h * 0.78)
  ctx.font = `${Math.round(h * 0.065)}px Arial`
  ctx.fillStyle = '#94a3b8'
  const possessionLine = state.possession === 'offense'
    ? `VIKINGS BALL • ${downAndDistance()}`
    : `${away.abbr} BALL`
  ctx.fillText(possessionLine, w / 2, h * 0.92)

  // A small blinking "LIVE" tag in the top-left corner.
  const blink = Math.sin(performance.now() * 0.006) > -0.2
  if (blink) {
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(w * 0.045, h * 0.08, h * 0.022, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f8fafc'
  ctx.font = `bold ${Math.round(h * 0.05)}px Arial`
  ctx.fillText('LIVE', w * 0.07, h * 0.08)

  sbTexture.needsUpdate = true
}

export function updateCrowd(time: number) {
  const headMesh = crowdHead.mesh
  const armsMesh = crowdArms.mesh
  if (!headMesh || !armsMesh) return
  const hype = time < crowdHypeUntil ? 1 : 0
  for (const fan of crowdMembers) {
    // colorIndex 0 is Vikings purple; colorIndex 1 is the selected opponent.
    const fanHype = fan.colorIndex === 0 ? hype : 0
    const s = fan.scale
    const jump = Math.max(0, Math.sin(time * (0.008 + fanHype * 0.004) + fan.phase)) * (0.2 + fanHype * 0.6)
    const sway = Math.sin(time * 0.0022 + fan.phase) * (0.05 + fanHype * 0.05)
    crowdTransform.rotation.set(0, fan.facing + sway, 0)
    crowdTransform.scale.setScalar(s)
    crowdTransform.position.set(fan.x, fan.y + 0.26 * s + jump, fan.z)
    crowdTransform.updateMatrix()
    crowdBodyMeshes[fan.colorIndex].setMatrixAt(fan.bodyIndex, crowdTransform.matrix)
    crowdTransform.position.y = fan.y + 0.58 * s + jump
    crowdTransform.updateMatrix()
    crowdShoulderMeshes[fan.colorIndex].setMatrixAt(fan.bodyIndex, crowdTransform.matrix)
    armsMesh.setMatrixAt(fan.headIndex, crowdTransform.matrix)
    crowdTransform.position.y = fan.y + 0.82 * s + jump * 1.05
    crowdTransform.updateMatrix()
    headMesh.setMatrixAt(fan.headIndex, crowdTransform.matrix)
  }
  crowdTransform.scale.setScalar(1)
  crowdBodyMeshes.forEach((bodies) => { bodies.instanceMatrix.needsUpdate = true })
  crowdShoulderMeshes.forEach((shoulders) => { shoulders.instanceMatrix.needsUpdate = true })
  headMesh.instanceMatrix.needsUpdate = true
  armsMesh.instanceMatrix.needsUpdate = true
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

// One call, fired on a user touchdown: a roar, fireworks, and Vikings fans
// leaping out of their seats for a few seconds.
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
