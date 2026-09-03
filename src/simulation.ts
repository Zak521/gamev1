import * as THREE from 'three'
import {
  EYE_HEIGHT,
  MOVE_SCALE,
  USER_GOAL_LINE_Z,
  ballOnFromZ,
  defenders,
  isRunId,
  keys,
  linemen,
  losZ,
  randomBetween,
  receivers,
  state,
  statusText,
  teammates,
} from './core.ts'
import type { Defender, Receiver } from './core.ts'
import { aimCamera, camera, playFootstep, playerView, world } from './world.ts'
import { balls } from './entities.ts'
import {
  finishDefensivePlay,
  finishRunPlay,
  gainTo,
  giveBallToOpponent,
  offensiveMenu,
  sack,
  turnOverOnDowns,
  updateHud,
} from './rules.ts'

const passStart = new THREE.Vector3()

export function throwTo(receiver: Receiver) {
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
  balls.player.visible = false
  balls.thrown.visible = true
  passStart.set(camera.position.x, camera.position.y - 0.55, camera.position.z - 1.4)
  balls.thrown.position.copy(passStart)
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
  balls.thrown.position.lerpVectors(passStart, destination, progress)
  balls.thrown.position.y += Math.sin(progress * Math.PI) * 4.2
  balls.thrown.rotation.x += delta * 22
  if (progress < 1) return

  state.throwing = false
  balls.thrown.visible = false
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
  state.footstepTimer = 0
  balls.player.visible = true
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

export function updateGame(delta: number) {
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
    state.footstepTimer -= delta
    if (state.footstepTimer <= 0) {
      playFootstep()
      state.footstepTimer = state.sprinting ? 0.2 : 0.3
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

  state.footstepTimer -= delta
  if ((direction !== 0 || depthDirection !== 0) && state.footstepTimer <= 0) {
    playFootstep()
    state.footstepTimer = state.sprinting ? 0.2 : 0.3
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
