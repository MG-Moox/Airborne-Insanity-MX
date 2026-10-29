# Airborne Insanity MX

A free-roam 3D motocross game that runs in the browser (WebGL2, no build step, no dependencies).
The map is built from the supplied painting (`assets/map.jpg`): The Peak, Forest Trails, Jump Zone,
River Crossing, Cliff Line, MX Track, Festival and the Lake, with real elevation (sea level to a 525 m summit).

## Play
Open `index.html` through any static server (`npm start` uses the bundled Express server, or `python3 -m http.server`).
GitHub Pages works too (Settings > Pages > `main` / root).

| Action | Keys |
| --- | --- |
| Throttle / brakes | `W` / `S` (front + rear), `Space` rear only, `B` front only |
| Steer | `A` `D` |
| Rider weight | `Up` / `Down` lean forward / back, `Left` / `Right` lean sideways (also controls flips and whips in the air) |
| Camera | `C` cycles dynamic chase, close chase, rider POV, free orbit (mouse drag, wheel zoom) |
| Map and fast travel | `M`, or keys `1`-`8` |
| Respawn / pause / lap reset | `R` / `Esc` / `L` |
| Gamepad | left stick steer, RT throttle, LT front brake, RB or X rear brake, right stick lean, A respawn, Y camera |

## What is implemented (Stage 1)
- 6-DOF rigid-body bike: raycast spring/damper suspension (independent front/rear), tyre friction circle with
  surface grip, wheelspin, braking (separate front/rear), weight shift, rider balance, air control, wheelies/stoppies, crashes and respawn.
- Water (wading drag, deep-water crash), map-border wall, solid buildings and trees, jumps with landing slopes.
- Rider with IK arms/legs, seated/standing poses and a tumbling ragdoll on a crash.
- Terrain generated from the painting layout: kernel-regression elevation, river and creek channels, lake, banked MX loop, forests driven by the painted map.
- Cameras: dynamic chase, close chase, POV, free orbit. HUD, minimap, full map with fast travel, lap timer with sector checks, synthesised engine/wind/tyre audio, dust and spray particles.

## Not done yet (planned stages)
Garage and customisation, suspension setup screen and engine classes, the professional MX circuit with three layouts, the urban city map,
menus and game modes, AI racing (a prototype is in `src/race.js` but is disabled because it is not reliable), PBR materials, shadow maps and ambient occlusion
(needs more than the current plain WebGL2 shader), clutch/gearbox simulation.

## Tests
- `node tests/physics.test.js` physics and world tests.
- `python3 tests/smoke.py http://localhost:8000/` browser UI test (needs Playwright + Chromium).

`classic-2d/` keeps the original 2D prototype.
