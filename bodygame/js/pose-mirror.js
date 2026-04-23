/**
 * Pose Mirror — game logic
 * States: CALIBRATE → PREVIEW → HOLD → SCORE → BONUS_INTRO → BONUS → GAME_OVER
 */

const PM_CONFIG = {
  TOTAL_ROUNDS: 8,
  PREVIEW_MS: 0,
  HOLD_MS: 4000,
  RESULT_MS: 1500,
  CONFIRM_MS: 150,
  PERFECT_ADVANCE_MS: 300,
  BONUS_MS: 10000,
  BONUS_POSE_MS: 3000,
  BONUS_INTRO_MS: 1800,
  PASS_THRESHOLD: 60,
  BONUS_PASS_THRESHOLD: 72,
  BONUS_CONFIRM_MS: 500,
  COMBO_THRESHOLD: 80,
  COMBO_MULTIPLIERS: [1, 1, 1, 2, 2, 3, 3, 3, 3, 3],
  DIFFICULTY: { joints: ['elbow_L','elbow_R','shoulder_L','shoulder_R','knee_L','knee_R','hip_L','hip_R'], tolerance: 20, minJointScore: 0 },
}

function getDifficulty() {
  return PM_CONFIG.DIFFICULTY
}

function computeRoundScore(currentAngles, targetAngles, difficulty) {
  const { joints, tolerance, minJointScore = 0 } = difficulty
  let total = 0
  let counted = 0
  for (const joint of joints) {
    if (currentAngles[joint] == null || targetAngles[joint] == null) continue
    const diff = Math.abs(currentAngles[joint] - targetAngles[joint])
    const jointScore = Math.max(0, 100 - (Math.max(0, diff - tolerance) / tolerance) * 100)
    if (jointScore < minJointScore) return 0
    total += jointScore
    counted++
  }
  return counted > 0 ? Math.round(total / counted) : 0
}

function computeSpeedBonus(remainingMs, holdMs, roundScore) {
  if (roundScore < 60) return 0
  return Math.round((remainingMs / holdMs) * 20)
}

function hasFullBodyInFrame(kp) {
  if (!kp || kp.length < 29) return false

  const required = [0, 11, 12, 23, 24, 25, 26, 27, 28]
  const margin = 0.02

  for (const index of required) {
    const point = kp[index]
    if (!point) return false
    if ((point.visibility || 0) < 0.32) return false
    if (point.x < margin || point.x > 1 - margin) return false
    if (point.y < margin || point.y > 1 - margin) return false
  }
  return true
}

// ── PoseMirrorGame ─────────────────────────────────────────────────────────────

class PoseMirrorGame {
  constructor(engine, canvas, options = {}) {
    this.engine = engine
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this._sessionToken = options.sessionToken || ''
    this._sessionStartedAt = options.sessionStartedAt || null

    this.state = 'CALIBRATE'
    this.round = 0
    this.totalScore = 0
    this.combo = 0
    this.highScore = this._loadHighScore()

    this.targetPose = null
    this.currentAngles = null
    this.currentKeypoints = null
    this.poseDetected = true
    this.fullBodyDetected = false
    this.pauseReason = 'Full body not detected'

    this.timer = 0          // ms remaining in current state
    this.stateStartTime = 0

    this.bestMatchThisHold = 0
    this._lastLiveScore = null
    this._confirmMs = 0
    this._perfectMatchMs = 0
    this.lastRoundScore = 0
    this.lastSpeedBonus = 0
    this._bonusTimer = 0
    this._bonusPoseTimer = 0
    this._bonusSuccesses = 0
    this._rafId = null
    this._waitingForFullBody = false
    this._fullBodyMissingMs = 0
    this._fullBodyRecoveredMs = 0
    this._fullBodyGuideVisible = false
    this._fullBodyGuideOverlay = null
    this._gameOverDom = null
    this._replayStream = null
    this._replayRecorder = null
    this._replayChunks = []
    this._replayUrl = null
    this._replayReady = false
    this._replayVideoEl = null

    this._usedPoseIds = new Set()
    this._successFlashMs = 0
    UI.initGameUI(this.canvas, 'pose-mirror')

    // Pause state — use a 600ms grace period before actually pausing
    // so a single dropped frame doesn't stutter the game
    this._poseGraceTimer = 0
    this._paused = false

    engine.on('frame', (angles, kp) => {
      this.currentAngles = angles
      this.currentKeypoints = kp
      this.poseDetected = true
      this.fullBodyDetected = hasFullBodyInFrame(kp)
      if (this.fullBodyDetected) {
        this._poseGraceTimer = 0
        this._paused = false
        this.pauseReason = ''
      } else {
        this.pauseReason = 'Full body not detected'
      }
    })
    engine.on('lost', () => {
      this.poseDetected = false
      this.fullBodyDetected = false
      this.pauseReason = 'Full body not detected'
    })
    engine.on('found', () => {
      this.poseDetected = true
    })
  }

