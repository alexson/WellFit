const { Pool } = require('pg')

const MAX_SCORES = 2000

let pool
let schemaReady

function getPool() {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('Missing DATABASE_URL env var')

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString)
  pool = new Pool({
    connectionString,
    max: 1,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  })

  return pool
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS scores (
        id TEXT PRIMARY KEY,
        name VARCHAR(20) NOT NULL,
        country CHAR(2) NOT NULL,
        mode TEXT NOT NULL,
        score INTEGER NOT NULL,
        session_token TEXT,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS scores_session_token_idx
        ON scores (session_token)
        WHERE session_token IS NOT NULL AND session_token <> '';
    `)
  }

  return schemaReady
}

async function hasSessionToken(sessionToken) {
  if (!sessionToken) return false
  await ensureSchema()
  const result = await getPool().query(
    'SELECT 1 FROM scores WHERE session_token = $1 LIMIT 1',
    [sessionToken]
  )
  return result.rowCount > 0
}

async function pushScore(entry) {
  await ensureSchema()
  await getPool().query(
    `
      INSERT INTO scores (id, name, country, mode, score, session_token, submitted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      entry.id,
      entry.name,
      entry.country,
      entry.mode,
      entry.score,
      entry.sessionToken || null,
      entry.submittedAt,
    ]
  )
}

async function getAllScores() {
  await ensureSchema()
  const result = await getPool().query(
    `
      SELECT id, name, country, mode, score, session_token, submitted_at
      FROM scores
      ORDER BY submitted_at DESC
      LIMIT $1
    `,
    [MAX_SCORES]
  )

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    country: row.country,
    mode: row.mode,
    score: Number(row.score),
    sessionToken: row.session_token,
    submittedAt: row.submitted_at instanceof Date
      ? row.submitted_at.toISOString()
      : row.submitted_at,
  }))
}

module.exports = { getAllScores, hasSessionToken, pushScore }
