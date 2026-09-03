# Touchdown Rush

A first-person 3D football game that runs in the browser. You play as the
Minnesota Vikings against the Chicago Bears in a fully modelled stadium —
call plays, take the snap, and either sling it downfield or tuck it and run
through the defense yourself.

Built with [Three.js](https://threejs.org/), TypeScript, and [Vite](https://vitejs.dev/).

## Running it

```bash
npm install
npm run dev      # start the dev server (Vite prints the local URL)
```

Other scripts:

```bash
npm run build    # type-check with tsc, then bundle to dist/
npm run preview  # serve the production build locally
```

## How to play

Each possession starts with a play-call dialog. Pick an offensive play (or a
defensive call when the opponent has the ball), then the ball is snapped and
you take control of the quarterback or ball carrier in first person.

### Controls

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Sprint (burns stamina) | `Shift` or `Space` |
| Look around | Move the mouse after clicking the field |
| Throw to a receiver | `1` / `2` / `3`, or click the receiver on screen |
| Throw the ball away | `Q` |
| Time a kick | `Space` when the kick meter is up — stop it in the gold zone |

On-screen **Left / Right / Sprint** buttons are provided for touch devices.

### Rules and game structure

- Four 2-minute quarters (a 3-minute overtime period if tied), with a running
  game clock and a 40-second play clock.
- Standard downs: four downs to gain 10 yards for a fresh set. Turnover on
  downs, interceptions, and fumbles all hand the ball to the opponent.
- Scoring: touchdowns (6) with a choice of extra-point kick (1) or a two-point
  try from the 2, field goals (3), and safeties (2).
- Special teams: field goal, punt, and a victory kneel to burn clock.
- Defensive play calls — Base 4-3, Blitz, Cover 2, Goal Line, and QB Spy —
  change how the AI pursues you.
- Sprinting drains a stamina meter; run it empty and you're locked out of
  sprint until it recovers.

Your win/loss/tie record carries between games and is stored in the browser's
`localStorage`, so a season builds up across sessions.

## Project layout

```
index.html         Entry point, mounts the game into #app
src/main.ts         Composition root: wires the modules, input listeners, frame loop
src/core.ts         Types, playbooks, rule constants, math helpers, DOM refs, shared state
src/world.ts        Renderer/scene/camera, audio, and every 3D builder (field, stadium, crowd, sky)
src/entities.ts     Player, defender, receiver, and lineman models
src/rules.ts        The rules engine: drives, downs, scoring, kicks, clock, play menus, HUD
src/simulation.ts   Per-frame simulation: passing, pursuit AI, tackling
src/style.css       HUD and layout styling
public/             Static assets (favicon, icons)
```

The modules form a one-directional dependency chain —
`core → world → entities → rules → simulation → main` — so each layer only
knows about the ones beneath it. Shared mutable game state lives in a single
`state` object in `core.ts`; the crowd uses instanced meshes so several
thousand fans stay cheap to render.