  async start() {
    this.state = 'CALIBRATE'
    this._removeGameOverControls()
    this._startReplayCapture()
    await UI.runCalibrationUI(this.canvas, this.engine)
    this._syncTrackingStateFromEngine()
    this._waitingForFullBody = false
    this._loop(performance.now())
    this._startRound()
  }

  _syncTrackingStateFromEngine() {
    this.currentAngles = this.engine.getAngles()
    this.currentKeypoints = this.engine.getKeypoints()
    this.poseDetected = !!this.currentKeypoints
    this.fullBodyDetected = hasFullBodyInFrame(this.currentKeypoints)
    if (this.fullBodyDetected) {
      this._poseGraceTimer = 0
      this._paused = false
      this.pauseReason = ''
    } else {
      this.pauseReason = 'Full body not detected'
    }
  }

  async _waitForFullBodyReady() {
    await new Promise((resolve) => {
      const check = () => {
        this._syncTrackingStateFromEngine()
        if (this.fullBodyDetected) {
          resolve()
          return
        }
        setTimeout(check, 120)
      }
      check()
    })
  }

  _ensureFullBodyGuideOverlay() {
    if (this._fullBodyGuideOverlay) return this._fullBodyGuideOverlay
    const parent = this.canvas.parentElement || document.body
    const overlay = document.createElement('div')
    overlay.className = 'calibration-overlay pose-mirror-guide-overlay'
    overlay.style.display = 'none'
    overlay.innerHTML = `
      <div class="calibration-card">
        <div class="calibration-title">Step back so your whole body is visible</div>
        <div class="loading-steps" style="line-height:1.6; font-size: 1rem; color:#d7deef; text-align:center;">
          Stand where your head, hips, knees, and ankles are all in frame.
        </div>
      </div>
    `
    parent.appendChild(overlay)
    this._fullBodyGuideOverlay = overlay
    return overlay
  }

  _setFullBodyGuideVisible(visible) {
    if (this.state === 'GAME_OVER') visible = false
    if (this._fullBodyGuideVisible === visible) return
    this._fullBodyGuideVisible = visible
    const overlay = this._ensureFullBodyGuideOverlay()
    overlay.style.display = visible ? 'flex' : 'none'
  }

  _startRound() {
    this.round++
    this.targetPose = this._pickPose()
    this.bestMatchThisHold = 0
    this._lastLiveScore = null
    this._confirmMs = 0
    this._perfectMatchMs = 0
    this.timer = this._holdDurationMs()
    this.stateStartTime = performance.now()
    this.state = 'HOLD'
  }

  _pickPose() {
    const allPoses = POSES
    const lastId = this.targetPose?.id
    const notLast = (pose) => pose.id !== lastId
    const unused = allPoses.filter((pose) => !this._usedPoseIds.has(pose.id) && notLast(pose))
    // If all unused are exhausted, reset the used set but still avoid the last pose
    const list = unused.length > 0
      ? unused
      : allPoses.filter(notLast).length > 0 ? allPoses.filter(notLast) : allPoses
    if (unused.length === 0) this._usedPoseIds.clear()
    const pose = list[Math.floor(Math.random() * list.length)]
    this._usedPoseIds.add(pose.id)
    return pose
  }

