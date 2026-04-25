/**
 * Minimal HTTPS static file server for BodyGame
 * Serves the current directory on https://localhost:8443
 *
 * Usage: node server.js
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

const PORT = 8443
const ROOT = __dirname

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.woff2': 'font/woff2',
}

const opts = {
  key:  fs.readFileSync(path.join(__dirname, 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
}

// ── Leaderboard helpers ────────────────────────────────────────────────────────

const SCORES_FILE = path.join(__dirname, 'scores.json')
const FEEDBACK_FILE = path.join(__dirname, 'feedback.json')

const VALID_COUNTRIES = new Set([
  'AF','AL','DZ','AO','AR','AM','AU','AT','AZ','BH','BD','BY','BE','BO','BA',
  'BR','BN','BG','KH','CM','CA','CL','CN','CO','CR','HR','CU','CY','CZ','DK',
  'DO','EC','EG','EE','ET','FI','FR','GE','DE','GH','GR','GT','HT','HN','HK',
  'HU','IS','IN','ID','IR','IQ','IE','IL','IT','JP','JO','KZ','KE','KW','LA',
  'LV','LB','LY','LT','MO','MY','MV','MX','MD','MN','MA','MM','NA','NP','NL',
  'NZ','NG','NO','OM','PK','PA','PY','PE','PH','PL','PT','QA','RO','RU','SA',
  'SN','RS','SG','SK','SI','ZA','KR','ES','LK','SE','CH','SY','TW','TH','TN',
  'TR','UG','UA','AE','GB','US','UY','VE','VN','ZM','ZW'
])

const SCORE_LIMITS = {
  'pose-mirror': { max: 5000, minDuration: 28000 },
  'bodyware':    { max: 500,  minDuration: 10000 },
}

function loadScoreData() {
  try { return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')) }
  catch { return { scores: [] } }
}

function saveScoreData(data) {
  if (data.scores.length > 2000) data.scores = data.scores.slice(-2000)
  fs.writeFileSync(SCORES_FILE, JSON.stringify(data))
}

function loadFeedbackData() {
  try { return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8')) }
  catch { return { feedback: [] } }
}

function saveFeedbackData(data) {
  if (data.feedback.length > 5000) data.feedback = data.feedback.slice(-5000)
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(data))
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function renderFeedbackAdminPage(entries) {
  const rows = entries.map((entry, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(entry.page || '-')}</td>
      <td>${escapeHtml(entry.name || 'Anonymous')}</td>
      <td class="content-cell">${escapeHtml(entry.content)}</td>
      <td>${escapeHtml(entry.submittedAt || '-')}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback Admin</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a1226;
      --panel: rgba(17, 26, 49, 0.94);
      --line: rgba(255,255,255,0.12);
      --muted: #90a2c7;
      --text: #f3f7ff;
      --accent: #6ee7ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 32px;
      background:
        radial-gradient(circle at top left, rgba(110,231,255,0.16), transparent 28%),
        radial-gradient(circle at top right, rgba(255,141,107,0.15), transparent 24%),
        linear-gradient(180deg, #0b1020 0%, var(--bg) 100%);
      color: var(--text);
      font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
    }
    .shell {
      max-width: 1280px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 4vw, 42px);
    }
    .meta {
      color: var(--muted);
      margin-bottom: 24px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 18px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.35);
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 860px;
    }
    th, td {
      text-align: left;
      padding: 14px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      font-size: 14px;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    td { color: var(--text); }
    .content-cell {
      white-space: pre-wrap;
      min-width: 320px;
    }
    .empty {
      padding: 48px 24px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 18px;
    }
    a {
      color: var(--accent);
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main class="shell">
    <h1>Feedback Admin</h1>
    <div class="meta">${entries.length} feedback entr${entries.length === 1 ? 'y' : 'ies'} · <a href="/">Back to site</a></div>
    ${entries.length ? `
      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Page</th>
              <th>Name</th>
              <th>Content</th>
              <th>Submitted At</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    ` : `
      <div class="empty">No feedback yet.</div>
    `}
  </main>
</body>
</html>`
}

function buildLeaderboard(scores) {
  const countryMap = {}
  const playerMap = {}
  const modeCountryMaps = {}
  const modePlayerMaps = {}
  for (const e of scores) {
    const ck = e.country
    if (!countryMap[ck]) countryMap[ck] = { country: ck, total: 0, games: 0 }
    countryMap[ck].total += e.score
    countryMap[ck].games++
    const pk = `${e.name}|||${e.mode}`
    if (!playerMap[pk] || e.score > playerMap[pk].score) {
      playerMap[pk] = { name: e.name, country: e.country, mode: e.mode, score: e.score }
    }

    if (!modeCountryMaps[e.mode]) modeCountryMaps[e.mode] = {}
    if (!modePlayerMaps[e.mode]) modePlayerMaps[e.mode] = {}

    if (!modeCountryMaps[e.mode][ck]) modeCountryMaps[e.mode][ck] = { country: ck, total: 0, games: 0 }
    modeCountryMaps[e.mode][ck].total += e.score
    modeCountryMaps[e.mode][ck].games++

    const modePk = `${e.name}|||${e.country}`
    if (!modePlayerMaps[e.mode][modePk] || e.score > modePlayerMaps[e.mode][modePk].score) {
      modePlayerMaps[e.mode][modePk] = { name: e.name, country: e.country, mode: e.mode, score: e.score }
    }
  }

  const byMode = Object.fromEntries(
    Object.keys(modeCountryMaps).map((mode) => [
      mode,
      {
        byCountry: Object.values(modeCountryMaps[mode]).sort((a,b) => b.total - a.total).slice(0, 50),
        byPlayer: Object.values(modePlayerMaps[mode] || {}).sort((a,b) => b.score - a.score).slice(0, 100),
      },
    ])
  )

  return {
    byCountry: Object.values(countryMap).sort((a,b) => b.total - a.total).slice(0, 50),
    byPlayer:  Object.values(playerMap).sort((a,b) => b.score - a.score).slice(0, 100),
    byMode,
  }
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk; if (body.length > 8000) reject(new Error('Body too large')) })
    req.on('end', () => { try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON')) } })
    req.on('error', reject)
  })
}

// ── Request handler ────────────────────────────────────────────────────────────

const server = https.createServer(opts, async (req, res) => {
  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const urlPath = req.url.split('?')[0]

  // ── API: GET /api/leaderboard ──────────────────────────────────────────────
  if (urlPath === '/api/leaderboard' && req.method === 'GET') {
    const data = loadScoreData()
    const board = buildLeaderboard(data.scores)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(board))
    return
  }

  // ── API: POST /api/score ───────────────────────────────────────────────────
  if (urlPath === '/api/score' && req.method === 'POST') {
    let body
    try {
      body = await parseBody(req)
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
      return
    }

    // Validate name
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length < 1 || name.length > 20) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid name' }))
      return
    }

    // Validate country
    if (!VALID_COUNTRIES.has(body.country)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid country' }))
      return
    }

    // Validate mode
    if (!SCORE_LIMITS[body.mode]) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid mode' }))
      return
    }

    const limits = SCORE_LIMITS[body.mode]

    // Validate score
    if (typeof body.score !== 'number' || body.score < 0 || body.score > limits.max) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid score' }))
      return
    }

    // Validate sessionDuration (only enforce if provided)
    if (typeof body.sessionDuration === 'number' && body.sessionDuration < limits.minDuration) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Session too short' }))
      return
    }

    // Deduplication: only check if a non-empty token was provided
    const token = typeof body.sessionToken === 'string' ? body.sessionToken : ''
    const data = loadScoreData()
    if (token && data.scores.some(s => s.sessionToken === token)) {
      res.writeHead(409, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Already submitted' }))
      return
    }

    // Save entry
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    data.scores.push({
      id,
      name,
      country: body.country,
      mode: body.mode,
      score: Math.round(body.score),
      sessionToken: body.sessionToken,
      submittedAt: new Date().toISOString(),
    })
    saveScoreData(data)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, id }))
    return
  }

  // ── API: POST /api/feedback ───────────────────────────────────────────────
  if (urlPath === '/api/feedback' && req.method === 'POST') {
    let body
    try {
      body = await parseBody(req)
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
      return
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const page = typeof body.page === 'string' ? body.page.trim().slice(0, 120) : ''

    if (name.length > 60) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Name too long' }))
      return
    }

    if (!content) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Feedback content is required' }))
      return
    }

    if (content.length > 3000) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Feedback too long' }))
      return
    }

    const data = loadFeedbackData()
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    data.feedback.push({
      id,
      page,
      name,
      content,
      submittedAt: new Date().toISOString(),
    })
    saveFeedbackData(data)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, id }))
    return
  }

  // ── Admin: GET /admin/feedback ────────────────────────────────────────────
  if (urlPath === '/admin/feedback' && req.method === 'GET') {
    const data = loadFeedbackData()
    const entries = [...(data.feedback || [])].reverse()
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(renderFeedbackAdminPage(entries))
    return
  }

  // ── Static file serving ────────────────────────────────────────────────────

  let staticPath = urlPath
  if (staticPath === '/') staticPath = '/index.html'

  // Security: prevent path traversal
  const safePath = path.normalize(staticPath).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(ROOT, safePath)

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found: ' + safePath)
      return
    }
    const ext  = path.extname(filePath).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
      // COOP allows popups to be isolated; COEP omitted intentionally —
      // require-corp would block MediaPipe's cross-origin WASM fetches from jsDelivr
      'Cross-Origin-Opener-Policy': 'same-origin',
    })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`\n  BodyGame HTTPS server running`)
  console.log(`  → https://localhost:${PORT}\n`)
  console.log(`  If you see a browser security warning, click "Advanced" → "Proceed to localhost"`)
  console.log(`  (Self-signed cert — safe for local development)\n`)
})
