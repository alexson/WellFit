/**
 * BodyWare — WarioWare-style microgame runner
 * States: CALIBRATE → FLASH → ACTIVE → RESULT → GAME_OVER
 */

const BW_CONFIG = {
  LIVES: 3,
  FLASH_MS: 1200,
  BASE_TIME_MS: 5000,
  TIME_REDUCTION: 200,
  MIN_TIME_MS: 2000,
  SPEED_UP_EVERY: 5,
  WIN_DISPLAY_MS: 800,
  FAIL_DISPLAY_MS: 900,
}

const BW_LEG_GAMES = new Set(['duck', 'balance'])

// ── Scene renderers ────────────────────────────────────────────────────────────

const SCENES = {

  duck(ctx, progress, cw, ch) {
    // Flying obstacle coming from right
    const x = cw * (1 - progress) - 40
    const y = ch * 0.3
    ctx.save()
    ctx.fillStyle = '#ff6b35'
    ctx.beginPath()
    ctx.ellipse(x, y, 60, 25, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x - 12, y - 14)
    ctx.lineTo(x + 2, y - 2)
    ctx.lineTo(x - 4, y - 2)
    ctx.lineTo(x + 10, y + 14)
    ctx.stroke()
    ctx.restore()
  },

  pull(ctx, progress, cw, ch, game) {
    const mg = game?._currentMicrogame
    const top = mg?._topDot || { x: 0.5, y: 0.2 }
    const bottom = mg?._bottomDot || { x: 0.5, y: 0.56 }
    const reachedTop = mg?._phase === 'pull'
    const activeHand = mg?._activeHand || null
    const topX = cw * top.x
    const topY = ch * top.y
    const bottomX = cw * bottom.x
    const bottomY = ch * bottom.y

    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.88)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(topX, topY)
    ctx.lineTo(bottomX, bottomY)
    ctx.stroke()

    ctx.fillStyle = reachedTop ? '#60f59d' : '#7ee0ff'
    ctx.beginPath()
    ctx.arc(topX, topY, 15, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ffd66b'
    ctx.beginPath()
    ctx.arc(bottomX, bottomY, 15, 0, Math.PI * 2)
    ctx.fill()

    const sideOffset = 26
    const arrowX = bottomX + sideOffset
    const arrowTopY = topY + 10
    const arrowBottomY = bottomY - 12
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowTopY)
    ctx.lineTo(arrowX, arrowBottomY)
    ctx.stroke()
    ctx.fillStyle = '#ffd700'
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowBottomY + 14)
    ctx.lineTo(arrowX - 10, arrowBottomY - 2)
    ctx.lineTo(arrowX + 10, arrowBottomY - 2)
    ctx.closePath()
    ctx.fill()

    if (activeHand) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(activeHand === 'left' ? 'LEFT HAND' : 'RIGHT HAND', topX, topY - 18)
    }
    ctx.restore()
  },

  balance(ctx, progress, cw, ch) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,215,0,0.8)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cw / 2, ch * 0.46, Math.min(cw, ch) * 0.16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.arc(cw / 2, ch * 0.3, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(cw / 2, ch * 0.29)
    ctx.lineTo(cw / 2 + 10, ch * 0.34)
    ctx.lineTo(cw / 2 - 6, ch * 0.39)
    ctx.stroke()
    ctx.restore()
  },

  punch(ctx, progress, cw, ch) {
    // Targets are drawn by _drawPunchTarget based on current microgame state
  },

  slash(ctx, progress, cw, ch, game) {
    const dir = game?._currentMicrogame?._direction || 'uldr'
    const vectors = {
      urdl: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
      uldr: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    }
    const v = vectors[dir] || vectors.uldr
    const cx = cw * 0.52
    const cy = ch * 0.4
    const halfLen = Math.min(cw, ch) * 0.19
    const sx = cx - v.x * halfLen
    const sy = cy - v.y * halfLen
    const ex = cx + v.x * halfLen
    const ey = cy + v.y * halfLen

    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,70,70,0.78)'
    ctx.lineWidth = 4
    ctx.setLineDash([12, 10])
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.stroke()

    ctx.setLineDash([])
    const headLen = Math.min(cw, ch) * 0.04
    const px = ex - v.x * headLen
    const py = ey - v.y * headLen
    const perpX = -v.y
    const perpY = v.x
    const wing = headLen * 0.48
    ctx.fillStyle = 'rgba(255,70,70,0.94)'
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(px + perpX * wing, py + perpY * wing)
    ctx.lineTo(px - perpX * wing, py - perpY * wing)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  },

  mirror(ctx, progress, cw, ch) {
    // Mirror reflection hint
    ctx.save()
    ctx.fillStyle = 'rgba(100,150,255,0.15)'
    ctx.fillRect(cw / 2 - 2, 0, 4, ch)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 6
    ctx.strokeRect(cw * 0.39, ch * 0.16, cw * 0.22, ch * 0.28)
    ctx.restore()
  },

  conduct(ctx, progress, cw, ch) {
    // Music notes floating in the scene
    ctx.save()
    for (let i = 0; i < 6; i++) {
      const t = ((Date.now() / 1000 + i * 0.4) % 2) / 2
      const nx = cw * 0.2 + i * (cw * 0.12)
      const ny = ch * 0.7 - t * ch * 0.5
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = `hsl(${i * 50},90%,60%)`
      ctx.beginPath()
      ctx.arc(nx, ny, 8 + i, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(nx + 8 + i, ny)
      ctx.lineTo(nx + 8 + i, ny - 22)
      ctx.stroke()
    }
    ctx.restore()
  },

  lean(ctx, progress, cw, ch, game) {
    // Arrow indicating direction
    const dir = game?._currentMicrogame?._direction || 'left'
    ctx.save()
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    if (dir === 'left') {
      ctx.moveTo(cw * 0.4, ch * 0.35)
      ctx.lineTo(cw * 0.57, ch * 0.28)
      ctx.lineTo(cw * 0.57, ch * 0.33)
      ctx.lineTo(cw * 0.65, ch * 0.33)
      ctx.lineTo(cw * 0.65, ch * 0.37)
      ctx.lineTo(cw * 0.57, ch * 0.37)
      ctx.lineTo(cw * 0.57, ch * 0.42)
    } else {
      ctx.moveTo(cw * 0.6, ch * 0.35)
      ctx.lineTo(cw * 0.43, ch * 0.28)
      ctx.lineTo(cw * 0.43, ch * 0.33)
      ctx.lineTo(cw * 0.35, ch * 0.33)
      ctx.lineTo(cw * 0.35, ch * 0.37)
      ctx.lineTo(cw * 0.43, ch * 0.37)
      ctx.lineTo(cw * 0.43, ch * 0.42)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  },

  catch(ctx, progress, cw, ch) {
    // A glowing ball falls from top; player must raise both hands to catch it
    const fallY = ch * 0.1 + progress * ch * 0.55
    const wobble = Math.sin(Date.now() / 120) * 6
    const glow = 0.5 + Math.sin(Date.now() / 200) * 0.5

    ctx.save()
    // Outer glow
    const grad = ctx.createRadialGradient(cw / 2 + wobble, fallY, 0, cw / 2 + wobble, fallY, 48)
    grad.addColorStop(0, `rgba(255,220,50,${0.9 * glow})`)
    grad.addColorStop(0.5, `rgba(255,140,0,${0.5 * glow})`)
    grad.addColorStop(1, 'rgba(255,100,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cw / 2 + wobble, fallY, 48, 0, Math.PI * 2)
    ctx.fill()

    // Ball core
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.arc(cw / 2 + wobble, fallY, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5)
      const px = cw / 2 + wobble + Math.cos(a) * 12
      const py = fallY + Math.sin(a) * 12
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
      const innerA = a + Math.PI / 5
      ctx.lineTo(cw / 2 + wobble + Math.cos(innerA) * 5, fallY + Math.sin(innerA) * 5)
    }
    ctx.closePath()
    ctx.stroke()

    // Motion trail
    ctx.globalAlpha = 0.2
    for (let i = 1; i <= 4; i++) {
      const ty = fallY - i * 20
      ctx.fillStyle = '#FFD700'
      ctx.beginPath()
      ctx.arc(cw / 2 + wobble, ty, 26 - i * 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },

  freeze(ctx, progress, cw, ch) {
    // Ice crystals around a compact freeze zone
    ctx.save()
    const alpha = 0.3 + progress * 0.5
    ctx.globalAlpha = alpha
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const r = 60 + Math.sin(Date.now() / 500 + i) * 10
      const nx = cw / 2 + Math.cos(angle) * r
      const ny = ch * 0.35 + Math.sin(angle) * r
      ctx.strokeStyle = '#aaddff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(nx - 8, ny)
      ctx.lineTo(nx + 8, ny)
      ctx.moveTo(nx, ny - 8)
      ctx.lineTo(nx, ny + 8)
      ctx.moveTo(nx - 6, ny - 6)
      ctx.lineTo(nx + 6, ny + 6)
      ctx.moveTo(nx - 6, ny + 6)
      ctx.lineTo(nx + 6, ny - 6)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#aaddff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cw / 2 - 14, ch * 0.35)
    ctx.lineTo(cw / 2 + 14, ch * 0.35)
    ctx.moveTo(cw / 2, ch * 0.35 - 14)
    ctx.lineTo(cw / 2, ch * 0.35 + 14)
    ctx.moveTo(cw / 2 - 10, ch * 0.35 - 10)
    ctx.lineTo(cw / 2 + 10, ch * 0.35 + 10)
    ctx.moveTo(cw / 2 - 10, ch * 0.35 + 10)
    ctx.lineTo(cw / 2 + 10, ch * 0.35 - 10)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(cw / 2, ch * 0.52, Math.min(cw, ch) * 0.14, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  },
}

// ── BodyWareGame ───────────────────────────────────────────────────────────────

class BodyWareGame {
  constructor(engine, canvas, options = {}) {
    this.engine = engine
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this._sessionToken = options.sessionToken || ''
    this._sessionStartedAt = options.sessionStartedAt || null

    this.state = 'CALIBRATE'
    this.lives = BW_CONFIG.LIVES
    this.gamesPlayed = 0
    this.highScore = this._loadHighScore()

    this.currentAngles = null
    this.currentKP = null
    this.poseDetected = true

    this._currentMicrogame = null
    this._flashTimer = 0
    this._activeTimer = 0
    this._activeTotal = 0
    this._resultTimer = 0
    this._lastResult = null  // 'win' | 'fail'

    this._gameHistory = []
    this._lastTs = 0
    this._gameOverDom = null
    this._replayStream = null
    this._replayRecorder = null
    this._replayChunks = []
    this._replayUrl = null
    this._replayReady = false
    this._replayVideoEl = null
    UI.initGameUI(this.canvas, 'bodyware')

    engine.on('frame', (a, kp) => {
      this.currentAngles = a
      this.currentKP = kp
    })
    engine.on('lost', () => { this.poseDetected = false })
    engine.on('found', () => { this.poseDetected = true })
  }

  async start() {
    this.state = 'CALIBRATE'
    this._startReplayCapture()
    await UI.runCalibrationUI(this.canvas, this.engine)
    this._startNextMicrogame()
    this._loop(performance.now())
  }

  _currentTimeLimit() {
    const reductions = Math.floor(this.gamesPlayed / BW_CONFIG.SPEED_UP_EVERY)
    return Math.max(BW_CONFIG.MIN_TIME_MS, BW_CONFIG.BASE_TIME_MS - reductions * BW_CONFIG.TIME_REDUCTION)
  }

  _instructionHint() {
    return this._currentMicrogame?.hint ? UI.t(this._currentMicrogame.hint) : ''
  }

  _startNextMicrogame() {
    const requireFreshPool = this._gameHistory.length >= MICROGAMES.length
    if (requireFreshPool) this._gameHistory = []
    const available = MICROGAMES.filter(m => !this._gameHistory.includes(m.id))
    const supportsLegGames = this._hasLegTracking()
    const spawnable = supportsLegGames
      ? available
      : available.filter((m) => !BW_LEG_GAMES.has(m.id))
    const pool = spawnable.length ? spawnable : available
    const mg = pool[Math.floor(Math.random() * pool.length)]
    mg.reset()
    this._currentMicrogame = mg
    this._gameHistory.push(mg.id)

    this._flashTimer = BW_CONFIG.FLASH_MS
    this.state = 'FLASH'
  }

  _hasLegTracking() {
    const kp = this.currentKP
    if (!kp) return false
    return [25, 26, 27, 28].every((idx) => kp[idx] && (kp[idx].visibility || 0) >= 0.45)
  }

  _loop(timestamp) {
    this._rafId = requestAnimationFrame(ts => this._loop(ts))
    const dt = Math.min(50, timestamp - (this._lastTs || timestamp))
    this._lastTs = timestamp

    UI.updatePopups(dt)
    UI.updateOverlay(dt)

    this._update(dt)
    this._render()
  }

  _update(dt) {
    if (this.state === 'FLASH') {
      this._flashTimer -= dt
      if (this._flashTimer <= 0) {
        const limit = this._currentMicrogame.timeMs || this._currentTimeLimit()
        this._activeTimer = limit
        this._activeTotal = limit
        this.state = 'ACTIVE'
      }
    } else if (this.state === 'ACTIVE') {
      this._activeTimer -= dt

      if (this.currentAngles && this.currentKP && this.engine.baseline) {
        const mg = this._currentMicrogame
        const elapsed = this._activeTotal - this._activeTimer
        let won = false
        try {
          won = mg.check(this.currentAngles, this.currentKP, this.engine.baseline, elapsed, dt)
        } catch (e) {}

        if (mg.id === 'duck' && mg._collided) {
          this._activeTimer = 0
        }

        if (won) {
          this.gamesPlayed++
          this._lastResult = 'win'
          UI.showResult(this.canvas, 'win', BW_CONFIG.WIN_DISPLAY_MS)
          this._resultTimer = BW_CONFIG.WIN_DISPLAY_MS
          this.state = 'RESULT'
          return
        }
      }

      if (this._activeTimer <= 0) {
        this.lives--
        this._lastResult = 'fail'
        UI.showResult(this.canvas, 'fail', BW_CONFIG.FAIL_DISPLAY_MS)
        this._resultTimer = BW_CONFIG.FAIL_DISPLAY_MS

        if (this.lives <= 0) {
          this.state = 'RESULT'
        } else {
          this.state = 'RESULT'
        }
      }
    } else if (this.state === 'RESULT') {
      this._resultTimer -= dt
      if (this._resultTimer <= 0) {
        if (this.lives <= 0) {
          this._gameOver()
        } else {
          this._startNextMicrogame()
        }
      }
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _render() {
    const ctx = this.ctx
    const cw = this.canvas.width, ch = this.canvas.height

    // Mirror video background
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(this.engine.video, -cw, 0, cw, ch)
    ctx.restore()

    // Darken top 2/3 slightly for readability
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, cw, ch * 0.68)
    ctx.restore()

    // Player outline + star + faint skeleton (drawn before game elements)
    this.engine.drawPlayerWithOutline(ctx)
    this.engine.drawPlayerStar(ctx)
    this.engine.drawSkeleton(ctx, '#ffffff', 0.1)

    if (this.state === 'FLASH') {
      this._renderFlash()
    } else if (this.state === 'ACTIVE') {
      this._renderActive()
    } else if (this.state === 'RESULT') {
      this._renderResult()
    } else if (this.state === 'GAME_OVER') {
      this._renderGameOver()
    }

    UI.drawOverlay(ctx)
    UI.drawPopups()

    let instruction = ''
    if (this._currentMicrogame && (this.state === 'FLASH' || this.state === 'ACTIVE')) {
      if (this._currentMicrogame.getInstruction) {
        instruction = UI.t({ en: this._currentMicrogame.getInstruction() })
      } else {
        instruction = UI.t(this._currentMicrogame.instruction)
      }
    }

    if (this._currentMicrogame?.id === 'punch' && (this.state === 'FLASH' || this.state === 'ACTIVE')) {
      instruction = `PUNCH ${Math.min(3, (this._currentMicrogame._targetsCleared || 0) + 1)}/3`
    }
    if (this._currentMicrogame?.id === 'conduct' && (this.state === 'FLASH' || this.state === 'ACTIVE')) {
      instruction = `CONDUCT ${Math.min(3, (this._currentMicrogame._cycles || 0) + 1)}/3`
    }

    let status = ''
    let statusKind = ''
    if (this.state === 'RESULT') {
      statusKind = this._lastResult === 'win' ? 'win' : 'fail'
      status = this._lastResult === 'win'
        ? `Cleared ${this.gamesPlayed} game${this.gamesPlayed === 1 ? '' : 's'}`
        : `${this.lives} life${this.lives === 1 ? '' : 's'} left`
    } else if (this.state === 'GAME_OVER') {
      statusKind = 'gameover'
      status = `Final score: ${this.gamesPlayed} cleared`
    }

    UI.updateBodyWareHUD({
      state: this.state,
      lives: this.lives,
      gamesPlayed: this.gamesPlayed,
      poseDetected: this.poseDetected,
      instruction,
      hint: this._instructionHint(),
      status,
      statusKind,
      timer: this._activeTimer,
      timerTotal: this._activeTotal,
    })
  }

  _renderFlash() {
    const ctx = this.ctx
    const cw = this.canvas.width, ch = this.canvas.height
    const mg = this._currentMicrogame
    const flashProgress = 1 - this._flashTimer / BW_CONFIG.FLASH_MS

    // Keep FLASH visual pulse only; instruction text is rendered in crisp HTML.
    ctx.save()
    const pulse = 1 + Math.sin(flashProgress * Math.PI) * 0.12
    ctx.translate(cw / 2, ch * 0.42)
    ctx.scale(pulse, pulse)
    ctx.fillStyle = 'rgba(255, 215, 0, 0.25)'
    ctx.beginPath()
    ctx.arc(0, 0, Math.round(ch * 0.12), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  _renderActive() {
    const ctx = this.ctx
    const cw = this.canvas.width, ch = this.canvas.height
    const mg = this._currentMicrogame
    const progress = 1 - this._activeTimer / this._activeTotal

    // Scene animation
    if (SCENES[mg.scene]) {
      SCENES[mg.scene](ctx, progress, cw, ch, this)
    }

    if (mg.id === 'punch') this._drawPunchTarget()
    if (mg.id === 'catch') this._drawCatchZone(progress)
    if (mg.id === 'freeze') this._drawFreezeAura()
    if (mg.id === 'balance') this._drawBalanceGuide()
    if (mg.id === 'conduct') this._drawConductReaction()

    // Instruction and timer are rendered in crisp HTML.
  }

  _renderResult() {
    // Result text is rendered in DOM HUD for crispness.
  }

  _gameOver() {
    this.state = 'GAME_OVER'
    const isNewRecord = this.gamesPlayed > this.highScore
    this._saveScore()
    this._submitScoreToServer()
    if (isNewRecord) UI.triggerConfetti()
    this._stopReplayCapture()
    this._showGameOverControls()
  }

  _submitScoreToServer() {
    if (typeof LB === 'undefined') return
    const sessionDuration = this._sessionStartedAt ? Date.now() - this._sessionStartedAt : 0
    LB.submitScore('bodyware', this.gamesPlayed, {
      sessionDuration,
      sessionToken: this._sessionToken || '',
    }).catch(() => {})
  }

  _renderGameOver() {
    const ctx = this.ctx
    const cw = this.canvas.width, ch = this.canvas.height

    UI.clearGameUI()

    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(this.engine.video, -cw, 0, cw, ch)
    ctx.restore()

    ctx.fillStyle = 'rgba(0,0,0,0.82)'
    ctx.fillRect(0, 0, cw, ch)
  }

  _drawPunchTarget() {
    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height
    const mg = this._currentMicrogame
    if (!mg?._target) return

    ctx.save()
    const target = mg._target
    const x = cw * target.x
    const y = ch * target.y
    const radius = Math.min(cw, ch) * target.radius

    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.96)'
    ctx.lineWidth = 6
    ctx.setLineDash([10, 8])
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = 'rgba(231,76,60,0.24)'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.setLineDash([])
    ctx.restore()
    ctx.restore()
  }

  _drawCatchZone(progress) {
    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(cw * 0.5, ch * (0.1 + progress * 0.55), Math.min(cw, ch) * 0.12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  _drawFreezeAura() {
    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height
    ctx.save()
    ctx.strokeStyle = 'rgba(170,221,255,0.45)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cw * 0.5, ch * 0.52, Math.min(cw, ch) * 0.18, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  _drawConductReaction() {
    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height
    const mg = this._currentMicrogame
    if (!mg?._reactionMs) return

    const alpha = Math.min(1, mg._reactionMs / 520)
    const scale = 1 + (1 - alpha) * 0.45
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(cw * 0.5, ch * 0.34)
    ctx.scale(scale, scale)
    const count = Math.max(1, mg._cycles)
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 28
      ctx.fillStyle = '#ffe36a'
      ctx.beginPath()
      ctx.arc(offset - 10, 0, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(offset + 10, -10, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffe36a'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(offset - 2, 0)
      ctx.lineTo(offset - 2, -28)
      ctx.moveTo(offset + 18, -10)
      ctx.lineTo(offset + 18, -42)
      ctx.stroke()
    }
    ctx.restore()
  }

  _startReplayCapture() {
    if (!this.canvas.captureStream || typeof MediaRecorder === 'undefined') return

    this._replayReady = false
    this._replayChunks = []
    if (this._replayUrl) {
      URL.revokeObjectURL(this._replayUrl)
      this._replayUrl = null
    }

    try {
      this._replayStream = this.canvas.captureStream(30)
      this._replayStopPending = false
      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ].find((type) => MediaRecorder.isTypeSupported?.(type)) || ''

      this._replayRecorder = new MediaRecorder(this._replayStream, mimeType ? { mimeType } : undefined)
      this._replayRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this._replayChunks.push(event.data)
      }
      this._replayRecorder.onstop = () => {
        if (!this._replayChunks.length) return
        const blob = new Blob(this._replayChunks, { type: this._replayRecorder.mimeType || 'video/webm' })
        this._replayUrl = URL.createObjectURL(blob)
        this._replayReady = true
        try {
          this._replayStream?.getTracks?.().forEach((track) => track.stop())
        } catch {}
        this._mountReplayIntoGameOver()
      }
      this._replayRecorder.start()
    } catch {}
  }

  _stopReplayCapture() {
    try {
      if (this._replayRecorder && this._replayRecorder.state !== 'inactive') {
        this._replayRecorder.requestData?.()
        this._replayRecorder.stop()
      }
    } catch {}
  }

  _drawBalanceGuide() {
    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height
    ctx.save()
    ctx.strokeStyle = 'rgba(255,215,0,0.75)'
    ctx.lineWidth = 4
    ctx.setLineDash([12, 8])
    ctx.beginPath()
    ctx.moveTo(cw * 0.5, ch * 0.18)
    ctx.lineTo(cw * 0.5, ch * 0.82)
    ctx.stroke()
    ctx.restore()
  }

  _showGameOverControls() {
    const parent = this.canvas.parentElement || document.body
    this._removeGameOverControls()

    const wrap = document.createElement('div')
    wrap.className = 'game-over-controls'

    const summary = document.createElement('div')
    summary.className = 'game-over-summary'
    summary.innerHTML = `
      <div class="game-over-title">GAME OVER</div>
      <div class="game-over-score">${this.gamesPlayed} games cleared</div>
      <div class="game-over-meta">${this.gamesPlayed >= this.highScore ? 'New record' : `High score: ${this.highScore}`}</div>
    `

    const replayPanel = document.createElement('div')
    replayPanel.className = 'game-over-replay'
    replayPanel.innerHTML = `<div class="game-over-replay-label">Replay</div><div class="game-over-replay-loading">Preparing replay…</div>`

    const replayBtn = document.createElement('button')
    replayBtn.className = 'game-over-btn'
    replayBtn.textContent = 'Replay'
    replayBtn.disabled = true
    replayBtn.addEventListener('click', () => this._playReplay())

    const playAgain = document.createElement('button')
    playAgain.className = 'game-over-btn primary'
    playAgain.textContent = 'Play again'
    playAgain.addEventListener('click', () => location.reload())

    const home = document.createElement('button')
    home.className = 'game-over-btn'
    home.textContent = 'Back home'
    home.addEventListener('click', () => { location.href = 'index.html' })

    wrap.append(summary, replayPanel, replayBtn, playAgain, home)
    parent.appendChild(wrap)
    this._gameOverDom = wrap
    this._mountReplayIntoGameOver()
  }

  _removeGameOverControls() {
    this._replayVideoEl = null
    if (this._gameOverDom?.parentElement) {
      this._gameOverDom.parentElement.removeChild(this._gameOverDom)
    }
    this._gameOverDom = null
  }

  _mountReplayIntoGameOver() {
    const panel = this._gameOverDom?.querySelector('.game-over-replay')
    if (!panel) return
    if (!this._replayReady || !this._replayUrl) return

    panel.innerHTML = ''
    const label = document.createElement('div')
    label.className = 'game-over-replay-label'
    label.textContent = 'Replay'

    const replay = document.createElement('video')
    replay.className = 'game-over-replay-video'
    replay.src = this._replayUrl
    replay.autoplay = true
    replay.loop = true
    replay.muted = true
    replay.playsInline = true
    replay.controls = true

    this._replayVideoEl = replay
    panel.append(label, replay)
    const replayBtn = this._gameOverDom?.querySelector('.game-over-btn')
    if (replayBtn) replayBtn.disabled = false
    this._playReplay()
  }

  _playReplay() {
    const replay = this._replayVideoEl
    if (!replay) return
    try {
      replay.currentTime = 0
      const maybePromise = replay.play()
      if (maybePromise?.catch) maybePromise.catch(() => {})
    } catch {}
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  _loadHighScore() {
    try {
      const data = JSON.parse(localStorage.getItem('bodygame_scores') || '{}')
      return data.bodyware?.highScore || 0
    } catch { return 0 }
  }

  _saveScore() {
    try {
      const data = JSON.parse(localStorage.getItem('bodygame_scores') || '{}')
      if (!data.bodyware) data.bodyware = { highScore: 0, gamesPlayed: 0, lastPlayed: null }
      if (this.gamesPlayed > data.bodyware.highScore) data.bodyware.highScore = this.gamesPlayed
      data.bodyware.gamesPlayed = (data.bodyware.gamesPlayed || 0) + 1
      data.bodyware.lastPlayed = new Date().toISOString()
      localStorage.setItem('bodygame_scores', JSON.stringify(data))
      this.highScore = data.bodyware.highScore
    } catch {}
  }
}

window.BodyWareGame = BodyWareGame
