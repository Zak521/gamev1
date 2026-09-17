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
  // Dallas: metallic-silver helmet with the navy-blue star and a thin
  // navy-white-navy centre stripe, navy facemask, silver pants with a
  // navy-white stripe, white numbers, navy-and-white jersey stripes.
  cowboys: {
    helmet: 0xc4c9cc,
    helmetMetal: 0.55,
    facemask: TEAMS.cowboys.primary,
    pants: 0xc4c9cc,
    numberColor: '#ffffff',
    band: TEAMS.cowboys.primary,
    line: 0xf4f4f0,
    pantStripe: [TEAMS.cowboys.primary, 0xf4f4f0],
    helmetStripe: [TEAMS.cowboys.primary, 0xf4f4f0],
  },
  // Philadelphia: midnight-green helmet with the white wings and grey
  // facemask, black pants with a green-silver stripe, white numbers,
  // green-and-silver jersey stripes.
  eagles: {
    helmet: TEAMS.eagles.primary,
    helmetMetal: 0.2,
    facemask: TEAMS.eagles.accent,
    pants: 0x000000,
    numberColor: '#ffffff',
    band: TEAMS.eagles.primary,
    line: TEAMS.eagles.accent,
    pantStripe: [TEAMS.eagles.primary, TEAMS.eagles.accent],
  },
  // New York: blue helmet with the red-and-white "NY" and a grey facemask,
  // white pants with a blue-red stripe, white numbers, blue-and-red jersey
  // stripes.
  giants: {
    helmet: TEAMS.giants.primary,
    helmetMetal: 0.3,
    facemask: 0x9aa5ab,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.giants.primary,
    line: TEAMS.giants.accent,
    pantStripe: [TEAMS.giants.primary, TEAMS.giants.accent],
  },
  // Washington: burgundy helmet with the gold "W" and black facemask,
  // burgundy pants with a gold stripe, gold numbers, burgundy-and-gold
  // jersey stripes.
  commanders: {
    helmet: TEAMS.commanders.primary,
    helmetMetal: 0.2,
    facemask: 0x000000,
    pants: TEAMS.commanders.primary,
    numberColor: '#ffb612',
    band: TEAMS.commanders.primary,
    line: TEAMS.commanders.accent,
    pantStripe: [TEAMS.commanders.primary, TEAMS.commanders.accent],
  },
  // Baltimore: purple helmet with the black facemask and gold "B" (see
  // ravensBDecalTexture), purple pants with a black-gold stripe, white
  // numbers, purple-and-black jersey stripes.
  ravens: {
    helmet: TEAMS.ravens.primary,
    helmetMetal: 0.3,
    facemask: 0x000000,
    pants: TEAMS.ravens.primary,
    numberColor: '#ffffff',
    band: TEAMS.ravens.primary,
    line: TEAMS.ravens.accent,
    pantStripe: [0x000000, TEAMS.ravens.accent],
  },
  // Cincinnati: orange helmet with the black-orange tiger-stripe crown and
  // black facemask — no separate side logo, same as the real thing — black
  // pants, white numbers, black-and-orange jersey stripes.
  bengals: {
    helmet: TEAMS.bengals.primary,
    helmetMetal: 0.15,
    facemask: 0x000000,
    pants: 0x000000,
    numberColor: '#ffffff',
    band: TEAMS.bengals.primary,
    line: 0x000000,
    pantStripe: [TEAMS.bengals.primary, 0x000000],
    helmetStripe: [0x000000, TEAMS.bengals.primary],
  },
  // Cleveland: solid orange helmet with no logo — a Browns tradition since
  // 1946 — and a brown facemask, white pants with a brown-orange stripe,
  // white numbers, brown-and-orange jersey stripes.
  browns: {
    helmet: TEAMS.browns.accent,
    helmetMetal: 0.2,
    facemask: TEAMS.browns.primary,
    pants: 0xffffff,
    numberColor: '#ffffff',
    band: TEAMS.browns.primary,
    line: TEAMS.browns.accent,
    pantStripe: [TEAMS.browns.primary, TEAMS.browns.accent],
  },
  // Pittsburgh: black helmet with the gold facemask and the Steelmark on one
  // side only — the NFL's original single-sided decal, unchanged since 1962
  // (see the singleSided flag on the decal below) — black pants with a gold
  // stripe, gold numbers, black-and-gold jersey stripes.
  steelers: {
    helmet: TEAMS.steelers.primary,
    helmetMetal: 0.25,
    facemask: TEAMS.steelers.accent,
    pants: TEAMS.steelers.primary,
    numberColor: '#ffb612',
    band: TEAMS.steelers.primary,
    line: TEAMS.steelers.accent,
    pantStripe: [TEAMS.steelers.primary, TEAMS.steelers.accent],
  },
  // Houston: deep-steel-blue helmet with the bull-horn mark, battle-red
  // facemask, white pants with a steel-blue-and-red stripe, white numbers,
  // steel-blue-and-red jersey stripes.
  texans: {
    helmet: TEAMS.texans.primary,
    helmetMetal: 0.25,
    facemask: TEAMS.texans.accent,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.texans.primary,
    line: TEAMS.texans.accent,
    pantStripe: [TEAMS.texans.primary, TEAMS.texans.accent],
  },
  // Indianapolis: blue helmet with the horseshoe mark, grey facemask, white
  // pants with a blue stripe, white numbers, blue-and-grey jersey stripes —
  // no black anywhere, same as the real thing.
  colts: {
    helmet: TEAMS.colts.primary,
    helmetMetal: 0.35,
    facemask: TEAMS.colts.accent,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.colts.primary,
    line: TEAMS.colts.accent,
    pantStripe: [TEAMS.colts.primary, TEAMS.colts.primary],
  },
  // Jacksonville: teal helmet with the "J" mark, black facemask, black pants,
  // white numbers, teal-and-gold jersey stripes.
  jaguars: {
    helmet: TEAMS.jaguars.primary,
    helmetMetal: 0.3,
    facemask: 0x000000,
    pants: 0x000000,
    numberColor: '#ffffff',
    band: TEAMS.jaguars.primary,
    line: TEAMS.jaguars.accent,
    pantStripe: [TEAMS.jaguars.primary, TEAMS.jaguars.accent],
  },
  // Tennessee: navy helmet with the "T" mark and a Titans-blue-and-red crown
  // stripe, red facemask, white pants with a navy-and-red stripe, white
  // numbers, navy-and-Titans-blue jersey stripes.
  titans: {
    helmet: TEAMS.titans.primary,
    helmetMetal: 0.2,
    facemask: 0xc8102e,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.titans.primary,
    line: TEAMS.titans.accent,
    pantStripe: [TEAMS.titans.primary, 0xc8102e],
    helmetStripe: [TEAMS.titans.accent, 0xc8102e],
  },
  // Buffalo: white helmet with the blue-and-red buffalo mark and a grey
  // facemask, white pants with a blue-red stripe, white numbers,
  // blue-and-red jersey stripes.
  bills: {
    helmet: 0xf4f4f0,
    helmetMetal: 0.15,
    facemask: 0x9aa5ab,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.bills.primary,
    line: TEAMS.bills.accent,
    pantStripe: [TEAMS.bills.primary, TEAMS.bills.accent],
  },
  // Miami: aqua helmet with the white-and-navy dolphin mark and a white
  // facemask, white pants with an aqua-orange stripe, white numbers,
  // aqua-and-orange jersey stripes.
  dolphins: {
    helmet: TEAMS.dolphins.primary,
    helmetMetal: 0.25,
    facemask: 0xf4f4f0,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.dolphins.primary,
    line: TEAMS.dolphins.accent,
    pantStripe: [TEAMS.dolphins.primary, TEAMS.dolphins.accent],
  },
  // New England: silver helmet with the navy-and-red "P" mark and a navy
  // facemask, white pants with a navy-red stripe, white numbers,
  // navy-and-red jersey stripes.
  patriots: {
    helmet: 0xb0b7bc,
    helmetMetal: 0.5,
    facemask: TEAMS.patriots.primary,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.patriots.primary,
    line: TEAMS.patriots.accent,
    pantStripe: [TEAMS.patriots.primary, TEAMS.patriots.accent],
  },
  // New York (Jets): Gotham-green helmet with the white "J" mark and a white
  // facemask, white pants with a green stripe, white numbers, green-and-black
  // jersey stripes.
  jets: {
    helmet: TEAMS.jets.primary,
    helmetMetal: 0.2,
    facemask: 0xf4f4f0,
    pants: 0xf4f4f0,
    numberColor: '#ffffff',
    band: TEAMS.jets.primary,
    line: TEAMS.jets.accent,
    pantStripe: [TEAMS.jets.primary, TEAMS.jets.accent],
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
