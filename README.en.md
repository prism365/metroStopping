# Metro Stopping

(Language / 语言: [中文](README.md))

A browser-based lightweight metro stopping simulation game. The core objective is to stop precisely at the platform alignment marker. The game features multiple levels, vehicle unlocks, an achievement system, and an arcade mode. Hope you enjoy it. :)

## Key Features

- Physics-based stopping simulation (traction, braking, friction, air resistance, gradient, water accumulation, and wind)
- Multiple levels and vehicle unlock system
- Supports manual driving and ATC automatic driving mode

## Quick Start

1. Open `index.html` in your browser (double-click or serve via a local static server)
2. Click **Start Driving** on the main menu to begin the game
3. Controls:
   - `↑` / `W` / `⬆`: Accelerate (traction)
   - `↓` / `S` / `⬇`: Decelerate (braking)
   - `Space`: Reset throttle/brake handle
   - `R`: Reset and return to main menu
   - `M`: Main menu

## Development Notes

- Entry file: `index.html` (pure static entry; only loads the stylesheets and `src/game/main.js`)
- Local dev server: `python scripts/serve.py` (zero-dependency; adds `Cache-Control: no-cache` automatically to avoid stale module caching, matching production behavior)
- Styles: `src/styles/` (loaded in order: `variables.css` → `base.css` → `layout.css` → `components.css` → `responsive.css`)
- Game logic: ES Modules under `src/game/` (no build tooling)
  - Entry/orchestration: `main.js`, `flow.js`, `input.js`
  - Pure logic: `data.js` (constants/data), `physics.js` (physics), `sim.js` (per-frame orchestration), `progress.js` (achievements/progress), `scoring.js` (scoring), `passenger.js` (passenger comments), `stats.js` (run statistics), `state.js` (shared state)
  - Presentation: `ui.js`, `render.js`, `resultView.js`, `dom.js`
  - Environment & ATC: `environment.js`, `atc.js`, `control.js`
- Local data keys (The game data): `trainProgress`, `trainAchievements` (stored in `localStorage`)
- Achievements are defined in the `ACHIEVEMENTS` object in `src/game/data.js`; logic is implemented in `checkAchievements(data)` in `src/game/progress.js` (pure logic — returns the newly unlocked achievement array; toast feedback is handled by `flow.js`)

### Common Modification Points

- Add new achievements: add an entry in `ACHIEVEMENTS` and write the corresponding logic in `checkAchievements`
- Switch storage method: currently uses `localStorage`; you can experiment with server-side persistence

## Testing Suggestions

- Automated regression: `npm test` (unit tests), `npm run test:e2e` (Playwright smoke tests), `npm run test:all` (physics comparison + unit + smoke)
- Use developer tools (F12) to check console logs for exceptions
- Delete the game data via the `🗑️Reset Save` button on the "About" page
- After modifying achievement logic (in `src/game/progress.js`), print `state.stats` at the `endGame()` call site to verify statistics
- Testing backdoor: on the main menu, press `⬆⬆⬆⬆⬇⬇⬇⬇` to unlock all levels and vehicles

## Deployment (Cloudflare Pages)

This repository is a pure static site (no build tooling) and can be deployed directly to Cloudflare Pages:

1. Push the repository to GitHub / GitLab
2. Cloudflare Dashboard → **Workers & Pages** → **Create → Pages → Connect to Git**, and select this repository
3. Build configuration:
   - Framework preset: **None**
   - Build command: **leave empty** (no build step)
   - Build output directory: **leave empty or `/`** (`index.html` is at the repository root)
4. The `_headers` file at the repository root sets `Cache-Control: no-cache` for all resources, so users get the latest version on a normal refresh after each release — no hard refresh needed

After deployment, visit `https://<project-name>.pages.dev` (a custom domain can be configured).

## Future Development Directions

**Performance & Rendering**
- Add a page loading screen
- High-DPI support: scale the canvas by `devicePixelRatio` and listen to `resize` for sharper rendering on high-DPI displays
- Auto-pause in background: listen for `visibilitychange` and pause the game when the tab is hidden

**Code Structure**
- Encapsulate runtime fields into a `RunState` (`pos` / `speed` / `handle`, etc.) to further reduce the mutable global `state`

**Testing & Tooling**
- CI: GitHub Actions to automatically run `verify-physics.mjs` and `npm test` on push / PR (low priority)
- Snapshot `verify-physics.mjs`: pin baseline JSON with a reproducible PRNG to eliminate dual maintenance of `refXxx` and drift risk (low priority)

**Gameplay & UX**
- Add a settings menu
- Sound effects: Web Audio synthesized departure / braking / arrival chimes / VVVF motor sounds
- Pause feature (with keyboard shortcut)
- Level star display refinement: show the specific score / star count

## Contributing

Contributions are welcome: Fork -> Create branch -> Submit PR. Please describe your changes and testing steps in the PR.