  _holdDurationMs() {
    return PM_CONFIG.HOLD_MS
  }

  _pickBonusPose() {
    const configuredPool = POSES
    const pool = this.targetPose
      ? configuredPool.filter((pose) => pose.id !== this.targetPose.id)
      : configuredPool
    const list = pool.length ? pool : configuredPool
    return list[Math.floor(Math.random() * list.length)]
  }

  _startBonusRound() {
    this.state = 'BONUS'
    this.targetPose = this._pickBonusPose()
    this.bestMatchThisHold = 0
    this._lastLiveScore = null
    this._confirmMs = 0
    this._perfectMatchMs = 0
    this._bonusTimer = PM_CONFIG.BONUS_MS
    this._bonusPoseTimer = PM_CONFIG.BONUS_POSE_MS
    this._bonusSuccesses = 0
  }

  _startBonusIntro() {
    this.state = 'BONUS_INTRO'
    this.targetPose = null
    this._lastLiveScore = null
    this._confirmMs = 0
    this._perfectMatchMs = 0
    this.timer = PM_CONFIG.BONUS_INTRO_MS
  }

  _advanceBonusPose() {
    this.targetPose = this._pickBonusPose()
    this.bestMatchThisHold = 0
    this._lastLiveScore = null
    this._confirmMs = 0
    this._perfectMatchMs = 0
    this._bonusPoseTimer = PM_CONFIG.BONUS_POSE_MS
  }

  _bonusDifficulty() {
    return { joints: ['elbow_L','elbow_R','shoulder_L','shoulder_R','knee_L','knee_R','hip_L','hip_R','spine'], tolerance: 12, minJointScore: 0 }
  }

  _completeBonusPose(score) {
    const earned = Math.round(score + computeSpeedBonus(Math.max(0, this._bonusPoseTimer), PM_CONFIG.BONUS_POSE_MS, score))
    this.totalScore += earned
    this.lastRoundScore = score
    this.lastSpeedBonus = earned - score
    this._bonusSuccesses++
    this._successFlashMs = 350
    UI.scorePopup(this.canvas, earned, this.canvas.width / 2, this.canvas.height / 2, '#7CFFB2')
    UI.showResult(this.canvas, 'win', 350)
    if (this._bonusTimer <= 0) {
      this._gameOver()
      return
    }
    this._advanceBonusPose()
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
    if (!this.poseDetected || !this.fullBodyDetected) {
      this._fullBodyMissingMs += dt
      this._fullBodyRecoveredMs = 0
    } else {
      this._fullBodyRecoveredMs += dt
      this._fullBodyMissingMs = 0
    }

    const shouldShowGuide = (
      this._waitingForFullBody ||
      this._fullBodyMissingMs >= 180 ||
      (this._fullBodyGuideVisible && this._fullBodyRecoveredMs < 350)
    )
    this._setFullBodyGuideVisible(shouldShowGuide)

    // Grace period: tolerate up to 600ms of lost/partial pose before pausing.
    if (!this.poseDetected || !this.fullBodyDetected) {
      this._poseGraceTimer += dt
      if (this._poseGraceTimer >= 600) this._paused = true
    } else {
      this._poseGraceTimer = 0
      this._paused = false
    }

    if (this._successFlashMs > 0) this._successFlashMs -= dt

    // Freeze all timers while paused
    if (this._paused) return

    if (this.state === 'PREVIEW') {
      this.timer -= dt
      if (this.timer <= 0) {
        this.timer = this._holdDurationMs()
        this.stateStartTime = performance.now()
        this.state = 'HOLD'
      }
    } else if (this.state === 'HOLD') {
      if (this.fullBodyDetected) this.timer -= dt
      if (this.currentAngles && this.targetPose) {
        const diff = getDifficulty()
        const score = computeRoundScore(this.currentAngles, this.targetPose.angles, diff)
        if (score > this.bestMatchThisHold) this.bestMatchThisHold = score
        this._confirmMs = 0
        this._perfectMatchMs = 0
      } else {
        this._confirmMs = 0
        this._perfectMatchMs = 0
      }
      if (this.timer <= 0) this._endHold()
    } else if (this.state === 'BONUS_INTRO') {
      this.timer -= dt
      if (this.timer <= 0) {
        this._startBonusRound()
      }
    } else if (this.state === 'BONUS') {
      if (this.fullBodyDetected) {
        this._bonusTimer -= dt
        this._bonusPoseTimer -= dt
      }
      if (this.currentAngles && this.targetPose) {
        const score = computeRoundScore(this.currentAngles, this.targetPose.angles, this._bonusDifficulty())
        if (score > this.bestMatchThisHold) this.bestMatchThisHold = score
        if (score >= PM_CONFIG.BONUS_PASS_THRESHOLD) {
          this._confirmMs += dt
          if (this._confirmMs >= PM_CONFIG.BONUS_CONFIRM_MS) {
            this._completeBonusPose(score)
            return
          }
        } else {
          this._confirmMs = 0
        }
      } else {
        this._confirmMs = 0
        this._perfectMatchMs = 0
      }

      if (this._bonusTimer <= 0) {
        this._gameOver()
        return
      }
      if (this._bonusPoseTimer <= 0) {
        this._advanceBonusPose()
      }
    } else if (this.state === 'SCORE') {
      this.timer -= dt
      if (this.timer <= 0) {
        if (this.round >= PM_CONFIG.TOTAL_ROUNDS) {
          this._startBonusIntro()
        } else {
          this._startRound()
        }
      }
    }
  }

