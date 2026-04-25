# Overview

> AIコーディングツール（Claude Code / Codex）だけを使って、ブラウザで動くフルボディカメラゲームをゼロから作った。
> Using only AI coding tools (Claude Code / Codex), built a full-body browser camera game from scratch.
>
> **Why:** AIがどこまで「動くもの」を作れるか、そして「楽しいと感じるもの」を作れるかを試したかった。
> Wanted to test how far AI can take you — not just to something that works, but something that actually feels fun to play.

# Demo

> **Demo URL:** *(Vercel deployment URL)*
>
> **Environment:** Browser only — no install, no app. Camera + enough space to move.
> Chrome / Edge recommended. Mobile supported (some features limited).
>
> **To play:** Open the URL, allow camera access, stand 1–2 m back so your full body is visible.

# Result

> **できたこと / What worked**
> - Basic game loop was playable within 1–2 hours of prompting
> - Two full game modes shipped: Pose Mirror (pose accuracy scoring) and BodyWare (WarioWare-style microgames)
> - Global leaderboard with score validation and deduplication
> - Total time start to finish: ~18 hours
>
> **わかったこと / Key finding**
> - AIはコードを書くのは速い。「楽しさ」を設計するのは遅い。
>   AI writes code fast. Designing for "fun" is still slow.
> - The hardest part wasn't the tech — it was the UX questions: how long should a round feel? when does the difficulty ramp feel satisfying vs frustrating? AI can't answer those intuitively; it needs to be told.
> - Iterating on game feel (timing, feedback, pacing) took the majority of the 18 hours, not the architecture.
>
> **課題 / Open issues**
> - Replay recording not supported on iOS / Safari (WebM codec missing) — UI is hidden gracefully but the feature is desktop-only for now
> - Pose detection struggles in low light or when the player is too close to the camera
> - Game "feel" is still rough in places — microgame difficulty is hard to tune by instruction alone

---

## Tech Stack

- **Frontend:** Vanilla HTML / CSS / JS — no framework, no build step
- **Pose detection:** Google MediaPipe PoseLandmarker (Heavy model, float16) — runs in-browser on GPU
- **Game rendering:** Canvas 2D API
- **Replay:** MediaRecorder + Canvas captureStream (Chromium only)
- **Backend:** Vercel Serverless Functions (Node.js ≥ 18)
- **Database:** PostgreSQL on Render (via `pg`)
- **Hosting:** Vercel (static output + API routes, zero config)

## References

- [MediaPipe PoseLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
- [Claude Code](https://claude.ai/code)
- [OpenAI Codex](https://openai.com/codex)
- [Vercel](https://vercel.com)
- [Render](https://render.com)
