# Vercel Deploy

Deploy this app with the Vercel project root set to `bodygame/`.

## Required env vars

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## Deploy settings

- Framework Preset: `Other`
- Root Directory: `bodygame`
- Build Command: leave empty
- Output Directory: leave empty

## Notes

- Static pages are served directly from this folder.
- Serverless API routes live in `api/`.
- Local-only files such as `cert.pem`, `key.pem`, `server.js`, and `scores.json` are excluded by `.vercelignore`.