  _endHold(options = {}) {
    const { advanceImmediately = false } = options
    const diff = getDifficulty()
    const roundScore = this.bestMatchThisHold
    const holdMs = this._holdDurationMs()
    const speedBonus = computeSpeedBonus(Math.max(0, this.timer), holdMs, roundScore)

    if (roundScore >= PM_CONFIG.COMBO_THRESHOLD) {
      this.combo++
    } else {
      this.combo = 0
    }

    const multiplier = PM_CONFIG.COMBO_MULTIPLIERS[Math.min(this.combo, PM_CONFIG.COMBO_MULTIPLIERS.length - 1)]
    const earned = Math.round((roundScore + speedBonus) * multiplier)
    this.totalScore += earned
    this.lastRoundScore = roundScore
    this.lastSpeedBonus = speedBonus

    // Score popup at canvas center
    UI.scorePopup(this.canvas, earned, this.canvas.width / 2, this.canvas.height / 2, '#FFD700')
    UI.showResult(this.canvas, roundScore >= PM_CONFIG.PASS_THRESHOLD ? 'win' : 'fail', 900)
    if (roundScore >= PM_CONFIG.PASS_THRESHOLD) this._successFlashMs = 350

    if (advanceImmediately) {
      UI.clearOverlay()
      if (this.round >= PM_CONFIG.TOTAL_ROUNDS) {
        this._startBonusIntro()
      } else {
        this._startRound()
      }
      return
    }

    this.timer = PM_CONFIG.RESULT_MS
    this.state = 'SCORE'
  }

  _gameOver() {
    this.state = 'GAME_OVER'
    const isNewRecord = this.totalScore > this.highScore
    this._saveScore()
    this._submitScoreToServer()
    if (isNewRecord) UI.triggerConfetti()
    this._stopReplayCapture()
    UI.clearGameUI()
    this._setFullBodyGuideVisible(false)
    this._showGameOverControls()
  }

