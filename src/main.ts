import * as THREE from 'three'
import './style.css'
import {
  canvas,
  keys,
  kickFill,
  newGameButton,
  patCall,
  patGoButton,
  patKickButton,
  playTabs,
  receivers,
  resetButton,
  staminaFill,
  staminaMeter,
  state,
} from './core.ts'
import type { PlayTab } from './core.ts'
import {
  aimCamera,
  camera,
  clouds,
  createField,
  createSidelines,
  createSky,
  createStadium,
  renderer,
  scene,
  startAudio,
  updateCrowd,
  updateFireworks,
  view,
} from './world.ts'
import { createPlayerView } from './entities.ts'
import {
  goForTwo,
  renderDefenseOptions,
  renderPlayOptions,
  resolveKick,
  startGame,
  startKick,
  throwAway,
  tickClocks,
  updateHud,
  updateKickFlight,
} from './rules.ts'
import { throwTo, updateGame } from './simulation.ts'

const passRaycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

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
  updateFireworks(delta)
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
  view.yaw -= event.movementX * 0.0025
  view.pitch = THREE.MathUtils.clamp(view.pitch - event.movementY * 0.0018, -0.3, 0.42)
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
patKickButton.addEventListener('click', () => {
  if (state.gameOver) return
  patCall.classList.add('is-hidden')
  startKick('extraPoint', 33)
})
patGoButton.addEventListener('click', () => {
  if (state.gameOver) return
  goForTwo()
})
requestAnimationFrame(frame)
