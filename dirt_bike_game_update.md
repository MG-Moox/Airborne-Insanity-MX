# DIRT BIKE GAME — UPDATE PATCH

Use this file as the update specification for the ORIGINAL dirt bike game.
IMPORTANT: Do NOT create a separate replacement game. Modify the existing game in-place.

## MAIN GOAL
Upgrade the existing dirt bike game while keeping all current working features unless they are specifically replaced below.

## 1. VISUAL DESIGN
Give the game a polished modern motocross-game look:
- Full-screen game area.
- Dark/black motocross-style interface.
- Large dirt bike gameplay area.
- Cleaner menus and HUD.
- Modern buttons with clear labels.
- Add subtle animations/transitions where possible.
- Make the game look like a real dirt bike game rather than a basic demo.
- Keep the game responsive on both desktop and mobile.
- Do not remove existing gameplay just to change the appearance.

## 2. PLAYER / BIKE
Keep the original player and bike system, but improve it:
- Dirt bike should have visible wheels, frame, suspension and rider.
- Add basic bike lean/rotation while airborne.
- Bike should react naturally to acceleration, braking and landing.
- Keep physics lightweight so the game runs smoothly in a browser.
- Preserve any existing bike customization that already works.

## 3. CONTROLS
Desktop keyboard:
- W / Up Arrow = accelerate
- S / Down Arrow = brake/reverse
- A / Left Arrow = lean backward
- D / Right Arrow = lean forward
- Space = jump/bunny hop if the existing game supports it
- R = reset/restart
- P = pause

Mobile:
- Add large on-screen controls:
  - throttle
  - brake
  - lean left/back
  - lean right/forward
  - reset
- Buttons must not block important gameplay.
- Controls should work with both mouse and touch.
- Prevent buttons from accidentally scrolling the page.

## 4. CAMERA
Improve the camera:
- Follow the bike smoothly.
- Keep the bike near the centre of the screen.
- Camera should move with the terrain.
- Avoid sudden camera jumps.
- Keep the player visible during jumps.

## 5. TERRAIN / TRACK
Improve the existing track without deleting the original track:
- Add smoother dirt terrain.
- Add jumps, rollers and small bumps where appropriate.
- Add ramps and landing areas.
- Add visual dirt/grass details.
- Make collisions match the visible terrain as closely as practical.
- Keep the original level playable.

## 6. GAME HUD
Add a clean HUD showing:
- Speed
- Current lap/level if the original game has laps/levels
- Air time when airborne
- Best time if timing already exists
- Pause button
- Reset button

Do not display fake statistics as if they are real.

## 7. MENUS
Improve the existing menus:
- Play
- Garage/customization if already supported
- Settings
- Controls
- Restart
- Resume
- Main Menu

Do not remove existing menu functionality.

## 8. SOUND
If the original game already has sound:
- Improve organization of sound effects.
- Add engine pitch changes based on speed if practical.
- Add jump/landing sounds.
- Add UI click sounds.

If sound is not already implemented, do NOT make the game depend on external audio files unless they are already available in the repository.

## 9. PERFORMANCE
Very important:
- Keep the game playable in a normal browser.
- Avoid unnecessary libraries.
- Avoid huge images or assets.
- Do not introduce dependencies that require a complicated build process unless the existing project already uses them.
- Fix JavaScript errors rather than hiding them.

## 10. ORIGINAL GAME MUST REMAIN
This is an UPDATE, NOT a replacement.

Before changing code:
1. Inspect the existing project.
2. Identify the existing entry file and game loop.
3. Identify existing controls.
4. Identify existing physics.
5. Identify existing assets.
6. Modify those systems instead of creating a completely separate game.
7. Preserve all working features.
8. Only add files when they are actually required.

## 11. GITHUB / DEPLOYMENT
Make the update compatible with the existing GitHub repository and GitHub Pages setup.

Do NOT:
- change the repository structure unnecessarily
- rename the existing entry point unless required
- break asset paths
- introduce a framework that requires a new build system unless the project already uses one
- create a second unrelated index.html

If the project is a simple HTML/CSS/JavaScript game, keep it simple.

## 12. IMPORTANT IMPLEMENTATION RULE
After making changes, check the entire project for:
- broken imports
- broken asset paths
- missing files
- JavaScript syntax errors
- duplicate event listeners
- controls that no longer work
- buttons that do nothing
- mobile controls that do not respond
- game loop errors

The final result must be the ORIGINAL dirt bike game with the new visual design, controls and gameplay improvements integrated into it.

## 13. UPDATE PROCESS
Do the work in this order:

PHASE 1:
Inspect the existing game.

PHASE 2:
Explain briefly which files need changing.

PHASE 3:
Update the existing files.

PHASE 4:
Test the controls and game loop.

PHASE 5:
Fix errors.

PHASE 6:
Make the final code ready to commit/push to GitHub.

Do NOT stop after making only the visual changes. Make sure the controls and gameplay still work.

## FINAL CHECK
Before finishing, confirm:
[ ] Original game preserved
[ ] Visuals upgraded
[ ] Keyboard controls work
[ ] Mobile controls work
[ ] Bike physics still work
[ ] Camera works
[ ] Track works
[ ] HUD works
[ ] Menus work
[ ] No obvious JavaScript errors
[ ] GitHub Pages-compatible
