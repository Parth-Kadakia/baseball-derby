# DIAMOND STORM

Arcade baseball — Three.js 3D stadium with 2D sprite-sheet actors. Three modes: HR Derby, Career, Practice. Generated SFX, screen shake, hit-stop, slow-mo on home runs. Vercel-hosted with an Upstash Redis leaderboard.

## Quick start

```sh
npm install
npm run dev          # http://localhost:5173
```

## Modes

- **HR Derby** — 1:30 or 20 pitches, then bonus time (0:30 base, 1:00 if you hit any 425+ ft HR in regulation). Only HRs count.
- **Career** — 3 lives, level rises every 5 at-bats (faster pitches, harder locations). Streak counter survives walks/hits, breaks on strikeout. Streak milestones at 5/10/20/30.
- **Practice** — endless until 3 outs. No pressure.

## Controls

| Key | Action |
|---|---|
| **SPACE** | hold to charge, release to swing |
| **A / D** | aim left / right |
| **P / Esc** | pause |
| **R** | restart after game over |

## Project layout

```
.
├── index.html            # Vite entry
├── src/
│   ├── main.js           # bootstrap (scene, camera, loop, input wiring)
│   ├── config.js         # constants, pitch types, hit table
│   ├── modes.js          # HR Derby / Career / Practice rules
│   ├── game.js           # state machine + game loop
│   ├── audio.js          # SFX engine (file + synth fallback, variants)
│   ├── feel.js           # screen shake / hit-stop / slow-mo
│   ├── particles.js      # particle pool
│   ├── trail.js          # ball-trail dots
│   ├── actors.js         # Actor / BallSprite / sprite slicing
│   ├── recolor.js        # jersey hue swap
│   ├── field.js          # stadium build (sky, lights, walls, crowd)
│   ├── hud.js            # DOM HUD updates
│   ├── storage.js        # localStorage profile + best scores
│   └── leaderboard.js    # client wrapper for /api
├── api/
│   ├── score.js          # POST submit run, updates leaderboards
│   └── leaderboard.js    # GET top N for a mode
├── public/
│   ├── sounds/sfx/*.mp3  # generated audio (15+ events with variants)
│   ├── spritsheets/*.png # sprite sheets
│   └── slices/*.json     # frame-rect specs
├── scripts/
│   └── generate-sfx.js   # ElevenLabs SFX generator (fal.ai)
├── legacy/               # original single-file prototypes (preserved)
├── vercel.json
└── package.json
```

## Generating SFX

The audio is generated via ElevenLabs through fal.ai. Costs ~$0.05 for the full set.

```sh
FAL_KEY=your_key npm run sfx              # generates only missing files
FAL_KEY=your_key npm run sfx -- --force   # re-generate everything
FAL_KEY=your_key npm run sfx -- --ids ump_strike,ump_ball   # specific ones
```

Output goes to `public/sounds/sfx/` so the game loads them automatically. Files are committed to the repo, so contributors don't need a fal.ai key.

## Deploying to Vercel + leaderboard setup

The leaderboard backend lives in `api/` and uses Upstash Redis. Without a Redis connection, the game still works — submission and the leaderboard view will show "leaderboard offline". To enable it:

### 1. Push to GitHub

Already done — `https://github.com/Parth-Kadakia/baseball-derby`.

### 2. Import the repo into Vercel

- Go to https://vercel.com/new
- Import the GitHub repo
- Vercel auto-detects Vite — no settings needed
- Click **Deploy**

The site goes live at `https://<project-name>.vercel.app`. The game itself works immediately; only the leaderboard is missing until step 3.

### 3. Connect Upstash Redis (free)

In the Vercel project dashboard:

- **Storage** tab → **Browse Marketplace** → **Upstash for Redis** → free Hobby tier
- Click **Add Integration** → choose your project → Vercel auto-injects:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- Trigger a redeploy (Deployments → latest → ⋯ → Redeploy)

Once redeployed, the leaderboard API routes work. Submit a score from the game-over screen and you'll see your global rank.

### Free-tier capacity

Upstash Hobby gives 10,000 commands/day. A submitted run uses ~5 commands; viewing the leaderboard uses ~50 commands. That's a few hundred submissions a day before you'd hit the limit, which is far above what a small game needs.

## Local API testing

Vercel's CLI can run the API routes locally:

```sh
npm i -g vercel
vercel dev          # http://localhost:3000 with /api routes wired
```

For this to work you also need a `.env.local` with the two Upstash env vars. Get them from your Upstash console (https://console.upstash.com/) — same values as the Vercel integration injects.

```
# .env.local (gitignored)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

## Anti-cheat notes

This is intentionally light:

- IP-based rate limit (10 submissions/min)
- Server-side clamping of absurd values (HR count, distance, streak, level)
- Best-only update — submitting a worse score is a no-op for the leaderboard

For a "trust your friends" deployment that's enough. Going public would warrant signing scores server-side (run the simulation on the server) or moving more game logic out of the client.
