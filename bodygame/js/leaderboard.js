/**
 * Move it! Move it! — leaderboard + player profile helpers
 */
;(function () {
  const STORAGE_KEY = 'moveit_profile'

  const COUNTRIES = [
    { code: 'AU', name: 'Australia' },
    { code: 'AT', name: 'Austria' },
    { code: 'BD', name: 'Bangladesh' },
    { code: 'BE', name: 'Belgium' },
    { code: 'BR', name: 'Brazil' },
    { code: 'CA', name: 'Canada' },
    { code: 'CL', name: 'Chile' },
    { code: 'CN', name: 'China' },
    { code: 'CO', name: 'Colombia' },
    { code: 'HR', name: 'Croatia' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'DK', name: 'Denmark' },
    { code: 'EG', name: 'Egypt' },
    { code: 'FI', name: 'Finland' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'GH', name: 'Ghana' },
    { code: 'GR', name: 'Greece' },
    { code: 'HK', name: 'Hong Kong' },
    { code: 'HU', name: 'Hungary' },
    { code: 'IN', name: 'India' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'IE', name: 'Ireland' },
    { code: 'IL', name: 'Israel' },
    { code: 'IT', name: 'Italy' },
    { code: 'JP', name: 'Japan' },
    { code: 'KE', name: 'Kenya' },
    { code: 'KR', name: 'Korea' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'MX', name: 'Mexico' },
    { code: 'MO', name: 'Macau' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'NO', name: 'Norway' },
    { code: 'PK', name: 'Pakistan' },
    { code: 'PH', name: 'Philippines' },
    { code: 'PL', name: 'Poland' },
    { code: 'PT', name: 'Portugal' },
    { code: 'RU', name: 'Russia' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'SG', name: 'Singapore' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'ES', name: 'Spain' },
    { code: 'SE', name: 'Sweden' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'TW', name: 'Taiwan' },
    { code: 'TH', name: 'Thailand' },
    { code: 'TR', name: 'Turkey' },
    { code: 'UA', name: 'Ukraine' },
    { code: 'AE', name: 'UAE' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States' },
    { code: 'VN', name: 'Vietnam' },
  ]

  const TZ_TO_COUNTRY = {
    'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO',
    'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN',
    'Asia/Taipei': 'TW',
    'Asia/Tokyo': 'JP',
    'Asia/Seoul': 'KR',
    'Asia/Singapore': 'SG',
    'Asia/Bangkok': 'TH',
    'Asia/Kuala_Lumpur': 'MY',
    'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID',
    'Asia/Manila': 'PH',
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
    'Asia/Karachi': 'PK',
    'Asia/Dubai': 'AE',
    'Asia/Riyadh': 'SA',
    'Asia/Jerusalem': 'IL',
    'Asia/Beirut': 'LB',
    'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
    'Europe/London': 'GB',
    'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU',
    'Europe/Berlin': 'DE', 'Europe/Vienna': 'AT',
    'Europe/Madrid': 'ES',
    'Europe/Rome': 'IT',
    'Europe/Amsterdam': 'NL',
    'Europe/Zurich': 'CH',
    'Europe/Stockholm': 'SE',
    'Europe/Oslo': 'NO',
    'Europe/Copenhagen': 'DK',
    'Europe/Helsinki': 'FI',
    'Europe/Warsaw': 'PL',
    'Europe/Prague': 'CZ',
    'Europe/Budapest': 'HU',
    'Europe/Bucharest': 'RO',
    'Europe/Athens': 'GR',
    'Europe/Lisbon': 'PT',
    'Europe/Dublin': 'IE',
    'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA',
    'Europe/Moscow': 'RU',
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA',
    'America/Sao_Paulo': 'BR',
    'America/Mexico_City': 'MX',
    'America/Bogota': 'CO',
    'America/Santiago': 'CL',
    'America/Buenos_Aires': 'AR',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
    'Pacific/Auckland': 'NZ',
    'Africa/Cairo': 'EG',
    'Africa/Lagos': 'NG',
    'Africa/Nairobi': 'KE',
    'Africa/Johannesburg': 'ZA',
  }

  function flag(code) {
    if (!code || code.length !== 2) return '🌍'
    const base = 0x1F1E6 - 65
    return String.fromCodePoint(code.codePointAt(0) + base, code.codePointAt(1) + base)
  }

  function detectCountry() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      return TZ_TO_COUNTRY[tz] || ''
    } catch { return '' }
  }

  function getProfile() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || null }
    catch { return null }
  }

  function setProfile(p) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    // Clear old high score storage
    localStorage.removeItem('bodygame_scores')
  }

  function buildModalHTML(suggestedCountry) {
    const opts = COUNTRIES.map(c =>
      `<option value="${c.code}"${c.code === suggestedCountry ? ' selected' : ''}>${flag(c.code)} ${c.name}</option>`
    ).join('')
    return `
<div id="lb-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9999;display:flex;align-items:center;justify-content:center;">
  <div id="lb-modal" style="background:#151c2e;border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:36px 32px;width:min(360px,90vw);text-align:center;font-family:inherit;">
    <div style="font-size:2rem;margin-bottom:4px;">🎮</div>
    <h2 style="margin:0 0 6px;font-size:1.4rem;color:#fff;">Move it! Move it!</h2>
    <p style="margin:0 0 24px;color:#8899bb;font-size:0.9rem;">Enter your name to join the leaderboard</p>
    <div style="text-align:left;margin-bottom:14px;">
      <label style="display:block;font-size:0.82rem;color:#8899bb;margin-bottom:5px;">Player name</label>
      <input id="lb-name-input" maxlength="20" placeholder="Your name"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#fff;font-size:1rem;font-family:inherit;outline:none;">
    </div>
    <div style="text-align:left;margin-bottom:24px;">
      <label style="display:block;font-size:0.82rem;color:#8899bb;margin-bottom:5px;">Country</label>
      <select id="lb-country-select"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:#1e2740;color:#fff;font-size:1rem;font-family:inherit;outline:none;">
        <option value="">— Select country —</option>
        ${opts}
      </select>
    </div>
    <div id="lb-modal-err" style="color:#ff6b6b;font-size:0.82rem;min-height:18px;margin-bottom:10px;"></div>
    <button id="lb-modal-btn"
      style="width:100%;padding:13px;border-radius:10px;border:none;background:linear-gradient(135deg,#6c63ff,#a855f7);color:#fff;font-size:1.05rem;font-weight:700;cursor:pointer;font-family:inherit;">
      Let's Go!
    </button>
  </div>
</div>`
  }

  function promptProfile(allowSkip = false) {
    return new Promise(resolve => {
      const suggested = detectCountry()
      const div = document.createElement('div')
      div.innerHTML = buildModalHTML(suggested)
      document.body.appendChild(div.firstElementChild)

      const bg    = document.getElementById('lb-modal-bg')
      const input = document.getElementById('lb-name-input')
      const sel   = document.getElementById('lb-country-select')
      const btn   = document.getElementById('lb-modal-btn')
      const err   = document.getElementById('lb-modal-err')

      // Pre-fill if partial profile
      const existing = getProfile()
      if (existing?.name)    input.value = existing.name
      if (existing?.country) sel.value   = existing.country

      setTimeout(() => input.focus(), 50)

      btn.addEventListener('click', () => {
        const name    = input.value.trim()
        const country = sel.value
        if (!name || name.length < 1)    { err.textContent = 'Please enter your name.';    return }
        if (name.length > 20)            { err.textContent = 'Name must be 20 chars max.'; return }
        if (!country)                    { err.textContent = 'Please select your country.'; return }
        const profile = { name, country }
        setProfile(profile)
        bg.remove()
        resolve(profile)
      })

      input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click() })
    })
  }

  async function ensureProfile() {
    const p = getProfile()
    if (p?.name && p?.country) return p
    return promptProfile()
  }

  function makeSessionToken() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  }

  async function submitScore(mode, score, meta = {}) {
    const profile = getProfile()
    if (!profile) return { ok: false, error: 'No profile' }
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            profile.name,
          country:         profile.country,
          mode,
          score:           Math.round(score),
          sessionDuration: Math.round(meta.sessionDuration || 0),
          sessionToken:    meta.sessionToken || '',
        }),
      })
      return await res.json()
    } catch (e) { return { ok: false, error: String(e) } }
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard')
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }

  const MODE_LABELS = { 'pose-mirror': 'Pose Mirror', 'bodyware': 'BodyWare' }
  const MODE_ORDER = ['pose-mirror', 'bodyware']

  function renderLeaderboard(container) {
    container.innerHTML = '<div style="text-align:center;color:#8899bb;padding:20px">Loading…</div>'
    fetchLeaderboard().then(data => {
      if (!data) {
        container.innerHTML = '<div style="text-align:center;color:#8899bb;padding:20px">Could not load leaderboard.</div>'
        return
      }
      const byMode = data.byMode || {}

      const gameTabStyle = (active) => `
        padding:10px 18px;border-radius:999px;cursor:pointer;font-size:0.88rem;font-weight:800;
        background:${active ? 'linear-gradient(135deg, rgba(255,215,0,0.26), rgba(255,107,53,0.24))' : 'rgba(255,255,255,0.05)'};
        color:${active ? '#fff4ca' : '#95a6c8'};border:1px solid ${active ? 'rgba(255,215,0,0.34)' : 'rgba(255,255,255,0.08)'};
        font-family:inherit;transition:all 0.15s;`

      const subTabStyle = (active) => `
        padding:7px 14px;border-radius:999px;cursor:pointer;font-size:0.79rem;font-weight:700;
        background:${active ? 'rgba(255,255,255,0.12)' : 'transparent'};
        color:${active ? '#fff' : '#95a6c8'};border:1px solid ${active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'};
        font-family:inherit;transition:all 0.15s;`

      const thStyle = 'padding:8px 12px;text-align:left;color:#8899bb;font-size:0.78rem;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.08);'
      const tdStyle = 'padding:8px 12px;font-size:0.88rem;color:#d7deef;'
      const tdNumStyle = 'padding:8px 12px;font-size:0.88rem;color:#FFD700;font-weight:700;text-align:right;'
      const trStyle = (i) => `background:${i%2===0 ? 'rgba(255,255,255,0.02)' : 'transparent'}`

      const buildCountryTable = (rows) => `
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${thStyle}">#</th>
            <th style="${thStyle}">Country</th>
            <th style="${thStyle};text-align:right;">Total Score</th>
            <th style="${thStyle}">Games</th>
          </tr></thead>
          <tbody>${
            rows.map((r, i) => `
              <tr style="${trStyle(i)}">
                <td style="${tdStyle}">${i+1}</td>
                <td style="${tdStyle}">${flag(r.country)} ${r.country}</td>
                <td style="${tdNumStyle}">${r.total.toLocaleString()}</td>
                <td style="${tdStyle};color:#8899bb;">${r.games}</td>
              </tr>`).join('') || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#8899bb;">No scores yet</td></tr>'
          }</tbody>
        </table>`

      const buildPlayerTable = (rows) => `
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${thStyle}">#</th>
            <th style="${thStyle}">Player</th>
            <th style="${thStyle}">Country</th>
            <th style="${thStyle};text-align:right;">Score</th>
          </tr></thead>
          <tbody>${
            rows.map((r, i) => `
              <tr style="${trStyle(i)}">
                <td style="${tdStyle}">${i+1}</td>
                <td style="${tdStyle}"><strong style="color:#fff">${escHtml(r.name)}</strong></td>
                <td style="${tdStyle}">${flag(r.country)} ${r.country}</td>
                <td style="${tdNumStyle}">${r.score.toLocaleString()}</td>
              </tr>`).join('') || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#8899bb;">No scores yet</td></tr>'
          }</tbody>
        </table>`

      const gameMenus = MODE_ORDER.map((mode, index) =>
        `<button data-mode="${mode}" style="${gameTabStyle(index === 0)}">${MODE_LABELS[mode] || mode}</button>`
      ).join('')

      const gamePanes = MODE_ORDER.map((mode, index) => {
        const modeData = byMode[mode] || { byCountry: [], byPlayer: [] }
        return `
          <section data-mode-pane="${mode}" style="${index === 0 ? '' : 'display:none;'}">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
              <div>
                <div style="font-size:0.74rem;letter-spacing:0.16em;text-transform:uppercase;color:#6f7e9e;margin-bottom:4px;">Game leaderboard</div>
                <div style="font-size:1.15rem;font-weight:800;color:#fff;">${MODE_LABELS[mode] || mode}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button data-subtab="${mode}:countries" style="${subTabStyle(true)}">Countries</button>
                <button data-subtab="${mode}:players" style="${subTabStyle(false)}">Players</button>
              </div>
            </div>
            <div data-subpane="${mode}:countries" style="overflow-x:auto;">${buildCountryTable(modeData.byCountry || [])}</div>
            <div data-subpane="${mode}:players" style="display:none;overflow-x:auto;">${buildPlayerTable(modeData.byPlayer || [])}</div>
          </section>`
      }).join('')

      container.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
          ${gameMenus}
        </div>
        ${gamePanes}
      `

      function activateMode(mode) {
        container.querySelectorAll('[data-mode]').forEach((button) => {
          button.style.cssText = gameTabStyle(button.getAttribute('data-mode') === mode)
        })
        container.querySelectorAll('[data-mode-pane]').forEach((pane) => {
          pane.style.display = pane.getAttribute('data-mode-pane') === mode ? '' : 'none'
        })
      }

      function activateSubtab(mode, tab) {
        container.querySelectorAll(`[data-subtab^="${mode}:"]`).forEach((button) => {
          const key = button.getAttribute('data-subtab').split(':')[1]
          button.style.cssText = subTabStyle(key === tab)
        })
        container.querySelectorAll(`[data-subpane^="${mode}:"]`).forEach((pane) => {
          const key = pane.getAttribute('data-subpane').split(':')[1]
          pane.style.display = key === tab ? '' : 'none'
        })
      }

      container.querySelectorAll('[data-mode]').forEach((button) => {
        button.addEventListener('click', () => activateMode(button.getAttribute('data-mode')))
      })
      container.querySelectorAll('[data-subtab]').forEach((button) => {
        const [mode, tab] = button.getAttribute('data-subtab').split(':')
        button.addEventListener('click', () => activateSubtab(mode, tab))
      })
    })
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  function editProfile() {
    return promptProfile()
  }

  window.LB = { getProfile, setProfile, ensureProfile, promptProfile, editProfile, makeSessionToken, submitScore, fetchLeaderboard, renderLeaderboard, flag, COUNTRIES, detectCountry }
})()
