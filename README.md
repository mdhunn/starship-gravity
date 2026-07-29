# Starship Gravity

A modernized **3D GPU-accelerated Asteroids** remake with mutual Newtonian gravity, a **Safety** meter instead of lives, and **Claude** aliens that warp physics “for safety.”

Built with React 19, Three.js / React Three Fiber, TanStack Start, TypeScript, and Tailwind.

## Features

- Mutual N-body gravity (Plummer-softened, \(G = 25\)) — clean Newtonian vacuum (no ambient drag)
- **Safety** starts at 100; damage drains it; 0.1% of score converts back at sector clear (falls off at higher levels)
- **1,000 points** for fully destroying an asteroid lineage
- **Claude** aliens: one on level 1, +1 every 10 levels; unique physics warps; contradictory effects stay apart
- Rocks **ricochet** off rocks, bullets, and the ship
- Touch controls (adaptive), keyboard (WASD + arrows), gamepad
- Procedural cockpit audio (breathing, thrusters, cannon) with volume toggles
- Fullscreen clock (system 12h/24h; tap to toggle)
- Demo idle screen with rules and scoring

## Controls

| Input | Action |
|-------|--------|
| A / ← · D / → | Rotate |
| W / ↑ | Main engines |
| S / ↓ | Retro rockets (¼ thrust) |
| Space / F | Fire |
| P / Esc | Pause |
| Gamepad | Stick/D-pad · A/B/RB fire · RT/Y thrust · LT/X retro · Start pause |

## Run locally

```bash
npm install
npm run dev
```

App listens on `0.0.0.0:8080`.

```bash
npm run build
npm run typecheck
```

## Project layout

```
src/game/           # Simulation, render, UI, audio
src/game/sim/       # Physics, input, gravity, Claude
src/game/render/    # Three.js / R3F meshes & camera
src/game/ui/        # HUD, overlays, touch, audio menu
src/routes/         # TanStack Start routes
```

## License

Personal project — all rights reserved unless otherwise noted.