  _submitScoreToServer() {
    if (typeof LB === 'undefined') return
    const sessionDuration = this._sessionStartedAt ? Date.now() - this._sessionStartedAt : 0
    LB.submitScore('pose-mirror', this.totalScore, {
      sessionDuration,
      sessionToken: this._sessionToken || '',
    }).catch(() => {})
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _render() {
    const ctx = this.ctx
    const cw = this.canvas.width, ch = this.canvas.height
    const timerTotal = this.state === 'BONUS'
      ? PM_CONFIG.BONUS_MS
      : (this.state === 'BONUS_INTRO'
        ? PM_CONFIG.BONUS_INTRO_MS
      : (this.state === 'PREVIEW' ? PM_CONFIG.PREVIEW_MS : this._holdDurationMs())
      )
    const pauseMessage = 'Full body not detected. Step back so your whole body is visible.'

    // Mirror video background
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(this.engine.video, -cw, 0, cw, ch)
    ctx.restore()

    if (this._waitingForFullBody) {
      this.engine.drawPlayerWithOutline(ctx)
      this.engine.drawPlayerStar(ctx)
      this.engine.drawSkeleton(ctx, '#ffffff', 0.1)
      UI.updatePoseMirrorHUD({
        round: this.round,
        totalRounds: PM_CONFIG.TOTAL_ROUNDS,
        totalScore: this.totalScore,
        combo: this.combo,
        state: this.state,
        paused: true,
        useGuideOverlay: true,
        poseDetected: this.poseDetected,
        fullBodyDetected: this.fullBodyDetected,
        timer: this.timer,
        timerTotal,
        poseName: this.targetPose?.question?.title || this.targetPose?.name?.en || '',
        poseSubtitle: this.targetPose?.question?.subtitle || 'Copy this pose!',
        liveScore: null,
        lastRoundScore: this.lastRoundScore,
        lastSpeedBonus: this.lastSpeedBonus,
        pauseTitle: 'PAUSED',
        pauseMessage: 'Full body not detected. Step back so your whole body is visible.',
        confirming: false,
        confirmProgress: 0,
      })
      return
    }

    if (this._paused) {
      this.engine.drawPlayerWithOutline(ctx)
      this.engine.drawPlayerStar(ctx)
      this.engine.drawSkeleton(ctx, '#ffffff', 0.1)
      this._renderPaused()
      UI.updatePoseMirrorHUD({
        round: this.round,
        totalRounds: PM_CONFIG.TOTAL_ROUNDS,
        totalScore: this.totalScore,
        combo: this.combo,
        state: this.state,
        paused: true,
        useGuideOverlay: true,
        poseDetected: this.poseDetected,
        fullBodyDetected: this.fullBodyDetected,
        timer: this.timer,
        timerTotal,
        poseName: this.targetPose?.question?.title || this.targetPose?.name?.en || '',
        poseSubtitle: this.targetPose?.question?.subtitle || 'Copy this pose!',
        liveScore: null,
        lastRoundScore: this.lastRoundScore,
        lastSpeedBonus: this.lastSpeedBonus,
        pauseTitle: 'PAUSED',
        pauseMessage,
        confirming: false,
        confirmProgress: 0,
      })
      return
    }

    if (this.state === 'GAME_OVER') {
      this._renderGameOver()
      return
    }

    if (this.state === 'BONUS_INTRO') {
      this.engine.drawPlayerWithOutline(ctx)
      this.engine.drawPlayerStar(ctx)
      this.engine.drawSkeleton(ctx, '#ffffff', 0.1)
      UI.updatePoseMirrorHUD({
        round: this.round,
        totalRounds: PM_CONFIG.TOTAL_ROUNDS,
        roundLabel: 'Bonus Round!',
        totalScore: this.totalScore,
        combo: this.combo,
        state: this.state,
        paused: false,
        useGuideOverlay: true,
        poseDetected: this.poseDetected,
        fullBodyDetected: this.fullBodyDetected,
        timer: this.timer,
        timerTotal,
        poseName: 'Bonus Round!',
        poseSubtitle: 'Match as many random poses as you can in 10 seconds',
        liveScore: null,
        lastRoundScore: this.lastRoundScore,
        lastSpeedBonus: this.lastSpeedBonus,
        pauseTitle: 'PAUSED',
        pauseMessage,
        confirming: false,
        confirmProgress: 0,
      })
      return
    }

    if (this.state === 'PREVIEW' || this.state === 'HOLD' || this.state === 'BONUS') {
      // Draw target skeleton (ghost)
      if (this.targetPose) {
        this.engine.drawTargetSkeleton(ctx, this.targetPose.angles, '#cc44ff', 0.55, {
          anchorX: 0.84,
          anchorY: 0.62,
          scaleRatio: 0.24,
        })
      }

      // Draw player silhouette + faint skeleton
      this.engine.drawPlayerWithOutline(ctx)
      this.engine.drawPlayerStar(ctx)
      this.engine.drawSkeleton(ctx, '#ffffff', 0.1)

    } else if (this.state === 'SCORE') {
      this.engine.drawPlayerWithOutline(ctx)
      this.engine.drawPlayerStar(ctx)
      this.engine.drawSkeleton(ctx, '#ffffff', 0.1)
    }

    if ((this.state === 'HOLD' || this.state === 'BONUS') && (this._confirmMs > 0 || this._perfectMatchMs > 0)) {
      this._renderConfirmFlash()
    }

    if (this._successFlashMs > 0) this._renderSuccessFlash()

    UI.drawOverlay(ctx)
    UI.drawPopups()

    const scoreDifficulty = this.state === 'BONUS' ? this._bonusDifficulty() : getDifficulty()
    const liveScore = ((this.state === 'PREVIEW' || this.state === 'HOLD' || this.state === 'BONUS') && this.currentAngles && this.targetPose)
      ? computeRoundScore(this.currentAngles, this.targetPose.angles, scoreDifficulty)
      : this._lastLiveScore
    if ((this.state === 'PREVIEW' || this.state === 'HOLD' || this.state === 'BONUS') && Number.isFinite(liveScore)) {
      this._lastLiveScore = liveScore
    }
    UI.updatePoseMirrorHUD({
      round: this.round,
      totalRounds: PM_CONFIG.TOTAL_ROUNDS,
      roundLabel: this.state === 'BONUS' ? `Bonus ${this._bonusSuccesses}` : null,
      totalScore: this.totalScore,
      combo: this.combo,
      state: this.state,
      paused: this._paused,
      useGuideOverlay: true,
      poseDetected: this.poseDetected,
      fullBodyDetected: this.fullBodyDetected,
      timer: this.state === 'BONUS' ? this._bonusTimer : this.timer,
      timerTotal,
      poseName: this.targetPose?.question?.title || this.targetPose?.name?.en || '',
      poseSubtitle: this.state === 'BONUS'
        ? `${this.targetPose?.question?.subtitle || 'Match this pose'} • pose resets in ${Math.ceil(this._bonusPoseTimer / 1000)}s`
        : (this.targetPose?.question?.subtitle || 'Copy this pose!'),
      liveScore,
      lastRoundScore: this.lastRoundScore,
      lastSpeedBonus: this.lastSpeedBonus,
      pauseTitle: 'PAUSED',
      pauseMessage,
      confirming: this.state === 'BONUS' && (this._confirmMs > 0 || this._perfectMatchMs > 0),
      confirmProgress: this.state === 'BONUS'
        ? Math.max(
          this._confirmMs / PM_CONFIG.CONFIRM_MS,
          this._perfectMatchMs / PM_CONFIG.PERFECT_ADVANCE_MS,
        )
        : 0,
    })
  }

  _drawJointIndicators() {
    const ctx = this.ctx
    const diff = getDifficulty()
    const cw = this.canvas.width
    const indicatorY = this.canvas.height - 55
    const total = diff.joints.length
    const spacing = 28
    const startX = cw / 2 - (total - 1) * spacing / 2

    for (let i = 0; i < total; i++) {
      const joint = diff.joints[i]
      const curr = this.currentAngles[joint]
      const tgt = this.targetPose.angles[joint]
      if (curr == null || tgt == null) continue

      const diff2 = Math.abs(curr - tgt)
      const good = diff2 <= diff.tolerance * 1.5
      const perfect = diff2 <= diff.tolerance

      ctx.beginPath()
      ctx.arc(startX + i * spacing, indicatorY, 10, 0, Math.PI * 2)
      ctx.fillStyle = perfect ? '#00ff88' : good ? '#ffdd00' : '#ff4444'
      ctx.fill()
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  _drawScoreMeter(score) {
    const ctx = this.ctx
    const cw = this.canvas.width
    const meterW = 160, meterH = 24
    const mx = cw - meterW - 16, my = 50

    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(mx - 4, my - 4, meterW + 8, meterH + 28)

    ctx.fillStyle = '#333'
    ctx.fillRect(mx, my, meterW, meterH)

    const r = score / 100
    ctx.fillStyle = `hsl(${r * 120},100%,45%)`
    ctx.fillRect(mx, my, meterW * r, meterH)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${Math.round(score)}%`, mx + meterW / 2, my + meterH + 4)
    ctx.restore()
  }

  _renderPaused() {
    const ctx = this.ctx
    const cw = this.canvas.width, ch = this.canvas.height

    // Dim everything
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    ctx.fillRect(0, 0, cw, ch)

    ctx.restore()
  }

  _renderConfirmFlash() {
    const progress = Math.max(
      this._confirmMs / PM_CONFIG.CONFIRM_MS,
      this._perfectMatchMs / PM_CONFIG.PERFECT_ADVANCE_MS,
    )
    if (progress <= 0) return

    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(performance.now() / 95))

    ctx.save()
    ctx.fillStyle = `rgba(255,255,255,${0.025 + progress * 0.06 * pulse})`
    ctx.fillRect(0, 0, cw, ch)
    ctx.restore()
  }

  _renderSuccessFlash() {
    const progress = Math.max(0, this._successFlashMs / 350)
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = `rgba(100,255,160,${progress * 0.55})`
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.restore()
  }

  _renderGameOver() {
    const ctx = this.ctx
    const cw = this.canvas.width, ch = this.canvas.height

    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(this.engine.video, -cw, 0, cw, ch)
    ctx.restore()

    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillRect(0, 0, cw, ch)
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

  _showGameOverControls() {
    const parent = this.canvas.parentElement || document.body
    this._removeGameOverControls()

    const wrap = document.createElement('div')
    wrap.className = 'game-over-controls'

    const summary = document.createElement('div')
    summary.className = 'game-over-summary'
    summary.innerHTML = `
      <div class="game-over-title">GAME OVER</div>
      <div class="game-over-score">Final score: ${this.totalScore}</div>
      <div class="game-over-meta">${this.totalScore >= this.highScore ? 'New record' : `High score: ${this.highScore}`}</div>
    `

    const replayPanel = document.createElement('div')
    replayPanel.className = 'game-over-replay'
    replayPanel.innerHTML = `<div class="game-over-replay-label">Replay</div><div class="game-over-replay-loading">Preparing replay...</div>`

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
      return data.pose_mirror?.highScore || 0
    } catch { return 0 }
  }

  _saveScore() {
    try {
      const data = JSON.parse(localStorage.getItem('bodygame_scores') || '{}')
      if (!data.pose_mirror) data.pose_mirror = { highScore: 0, gamesPlayed: 0, lastPlayed: null }
      if (this.totalScore > data.pose_mirror.highScore) data.pose_mirror.highScore = this.totalScore
      data.pose_mirror.gamesPlayed = (data.pose_mirror.gamesPlayed || 0) + 1
      data.pose_mirror.lastPlayed = new Date().toISOString()
      localStorage.setItem('bodygame_scores', JSON.stringify(data))
      this.highScore = data.pose_mirror.highScore
    } catch {}
  }
}

window.PoseMirrorGame = PoseMirrorGame
