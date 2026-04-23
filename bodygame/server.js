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
