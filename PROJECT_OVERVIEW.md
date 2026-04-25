> **A personal note**
>
> Whole project was built using Codex / Claude Code.
> Functionally, the basic game flow works right after the first few prompts, and was "playable" under 1–2 hours.
>
> Most of the time spent was setting up the questions and UX to make it "feel" fun — which is still hard to instruct AI to understand as a concept.
>
> Total time spent: around 18 hours start to finish.

---

# WellFit — Move it! Move it!

**Browser-based full-body camera game.** Players use their webcam as the controller — no hardware, no installs, just a browser and enough space to move.

Created by [designium](https://www.designium.jp/xr).

---

## What it is

Two playable game modes, accessible from a shared landing page with a global leaderboard.

### Pose Mirror
Match a series of target poses shown on screen. After 8 rounds a timed bonus round begins — hit as many random poses as possible before the clock runs out. Scoring is based on joint angle accuracy across 8 key joints (shoulders, elbows, hips, knees), with a speed bonus for fast matches and a combo multiplier for consecutive high-scoring rounds.

### BodyWare
WarioWare-style microgames where your whole body is the controller. Each round a random challenge flashes on screen and the player has a few seconds to complete it. The time limit shrinks every 5 games. 3 lives, endless play.

Current microgames: **Duck, Freeze, Balance, Catch, Punch, Slash, Conduct, Lean, Pull, Mirror**

---

## Tech Stack

### Frontend
- **Vanilla HTML / CSS / JavaScript** — no framework, no build step
- **Canvas 2D API** — all game rendering (mirrored video background, skeleton overlay, scene animations, HUD)
- **MediaPipe PoseLandmarker (Heavy, float16)** — real-time pose detection via the browser ML runtime; detects 33 body landmarks per frame with per-point visibility scores, runs on GPU where available
- **MediaRecorder + Canvas captureStream** — records gameplay for an end-of-game replay clip; gracefully disabled on browsers/devices that don't support WebM encoding (Safari, most iOS)

### Game logic
| File | Role |
|---|---|
| `js/pose-engine.js` | MediaPipe wrapper — landmark → joint angle computation, skeleton & silhouette drawing |
| `js/bodyware.js` | BodyWare state machine (CALIBRATE → FLASH → ACTIVE → RESULT → GAME\_OVER) |
| `js/pose-mirror.js` | Pose Mirror state machine (CALIBRATE → HOLD → SCORE → BONUS → GAME\_OVER) |
| `js/ui.js` | Shared UI — calibration flow, HUD overlays, score popups, confetti |
| `js/data/microgames.js` | Microgame definitions and physics logic |
| `js/data/poses.js` | Target pose angle data for Pose Mirror |

### Backend
- **Vercel serverless functions** (Node.js ≥ 18) — two API routes, no build step required
  - `POST /api/score` — validates and stores a score submission; deduplicates by session token
  - `GET /api/leaderboard` — returns top scores per game mode
- **PostgreSQL on Render** — persistent score storage via the `pg` npm package

### Hosting
- **Vercel** — static file serving + serverless functions from a single deployment; root directory set to `bodygame/`
- No CDN configuration needed; MediaPipe model is fetched from Google Storage at runtime

### Leaderboard
Client-side `leaderboard.js` handles player profile creation (name + country, stored in `localStorage`), score submission to the API, and rendering the leaderboard table on the home page. Score submissions are validated server-side against per-mode max-score and minimum session duration limits to filter out invalid entries.

---

## Repository layout

```
WellFit/
└── bodygame/           # everything — deployed as the Vercel root
    ├── index.html      # landing page + leaderboard
    ├── pose-mirror.html
    ├── bodyware.html
    ├── css/styles.css
    ├── js/
    │   ├── pose-engine.js
    │   ├── pose-mirror.js
    │   ├── bodyware.js
    │   ├── ui.js
    │   ├── leaderboard.js
    │   └── data/
    │       ├── poses.js
    │       └── microgames.js
    ├── api/
    │   ├── score.js
    │   ├── leaderboard.js
    │   └── _db.js
    └── vercel.json
```

---

## Requirements to play

- HTTPS connection (camera access is blocked on plain HTTP outside localhost)
- Webcam
- Enough space to stand and move — roughly 1–2 m from the camera so the full body is visible
- Chrome or Edge recommended for best MediaPipe GPU performance; Firefox and mobile browsers are supported with reduced feature availability (replay disabled on iOS)
