const { hasSessionToken, pushScore } = require('./_db')

const VALID_COUNTRIES = new Set([
  'AF','AL','DZ','AO','AR','AM','AU','AT','AZ','BH','BD','BY','BE','BO','BA',
  'BR','BN','BG','KH','CM','CA','CL','CN','CO','CR','HR','CU','CY','CZ','DK',
  'DO','EC','EG','EE','ET','FI','FR','GE','DE','GH','GR','GT','HT','HN','HK',
  'HU','IS','IN','ID','IR','IQ','IE','IL','IT','JP','JO','KZ','KE','KW','LA',
  'LV','LB','LY','LT','MO','MY','MV','MX','MD','MN','MA','MM','NA','NP','NL',
  'NZ','NG','NO','OM','PK','PA','PY','PE','PH','PL','PT','QA','RO','RU','SA',
  'SN','RS','SG','SK','SI','ZA','KR','ES','LK','SE','CH','SY','TW','TH','TN',
  'TR','UG','UA','AE','GB','US','UY','VE','VN','ZM','ZW',
])

const SCORE_LIMITS = {
  'pose-mirror': { max: 5000, minDuration: 28000 },
  'bodyware':    { max: 500,  minDuration: 10000 },
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk; if (body.length > 8000) reject(new Error('Body too large')) })
    req.on('end', () => { try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON')) } })
    req.on('error', reject)
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).end(); return }

  try {
    const body = await parseBody(req)
    const { name, country, mode, score, sessionDuration, sessionToken } = body

    const errors = []
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 20)
      errors.push('Invalid name')
    if (!VALID_COUNTRIES.has(country))
      errors.push('Invalid country')
    if (!SCORE_LIMITS[mode])
      errors.push('Invalid mode')
    const limits = SCORE_LIMITS[mode] || {}
    if (typeof score !== 'number' || score < 0 || score > limits.max)
      errors.push('Score out of range')
    if (typeof sessionDuration !== 'number' || sessionDuration < limits.minDuration)
      errors.push('Session too short')

    if (errors.length) {
      res.status(400).json({ error: errors.join(', ') })
      return
    }

    // Deduplicate by sessionToken
    if (sessionToken) {
      if (await hasSessionToken(sessionToken)) {
        res.status(409).json({ error: 'Already submitted' })
        return
      }
    }

    const entry = {
      id:            Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name:          name.trim().slice(0, 20),
      country,
      mode,
      score:         Math.round(score),
      sessionToken:  sessionToken || null,
      submittedAt:   new Date().toISOString(),
    }

    await pushScore(entry)
    res.status(200).json({ ok: true, id: entry.id })
  } catch (e) {
    if (e && e.code === '23505') {
      res.status(409).json({ error: 'Already submitted' })
      return
    }
    res.status(500).json({ error: String(e) })
  }
}
