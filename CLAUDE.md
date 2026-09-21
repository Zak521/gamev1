# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Touchdown Rush — a first-person 3D browser football game (play as the Vikings
vs. one of the NFC North rivals). Built with Three.js, TypeScript, and Vite.

## Commands

```bash
npm run dev          # start the Vite dev server
npm run build         # tsc typecheck, then bundle to dist/
npm run preview       # serve the production build locally
npm test              # run the full Vitest suite once
npm run test:watch    # re-run relevant tests as files change
```

Run a single test file: `npx vitest run src/gameMath.test.ts`

There is no lint script configured. Always run `npm test` and `npm run build`
before considering a gameplay-rules change complete — the build catches
TypeScript/bundling errors, the tests catch rules regressions.

### Manual 3D smoke test

`npm test` covers rules logic only — it runs headless, without the renderer.
Any change touching movement, passing, kicking, or camera/input needs a
manual check in the browser (`npm run dev`). See the checklist in README.md
under "Manual 3D smoke test" before calling a gameplay change done.

## Architecture

The modules form a one-directional dependency chain — each layer only
imports from the ones before it, never the reverse:

```
gameMath/gameRules → core → world → entities → rules → simulation → main
```

- **`src/gameMath.ts`** / **`src/gameRules.ts`** — pure functions with no DOM
  or Three.js dependency (field-position conversion, down/distance text,
  clock-expiry decisions, kick-probability curves). Kept dependency-free
  specifically so they run fast under Vitest in Node; this is the only part
  of the codebase with test coverage (`*.test.ts` files sit next to them).
- **`src/core.ts`** — shared types, team/playbook constants, DOM element
  refs, and the single mutable `state` object that the rest of the app reads
  and writes. Re-exports the gameMath/gameRules helpers so downstream modules
  import everything from one place.
- **`src/kits.ts`** — per-team uniform data (helmet/pants/stripe colors)
  keyed by `TeamId` from `core.ts`; consumed when building player meshes.
- **`src/world.ts`** — renderer, scene, camera, audio, and every 3D builder
  (field, stadium, crowd, sky, jumbotron, fireworks).
- **`src/entities.ts`** — player, defender, receiver, lineman, and referee
  mesh construction/updates.
- **`src/rules.ts`** — the rules engine: drives, downs, scoring, kicks, game
  clock, play-call menus, coin toss, HUD updates.
- **`src/simulation.ts`** — per-frame simulation: passing, defensive pursuit
  AI, tackling.
- **`src/main.ts`** — composition root; wires input listeners (keyboard,
  pointer, touch buttons) and drives the `requestAnimationFrame` loop.

`src/counter.ts` is unused leftover Vite template scaffolding, not part of
the app's import graph.

Win/loss/tie record persists across sessions via `localStorage`, read/written
from the rules engine.
