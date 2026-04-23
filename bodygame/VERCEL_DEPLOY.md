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
- Local-only files such as `cert.pem`, `key.pem`, `package.json`, `server.js`, and `scores.json` are excluded by `.vercelignore`.
- `package.json` is excluded so Vercel does not try to find a Node server entrypoint for the static app.
- `vercel.json` also overrides Vercel settings for this subproject: `framework: null` (`Other`), `buildCommand: null`, and `outputDirectory: "."`.
