# Dirt Rider MX

A 2D side-scrolling motocross game in plain HTML, JavaScript and canvas. No build step and no dependencies, so it runs on GitHub Pages as-is. All art and code are original.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Throttle | Up / W | GAS |
| Brake | Down / S | BRAKE |
| Lean back (nose up) | Left / A | LEAN BACK |
| Lean forward (nose down) | Right / D | LEAN FWD |
| Restart | R | |
| Mute engine | M | |

Land on both wheels, grab checkpoints every 100 m, and land flips for bonus popups. A crash respawns you at your last checkpoint.

## Put it on GitHub Pages

1. Create a repo and add `index.html`, `physics.js`, `game.js` (and optionally `test.js`, `README.md`).
2. In the repo go to **Settings > Pages**, set the source to **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Tests

`node test.js` runs a headless physics check (idle stability, full throttle, and a simple autopilot).

## Tweaking

Physics constants (mass, suspension, engine power, lean torque) are at the top of `physics.js`. Terrain is generated from a seed in the `Terrain` constructor: change `1337` in `game.js` for a different track.
