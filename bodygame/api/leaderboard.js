const { getAllScores } = require('./_redis')

function buildLeaderboard(scores) {
  const countryMap = {}
  const playerMap  = {}
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
        byCountry: Object.values(modeCountryMaps[mode]).sort((a, b) => b.total - a.total).slice(0, 50),
        byPlayer: Object.values(modePlayerMaps[mode] || {}).sort((a, b) => b.score - a.score).slice(0, 100),
      },
    ])
  )

  return {
    byCountry: Object.values(countryMap).sort((a, b) => b.total - a.total).slice(0, 50),
    byPlayer:  Object.values(playerMap).sort((a, b) => b.score - a.score).slice(0, 100),
    byMode,
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'GET')    { res.status(405).end(); return }

  try {
    const scores = await getAllScores()
    res.status(200).json(buildLeaderboard(scores))
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
}
