# Touchdown Rush

A first-person 3D football game that runs in the browser. You play as the
Minnesota Vikings in a fully modelled stadium, picking any of the other 31
NFL teams — grouped into their real conferences and divisions, each in their
own colors and kit — to face at the start of every game. Call plays, take
the snap, and either sling it downfield or tuck it and run through the
defense yourself.

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

## Streamlined testing

Run the automated rules suite before committing gameplay changes:

```bash
npm test          # run the complete Vitest suite once
npm run test:watch # re-run relevant tests as files change
```

The tests run without a browser or the 3D renderer, so feedback is fast. They
cover field-position conversion and display formatting, down-and-distance,
turnover field position, scoring, clock-expiry decisions, and kick-probability
boundaries. The browser game uses the same helpers in `src/gameMath.ts` and
`src/gameRules.ts`, keeping these checks focused on actual gameplay rules.

Use `npm run build` alongside `npm test`: the build catches TypeScript and
bundling errors, while the tests catch rules regressions.

### Manual 3D smoke test

The renderer and first-person input need a quick browser check after changes:

- [ ] Start a game, click the field, and confirm mouse look captures/releases
  normally and the camera rotates without jumps or inverted axes.
- [ ] Call a run or pass play and confirm it snaps immediately, lining up the
  offense and defense for the play you picked.
- [ ] Move with WASD and arrow keys; hold and release Shift/Space to confirm
  sprint, stamina drain, recovery, and normal movement all work.
- [ ] On a passing play, throw with `1`/`2`/`3`, click a receiver, and use `Q`;
  verify the intended target/action occurs and the ball/play resolves cleanly.
- [ ] Run into defenders and through the end zone; confirm tackles, scoring,
  HUD updates, and the next play/try flow are visible and responsive.
- [ ] Complete a field goal or punt and time a kick with Space; verify the kick
  meter, ball flight, and resulting possession update.
- [ ] Kick off (not onside): confirm you get movement control the instant you
  kick, can sprint downfield with WASD/Shift while the ball is in the air,
  and — on a live return — end up chasing the returner from wherever you
  ran to rather than snapping to a new spot. Confirm a touchback still hands
  the ball over cleanly with no leftover control.
- [ ] On a touch device or emulator, use Left, Right, and Sprint to confirm the
  on-screen controls work and do not obstruct essential HUD elements.

## How to play

Each possession starts with a play-call dialog. Pick an offensive play (or a
defensive call when the opponent has the ball), and the ball snaps
immediately — you take control of the quarterback or ball carrier in first
person.

### Controls

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Sprint (burns stamina) | `Shift` or `Space` |
| Look around | Move the mouse after clicking the field |
| Throw to a receiver | `1` / `2` / `3`, or click the receiver on screen |
| Throw the ball away (once the play is live) | `Q` |
| Switch controlled defender (on defense) | `Q` |
| Time a kick | `Space` when the kick meter is up — stop it in the gold zone |

On-screen **Left / Right / Sprint** buttons are provided for touch devices.

### Rules and game structure

- Every new game opens with a conference-first team-select dialog — pick a
  conference, then a division, then any of the 31 non-Vikings teams; their
  jerseys, helmet kit, end zone, sideline, and scoreboard all switch to
  match, each with its own uniform styling in `src/kits.ts`.
- You call the opening coin toss (heads/tails, with an animated referee
  flip) and choose to receive or kick.
- Four 5-minute quarters (a 3-minute sudden-death overtime period if tied),
  with a running game clock, a 40-second play clock, and a two-minute
  warning each half.
- Three timeouts per team per half (two apiece in overtime).
- Standard downs: four downs to gain 10 yards for a fresh set. Turnover on
  downs, interceptions, and fumbles all hand the ball to the opponent.
- Scoring: touchdowns (6) with a choice of extra-point kick (1) or a two-point
  try from the 2, field goals (3), and safeties (2).
- Special teams: playable kickoffs (normal or onside when trailing late,
  with real return chances), punts, field goals, and a victory kneel to burn
  clock. On a normal kickoff you get control the instant you kick it —
  sprint downfield with the coverage unit while the ball is in the air, then
  chase down and tackle the returner from wherever that sprint actually got
  you, same as real kickoff coverage.
- Offensive plays are grouped into Pass, Run, and Special Teams tabs in the
  play-call panel.
- Defensive play calls — Base 4-3, Blitz, Cover 2, Goal Line, QB Spy,
  Nickel, Zone Blitz, and Prevent — change how the AI pursues you.
- A small officiating crew (line judge, head linesman, and a referee behind
  the play) tracks every snap and signals first downs and touchdowns.
- Sprinting drains a stamina meter; run it empty and you're locked out of
  sprint until it recovers.

Your win/loss/tie record carries between games and is stored in the browser's
`localStorage`, so a season builds up across sessions.

## Project layout

```
index.html         Entry point, mounts the game into #app
src/main.ts         Composition root: wires the modules, input listeners, frame loop
src/core.ts         Types, teams/divisions, playbooks, rule constants, DOM refs, shared state
src/kits.ts         Per-team uniform kits (helmet, pants, stripes) for all 32 teams
src/world.ts        Renderer/scene/camera, audio, and every 3D builder (field, stadium, crowd, sky)
src/entities.ts     Player, defender, receiver, lineman, and referee models
src/rules.ts        The rules engine: drives, downs, scoring, kicks, clock, coin toss, play menus, HUD
src/simulation.ts   Per-frame simulation: passing, pursuit AI, tackling
src/style.css       HUD and layout styling
public/             Static assets (favicon, icons)
```

The modules form a one-directional dependency chain —
`gameMath/gameRules → core → world → entities → rules → simulation → main` —
so each layer only knows about the ones beneath it. Shared mutable game
state lives in a single `state` object in `core.ts`; the crowd uses
instanced meshes so several thousand fans stay cheap to render.
