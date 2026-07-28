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
   - `↑` / `⬆`: Accelerate (traction)
   - `↓` / `⬇`: Decelerate (braking)
   - `Space`: Reset throttle/brake handle
   - `R`: Reset and return to main menu
   - `M`: Main menu

## Development Notes

- Main file: `index.html` (contains styles, UI, and all game logic)
- Local data keys: `trainProgress`, `trainAchievements` (stored in `localStorage`)
- Achievements are defined in the `ACHIEVEMENTS` object; logic is implemented in `checkAchievements(data)`

### Common Modification Points

- Extract achievement thresholds into constants: move hardcoded thresholds from the logic to the top of the file for easier tuning
- Add new achievements: add an entry in `ACHIEVEMENTS` and write the corresponding logic in `checkAchievements`
- Switch storage method: currently uses `localStorage`; you can experiment with server-side persistence

## Testing Suggestions

- Use developer tools (F12) to check console logs for exceptions
- Test data clearing logic via the `🗑️Reset Save` button on the "About" page
- After modifying achievement logic, print the `state` at the `endGame()` call site to verify statistics
- Testing backdoor: on the main menu, press `⬆⬆⬆⬆⬇⬇⬇⬇` to unlock all levels and vehicles

## Contributing

Contributions are welcome: Fork -> Create branch -> Submit PR. Please describe your changes and testing steps in the PR.