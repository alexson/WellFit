/**
 * Upstash Redis HTTP helper — works in Vercel serverless (Node 18+).
 * Requires env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

const SCORES_KEY = 'moveit:scores'
const MAX_SCORES = 2000

async function redisCmd(command, ...args) {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([command, ...args]),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.result
}

async function redisPipeline(...commands) {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Missing Redis env vars')
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  return await res.json()
}

async function pushScore(entry) {
  await redisPipeline(
    ['LPUSH', SCORES_KEY, JSON.stringify(entry)],
    ['LTRIM', SCORES_KEY, 0, MAX_SCORES - 1],
  )
}

async function getAllScores() {
  const raw = await redisCmd('LRANGE', SCORES_KEY, 0, MAX_SCORES - 1)
  if (!Array.isArray(raw)) return []
  return raw.map(s => { try { return JSON.parse(s) } catch { return null } }).filter(Boolean)
}

module.exports = { pushScore, getAllScores }
