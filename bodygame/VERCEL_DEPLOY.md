# Vercel Deploy

Deploy this app with the Vercel project root set to `bodygame/`.

## Required env vars

- `DATABASE_URL` - Render Postgres external database URL

## Deploy settings

- Framework Preset: `Other`
- Root Directory: `bodygame`
- Build Command: leave empty
- Output Directory: leave empty

## Notes

- Static pages are served directly from this folder.
- Serverless API routes live in `api/`.
- Local-only files such as `cert.pem`, `key.pem`, `server.js`, and `scores.json` are excluded by `.vercelignore`.
- `vercel.json` also overrides Vercel settings for this subproject: `framework: null` (`Other`), `buildCommand: null`, and `outputDirectory: "."`.
- `package.json` is deployed because Vercel Functions need the `pg` package to connect to Render Postgres.

## Render Postgres

1. Create a Render Postgres database.
2. Copy its external database URL.
3. Add that URL to this Vercel project as `DATABASE_URL`.
4. Redeploy the Vercel project.

The API creates the `scores` table automatically on first request.
