import * as THREE from 'three'
import { TEAMS } from './core.ts'
import type { TeamId } from './core.ts'

// Per-team uniform kits. A team listed here gets a coloured helmet, facemask
// and pants plus jersey striping (shoulder yoke, sleeve hoops, collar, pant
// stripe); every other team keeps the plain dark helmet and pants.
//   band         - shoulder yoke, sleeve hoops and collar
//   line         - the thin contrast stripe that borders the band
//   pantStripe   - [wide stripe, thin centre] down the outside of the leg;
//                  the centre is skipped when the two colours match
//   helmetStripe - optional [flank, centre] mohawk stripe over the crown
//   socks        - optional [sock, stripe] colours over the lower leg
export type UniformKit = {
  helmet: number
  helmetMetal: number
  facemask: number
  pants: number
  numberColor: string
  band: number
  line: number
  pantStripe: [number, number]
  helmetStripe?: [number, number]
  socks?: [number, number]
}

export const UNIFORM_KITS: Partial<Record<TeamId, UniformKit>> = {
  // Green Bay: gold helmet, green facemask, mustard pants, gold-and-white stripes.
  packers: {
    helmet: TEAMS.packers.accent,
    helmetMetal: 0.35,
    facemask: 0x1c3a2c,
    pants: 0xd8b44b,
    numberColor: '#ffd23f',
    band: TEAMS.packers.accent,
    line: 0xf4f4f0,
    pantStripe: [0x203731, 0xf4f4f0],
  },
  // Detroit: silver helmet, Honolulu-blue facemask, silver pants, white numbers,
  // silver stripes with a blue border and a blue pant stripe.
  lions: {
    helmet: 0xccd1d5,
    helmetMetal: 0.55,
    facemask: TEAMS.lions.primary,
    pants: 0xb7bbbf,
    numberColor: '#ffffff',
    band: 0xd4d8dc,
    line: TEAMS.lions.primary,
    pantStripe: [TEAMS.lions.primary, TEAMS.lions.primary],
  },
  // Chicago: matte navy helmet with the orange-white-orange crown stripe and the
  // white "C", grey facemask, white pants with a navy-orange stripe, burnt-orange
  // numbers, orange-and-white jersey stripes, and navy socks with an orange band.
  bears: {
    helmet: 0x17315c,
    helmetMetal: 0.12,
    facemask: 0x3a3f47,
    pants: 0xe9e9e6,
    numberColor: '#e8641f',
    band: TEAMS.bears.accent,
    line: 0xf4f4f0,
    pantStripe: [0x17315c, TEAMS.bears.accent],
    helmetStripe: [TEAMS.bears.accent, 0xf4f4f0],
    socks: [0x17315c, TEAMS.bears.accent],
  },
  // Minnesota: pearl-white helmet with the purple horns, purple facemask, white
  // pants with a purple-gold stripe, gold-and-white shoulder and sleeve stripes,
  // pale-gold numbers, and purple socks with a gold band.
  vikings: {
    helmet: 0xeef0f2,
    helmetMetal: 0.12,
    facemask: TEAMS.vikings.accent,
    pants: 0xebebe8,
    numberColor: '#fef08a',
    band: 0xffc62f,
    line: 0xf4f4f0,
    pantStripe: [TEAMS.vikings.primary, 0xffc62f],
    socks: [TEAMS.vikings.primary, 0xffc62f],
  },
  // Atlanta: black helmet with the red facemask, black pants, white numbers,
  // red-and-silver jersey stripes.
  falcons: {
    helmet: 0x101820,
    helmetMetal: 0.2,
    facemask: TEAMS.falcons.primary,
    pants: 0x101820,
    numberColor: '#ffffff',
    band: TEAMS.falcons.primary,
    line: 0xa5acaf,
    pantStripe: [TEAMS.falcons.primary, 0xa5acaf],
  },
  // Carolina: Panther-blue helmet with the black facemask, white pants with a
  // blue-black stripe, blue numbers, blue-and-black jersey stripes.
  panthers: {
    helmet: TEAMS.panthers.primary,
    helmetMetal: 0.4,
    facemask: TEAMS.panthers.accent,
    pants: 0xe9e9e6,
    numberColor: '#0085ca',
    band: TEAMS.panthers.primary,
    line: TEAMS.panthers.accent,
    pantStripe: [TEAMS.panthers.primary, TEAMS.panthers.accent],
  },
  // New Orleans: old-gold helmet with the black facemask, black pants, white
  // numbers, gold-and-black jersey stripes.
  saints: {
    helmet: TEAMS.saints.accent,
    helmetMetal: 0.4,
    facemask: TEAMS.saints.primary,
    pants: TEAMS.saints.primary,
    numberColor: '#ffffff',
    band: TEAMS.saints.accent,
    line: TEAMS.saints.primary,
    pantStripe: [TEAMS.saints.accent, TEAMS.saints.accent],
  },
  // Tampa Bay: red helmet with the pewter facemask and an orange-pewter crown
  // stripe, pewter pants, white numbers, red-and-pewter jersey stripes.
  buccaneers: {
    helmet: TEAMS.buccaneers.primary,
    helmetMetal: 0.25,
    facemask: TEAMS.buccaneers.accent,
    pants: TEAMS.buccaneers.accent,
    numberColor: '#ffffff',
    band: TEAMS.buccaneers.primary,
    line: TEAMS.buccaneers.accent,
    pantStripe: [TEAMS.buccaneers.primary, TEAMS.buccaneers.accent],
    helmetStripe: [0xff7900, TEAMS.buccaneers.accent],
  },
}

