/**
 * Shared UI helpers
 */

const LANG = 'en'
function t(textObj) { return textObj[LANG] || textObj.en }

// ── Score popup ────────────────────────────────────────────────────────────────

const _popups = []

function scorePopup(canvas, score, x, y, color = '#FFD700') {
  _popups.push({ canvas, text: (score >= 0 ? '+' : '') + score, x, y, color, alpha: 1, vy: -1.5, age: 0 })
}

function updatePopups(dt) {
  for (let i = _popups.length - 1; i >= 0; i--) {
    const p = _popups[i]
    p.age += dt
    p.y += p.vy
    p.alpha = Math.max(0, 1 - p.age / 1000)
    if (p.alpha <= 0) _popups.splice(i, 1)
  }
}

function drawPopups() {
  for (const p of _popups) {
    const ctx = p.canvas.getContext('2d')
    ctx.save()
    ctx.globalAlpha = p.alpha
    ctx.font = 'bold 36px sans-serif'
    ctx.fillStyle = p.color
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 3
    ctx.textAlign = 'center'
    ctx.strokeText(p.text, p.x, p.y)
    ctx.fillText(p.text, p.x, p.y)
    ctx.restore()
  }
}

// ── Countdown bar ──────────────────────────────────────────────────────────────

function drawCountdownBar(ctx, remainingMs, totalMs, width, y, height = 18) {
  const ratio = Math.max(0, remainingMs / totalMs)
  const flash = remainingMs < 1000 && Math.floor(Date.now() / 200) % 2 === 0

  // Background
  ctx.save()
  ctx.fillStyle = '#333'
  ctx.fillRect(0, y, width, height)

  // Fill
  const r = Math.round(255 * (1 - ratio))
  const g = Math.round(255 * ratio)
  const barColor = flash ? '#ff2222' : `rgb(${r},${g},0)`
  ctx.fillStyle = barColor
  ctx.fillRect(0, y, width * ratio, height)

  // Time text
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${height - 2}px monospace`
  ctx.textAlign = 'right'
  ctx.fillText((remainingMs / 1000).toFixed(1) + 's', width - 6, y + height - 3)

  ctx.restore()
}

// ── WIN / FAIL overlay ─────────────────────────────────────────────────────────

const _overlayState = { active: false, result: null, alpha: 0, timer: 0, duration: 800 }
const _domUI = {
  root: null,
  mode: null,
  refs: {},
}
let _calibrationOverlay = null

function _ensureDomUI(canvas, mode) {
  if (_domUI.root && _domUI.mode === mode) return _domUI
  clearGameUI()

  const parent = canvas.parentElement || document.body
  const root = document.createElement('div')
  root.className = `game-ui-layer ${mode}`

  if (mode === 'pose-mirror') {
    root.innerHTML = `
      <div class="ui-topbar ui-topbar--pose-mirror">
        <div class="ui-chip ui-chip--round" data-ref="round"></div>
      </div>
      <div class="ui-chip ui-chip--score" data-ref="score"></div>
      <div class="ui-combo" data-ref="combo"></div>
      <div class="ui-center-card" data-ref="centerCard"></div>
      <div class="ui-score-meter" data-ref="scoreMeterWrap"><div class="ui-score-meter__head"><div class="label">Live Match</div></div><div class="meter"><div class="fill" data-ref="scoreMeterFill"></div></div><div class="value" data-ref="scoreMeterValue"></div></div>
      <div class="ui-paused" data-ref="pausedCard"></div>
      <div class="ui-timer-wrap"><div class="ui-timer-fill" data-ref="timerFill"></div><div class="ui-timer-text" data-ref="timerText"></div></div>
    `
  } else if (mode === 'bodyware') {
    root.innerHTML = `
      <div class="ui-topbar ui-topbar--bodyware">
        <div class="ui-chip" data-ref="lives"></div>
        <div class="ui-chip" data-ref="games"></div>
      </div>
      <div class="ui-instruction" data-ref="instruction"></div>
      <div class="ui-subinstruction" data-ref="subinstruction"></div>
      <div class="ui-status" data-ref="status"></div>
      <div class="ui-warning" data-ref="warning"></div>
      <div class="ui-timer-wrap"><div class="ui-timer-fill" data-ref="timerFill"></div><div class="ui-timer-text" data-ref="timerText"></div></div>
    `
  }

  parent.appendChild(root)
  _domUI.root = root
  _domUI.mode = mode
  _domUI.refs = {}
  root.querySelectorAll('[data-ref]').forEach(el => {
    _domUI.refs[el.getAttribute('data-ref')] = el
  })
  return _domUI
}

function _setText(ref, value) {
  const el = _domUI.refs[ref]
  if (!el) return
  el.textContent = value
}

function _setVisible(ref, visible) {
  const el = _domUI.refs[ref]
  if (!el) return
  el.style.display = visible ? '' : 'none'
}

function _setTimerFillRatio(ratio) {
  const fill = _domUI.refs.timerFill
  if (!fill) return

  const prevRatio = Number.parseFloat(fill.dataset.ratio || '0')
  const shouldHardReset = ratio > prevRatio + 0.35

  if (shouldHardReset) {
    const prevTransition = fill.style.transition
    fill.style.transition = 'none'
    fill.style.width = `${ratio * 100}%`
    fill.dataset.ratio = String(ratio)
    void fill.offsetWidth
    fill.style.transition = prevTransition
    return
  }

  fill.style.width = `${ratio * 100}%`
  fill.dataset.ratio = String(ratio)
}

function showResult(canvas, result, duration = 800) {
  _overlayState.active = true
  _overlayState.result = result
  _overlayState.alpha = 0.85
  _overlayState.timer = duration
  _overlayState.duration = duration
}

function updateOverlay(dt) {
  if (!_overlayState.active) return
  _overlayState.timer -= dt
  _overlayState.alpha = Math.max(0, (_overlayState.timer / _overlayState.duration) * 0.85)
  if (_overlayState.timer <= 0) _overlayState.active = false
}

function clearOverlay() {
  _overlayState.active = false
  _overlayState.timer = 0
  _overlayState.alpha = 0
}

function drawOverlay(ctx) {
  if (!_overlayState.active) return
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  const isWin = _overlayState.result === 'win'

  ctx.save()
  ctx.globalAlpha = _overlayState.alpha
  ctx.fillStyle = isWin ? 'rgba(0,200,80,0.7)' : 'rgba(220,30,30,0.7)'
  ctx.fillRect(0, 0, cw, ch)

  ctx.globalAlpha = Math.min(1, _overlayState.alpha * 2)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(8, ch * 0.018)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (isWin) {
    ctx.moveTo(cw * 0.42, ch * 0.52)
    ctx.lineTo(cw * 0.48, ch * 0.6)
    ctx.lineTo(cw * 0.6, ch * 0.42)
  } else {
    ctx.moveTo(cw * 0.43, ch * 0.43)
    ctx.lineTo(cw * 0.57, ch * 0.57)
    ctx.moveTo(cw * 0.57, ch * 0.43)
    ctx.lineTo(cw * 0.43, ch * 0.57)
  }
  ctx.stroke()
  ctx.restore()
}

// ── Lives display ──────────────────────────────────────────────────────────────

function drawLives(ctx, current, max, x, y, size = 28) {
  ctx.save()
  ctx.font = `${size}px sans-serif`
  for (let i = 0; i < max; i++) {
    ctx.globalAlpha = i < current ? 1 : 0.25
    ctx.fillText('♥', x + i * (size + 4), y)
  }
  ctx.restore()
}

// ── Calibration UI ─────────────────────────────────────────────────────────────

async function runCalibrationUI(canvas, engine) {
  // Hide the game UI layer — it exists but has no content yet during calibration
  if (_domUI.root) _domUI.root.style.visibility = 'hidden'

  const ctx = canvas.getContext('2d')
  const parent = canvas.parentElement || document.body
  const overlay = document.createElement('div')
  overlay.className = 'calibration-overlay'
  overlay.innerHTML = `
    <div class="calibration-card">
      <div class="calibration-title">Stand straight, arms at sides</div>
      <div class="calibration-count" data-count></div>
    </div>
  `
  parent.appendChild(overlay)
  _calibrationOverlay = overlay
  const countEl = overlay.querySelector('[data-count]')

  // Wait for pose to appear (polls every 200ms, gives up after 6s)
  await new Promise((resolve) => {
    const check = () => engine.getKeypoints() ? resolve() : setTimeout(check, 200)
    setTimeout(check, 200)
    setTimeout(resolve, 6000)
  })

  // Start collecting calibration samples immediately — runs in parallel with countdown.
  // calibrate(3000) listens on the 'frame' event for 3s, so it works concurrently.
  const calibratePromise = engine.calibrate(3000)

  // 3-second countdown drawn via requestAnimationFrame — no busy-wait
  await new Promise((resolve) => {
    const DURATION = 3000
    const start = performance.now()

    function frame() {
      const elapsed = performance.now() - start
      if (elapsed >= DURATION) {
        resolve()
        return
      }

      const cw = canvas.width, ch = canvas.height
      const remaining = DURATION - elapsed
      const digit = Math.ceil(remaining / 1000)

      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(engine.video, -cw, 0, cw, ch)
      ctx.restore()
      engine.drawPlayerWithOutline(ctx)
      engine.drawPlayerStar(ctx)

      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, cw, ch)
      ctx.restore()
      const tickProgress = (remaining % 1000) / 1000
      const scale = 0.7 + tickProgress * 0.5
      if (countEl) {
        countEl.textContent = String(digit)
        countEl.style.transform = `scale(${scale})`
      }
      requestAnimationFrame(frame)
    }

    requestAnimationFrame(frame)
  })

  // Calibration was running during the countdown; just await the result.
  // If somehow it's not done yet, this waits the remaining few ms.
  const baseline = await calibratePromise
  if (_calibrationOverlay?.parentElement) {
    _calibrationOverlay.parentElement.removeChild(_calibrationOverlay)
  }
  _calibrationOverlay = null

  // Restore game UI now that it will be populated
  if (_domUI.root) _domUI.root.style.visibility = ''

  return baseline
}

// ── HUD helpers ────────────────────────────────────────────────────────────────

function drawHUD(ctx, left, right, barY) {
  const cw = ctx.canvas.width
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, cw, barY)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(left, 12, barY / 2)
  ctx.textAlign = 'right'
  ctx.fillText(right, cw - 12, barY / 2)
  ctx.restore()
}

// ── "Pose lost" warning ────────────────────────────────────────────────────────

function drawPoseLostWarning(ctx) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, cw, ch)
  ctx.fillStyle = '#ff4444'
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Make sure your full body is visible', cw / 2, ch / 2)
  ctx.restore()
}

function initGameUI(canvas, mode) {
  _ensureDomUI(canvas, mode)
}

function updatePoseMirrorHUD(data) {
  if (_domUI.mode !== 'pose-mirror') return

  _setText('round', data.roundLabel || `Round ${data.round}/${data.totalRounds}`)
  _setText('score', `Score: ${data.totalScore}`)

  const comboOn = data.combo > 1
  _setVisible('combo', comboOn)
  if (comboOn) _setText('combo', `Combo x${data.combo}`)

  const centerEl = _domUI.refs.centerCard
  if (centerEl) {
    if (data.poseName) {
      centerEl.style.display = ''
      centerEl.innerHTML = `<div class="title">${data.poseName}</div><div class="subtitle">${data.poseSubtitle || 'Copy this pose!'}</div>`
    } else {
      centerEl.style.display = 'none'
    }
  }

  const pausedEl = _domUI.refs.pausedCard
  if (pausedEl) {
    const showPauseCard = data.paused && !data.useGuideOverlay
    if (showPauseCard) {
      pausedEl.style.display = ''
      pausedEl.innerHTML = `<div class="title">${data.pauseTitle || 'PAUSED'}</div><div class="subtitle">${data.pauseMessage || 'Full body not detected<br>Step back so your whole body is visible'}</div>`
    } else {
      pausedEl.style.display = 'none'
    }
  }

  const showTimer = data.state === 'PREVIEW' || data.state === 'HOLD' || data.state === 'BONUS'
  const timerWrap = _domUI.root?.querySelector('.ui-timer-wrap')
  if (timerWrap) timerWrap.style.display = showTimer && !data.paused ? '' : 'none'
  if (showTimer && !data.paused) {
    const ratio = Math.max(0, Math.min(1, data.timer / data.timerTotal))
    _setTimerFillRatio(ratio)
    _setText('timerText', `${(data.timer / 1000).toFixed(1)}s`)
  }

  const scoreWrap = _domUI.refs.scoreMeterWrap
  const showMeter = (data.state === 'PREVIEW' || data.state === 'HOLD' || data.state === 'BONUS') && Number.isFinite(data.liveScore)
  if (scoreWrap) scoreWrap.style.display = showMeter ? '' : 'none'
  if (showMeter) {
    const ratio = Math.max(0, Math.min(1, data.liveScore / 100))
    if (_domUI.refs.scoreMeterFill) _domUI.refs.scoreMeterFill.style.width = `${ratio * 100}%`
    _setText('scoreMeterValue', `${Math.round(data.liveScore)}%`)
  }
}

function updateBodyWareHUD(data) {
  if (_domUI.mode !== 'bodyware') return

  _setText('lives', `Lives: ${'♥'.repeat(Math.max(0, data.lives))}`)
  _setText('games', `Games: ${data.gamesPlayed}`)

  const instruction = _domUI.refs.instruction
  if (instruction) {
    if (data.state === 'FLASH' || data.state === 'ACTIVE') {
      instruction.style.display = ''
      instruction.textContent = data.instruction || ''
    } else {
      instruction.style.display = 'none'
    }
  }

  const subinstruction = _domUI.refs.subinstruction
  if (subinstruction) {
    if ((data.state === 'FLASH' || data.state === 'ACTIVE') && data.hint) {
      subinstruction.style.display = ''
      subinstruction.textContent = data.hint
    } else {
      subinstruction.style.display = 'none'
    }
  }

  const status = _domUI.refs.status
  if (status) {
    if (data.status) {
      status.style.display = ''
      status.textContent = data.status
      status.dataset.result = data.statusKind || ''
    } else {
      status.style.display = 'none'
      status.textContent = ''
      status.dataset.result = ''
    }
  }

  const warning = _domUI.refs.warning
  if (warning) {
    warning.style.display = data.poseDetected ? 'none' : ''
    warning.textContent = data.poseDetected ? '' : 'Make sure your full body is visible'
  }

  const showTimer = data.state === 'ACTIVE'
  const timerWrap = _domUI.root?.querySelector('.ui-timer-wrap')
  if (timerWrap) timerWrap.style.display = showTimer ? '' : 'none'
  if (showTimer && data.timerTotal > 0) {
    const ratio = Math.max(0, Math.min(1, data.timer / data.timerTotal))
    _setTimerFillRatio(ratio)
    _setText('timerText', `${(data.timer / 1000).toFixed(1)}s`)
  }
}

function clearGameUI() {
  if (_domUI.root && _domUI.root.parentElement) {
    _domUI.root.parentElement.removeChild(_domUI.root)
  }
  _domUI.root = null
  _domUI.mode = null
  _domUI.refs = {}
}

// ── Confetti ───────────────────────────────────────────────────────────────────

function triggerConfetti() {
  const cvs = document.createElement('canvas')
  cvs.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:10000;'
  cvs.width  = window.innerWidth
  cvs.height = window.innerHeight
  document.body.appendChild(cvs)
  const ctx = cvs.getContext('2d')

  const COLORS = ['#ff6b6b','#ffd700','#7cff6b','#6bbbff','#c46bff','#ff9f43','#6bffe8','#ff6bbd','#fff06b']
  const isMobile = window.innerWidth < 768 || navigator.maxTouchPoints > 1
  const N = isMobile ? 60 : 180
  const particles = Array.from({ length: N }, () => ({
    x:    Math.random() * cvs.width,
    y:    -20 - Math.random() * cvs.height * 0.4,
    vx:   (Math.random() - 0.5) * 2.5,
    vy:   3 + Math.random() * 4.5,
    w:    7 + Math.random() * 9,
    h:    4 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot:  Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.18,
  }))

  ;(function frame() {
    ctx.clearRect(0, 0, cvs.width, cvs.height)

    for (const p of particles) {
      p.x   += p.vx
      p.y   += p.vy
      p.rot += p.rotV
      if (p.y > cvs.height + 30) {
        p.y = -20
        p.x = Math.random() * cvs.width
      }
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }

    requestAnimationFrame(frame)
  })()
}

// ── Expose ─────────────────────────────────────────────────────────────────────

window.UI = {
  t, LANG,
  scorePopup, updatePopups, drawPopups,
  drawCountdownBar,
  showResult, updateOverlay, drawOverlay,
  clearOverlay,
  drawLives,
  runCalibrationUI,
  drawHUD,
  drawPoseLostWarning,
  initGameUI,
  updatePoseMirrorHUD,
  updateBodyWareHUD,
  clearGameUI,
  triggerConfetti,
}
