import * as THREE from 'three'
import { defenders, linemen, randomBetween, receivers, state, teammates } from './core.ts'
import type { Defender, PassPlayId } from './core.ts'
import { camera, helmetDecal, jerseyNameplate, labelSprite, playerView, world } from './world.ts'

// The first-person footballs, created inside createPlayerView(). Declared here so
// every module can read/toggle them; treated as always-present after startup
// (matching the original `let playerFootball: THREE.Mesh` contract).
export const balls = {
  player: null as unknown as THREE.Mesh,
  thrown: null as unknown as THREE.Mesh,
}

export function createDefender(x: number, z: number, color: number, number: number, hasFootball = false, bucket: Defender[] = defenders) {
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
  group.add(helmetDecal(color, 0.5, 2.45))
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

export function createReceiver(x: number, breakX: number, targetX: number, routeDepth: number, number: number) {
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
  group.add(helmetDecal(0x8b5cf6, 0.4, 2.05))
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

export function createLineman(x: number, z: number, number: number) {
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
  group.add(helmetDecal(0x8b5cf6, 0.5, 2.4))
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

export function buildOffensiveLine() {
  while (linemen.length) world.remove(linemen.pop()!.mesh)
  for (const [index, x] of [-7.2, -3.6, 0, 3.6, 7.2].entries()) {
    createLineman(x, state.cameraZ - 5.5, 60 + index)
  }
}

export function buildReceivers(play: PassPlayId) {
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

export function createPlayerView() {
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

  balls.player = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x8b451f }),
  )
  balls.player.scale.set(0.72, 1.35, 0.72)
  balls.player.position.set(0, -1.05, -1.7)
  balls.player.rotation.z = -0.2
  playerView.add(balls.player)
  balls.thrown = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x8b451f, roughness: 0.7 }),
  )
  balls.thrown.scale.set(0.72, 1.35, 0.72)
  balls.thrown.visible = false
  world.add(balls.thrown)
  camera.add(playerView)
}

export function buildDefense() {
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

export function clearPlayers() {
  while (defenders.length) world.remove(defenders.pop()!.mesh)
  while (linemen.length) world.remove(linemen.pop()!.mesh)
  while (receivers.length) world.remove(receivers.pop()!.mesh)
  while (teammates.length) world.remove(teammates.pop()!.mesh)
}