export const kitMat = (color: number, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, roughness })

// The three pieces of kit striping, each sized to the player model it is added
// to (the receiver, lineman, defender and sideline bodies are built at
// different scales).
export function addKitYoke(
  group: THREE.Group,
  kit: UniformKit,
  d: { width: number; depth: number; bandY: number; lineY: number; collarR: number; collarY: number },
) {
  const band = new THREE.Mesh(new THREE.BoxGeometry(d.width, 0.1, d.depth), kitMat(kit.band, 0.45))
  band.position.y = d.bandY
  group.add(band)
  const border = new THREE.Mesh(new THREE.BoxGeometry(d.width, 0.055, d.depth), kitMat(kit.line))
  border.position.y = d.lineY
  group.add(border)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(d.collarR, 0.045, 8, 18), kitMat(kit.band, 0.45))
  collar.rotation.x = Math.PI / 2
  collar.position.set(0, d.collarY, 0.02)
  group.add(collar)
}

// band-line-band hoops around a sleeve's cuff, added in the sleeve's local space
// so they inherit its tilt.
export function addKitSleeveHoops(sleeve: THREE.Mesh, kit: UniformKit, cuffY: number, radius: number) {
  for (const hoop of [
    { y: cuffY + 0.08, h: 0.09, color: kit.band },
    { y: cuffY, h: 0.05, color: kit.line },
    { y: cuffY - 0.08, h: 0.09, color: kit.band },
  ]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.96, hoop.h, 12), kitMat(hoop.color))
    ring.position.y = hoop.y
    sleeve.add(ring)
  }
}

// A wide stripe with a thin contrast centre down the outside of one leg; the
// centre is skipped when the two colours match.
export function addKitLegStripe(group: THREE.Group, kit: UniformKit, stripeX: number, y: number, height: number) {
  const [wide, centre] = kit.pantStripe
  const wideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.05), kitMat(wide))
  wideStripe.position.set(stripeX, y, 0)
  group.add(wideStripe)
  if (wide !== centre) {
    const centreStripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, height, 0.05), kitMat(centre))
    centreStripe.position.set(stripeX, y, 0.03)
    group.add(centreStripe)
  }
}

// A coloured sock with a stripe near the top, pulled over one lower leg.
export function addKitSock(group: THREE.Group, kit: UniformKit, legX: number, topRadius: number) {
  if (!kit.socks) return
  const [sockColor, sockStripe] = kit.socks
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(topRadius * 0.9, topRadius, 0.4, 10), kitMat(sockColor, 0.7))
  sock.position.set(legX, 0.22, 0)
  group.add(sock)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(topRadius * 0.95, topRadius * 1.02, 0.06, 10), kitMat(sockStripe, 0.6))
  band.position.set(legX, 0.36, 0)
  group.add(band)
}

// The front-to-back "mohawk" crown stripe (flank-centre-flank), squashed in Y to
// hug a helmet sphere of the given radius centred at height y.
export function addKitHelmetStripe(group: THREE.Group, kit: UniformKit, radius: number, y: number) {
  if (!kit.helmetStripe) return
  const [flankColor, centreColor] = kit.helmetStripe
  for (const s of [
    { tube: radius * 0.09, color: flankColor },
    { tube: radius * 0.036, color: centreColor },
  ]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, s.tube, 8, 24, Math.PI), kitMat(s.color))
    arc.rotation.y = Math.PI / 2
    arc.scale.y = 0.9
    arc.position.set(0, y, 0)
    group.add(arc)
  }
}
