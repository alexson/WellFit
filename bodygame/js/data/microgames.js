/**
 * Microgame definitions for BodyWare
 * Each microgame is a plain object with check() returning true = WIN
 */

const MICROGAMES = [

  // ── DUCK ──────────────────────────────────────────────────────────────────
  {
    id: 'duck',
    instruction: { en: 'DUCK!' },
    hint: { en: 'Duck before the flying obstacle hits you' },
    timeMs: 3600,
    scene: 'duck',
    _heldMs: 0,
    _collided: false,
    reset() {
      this._heldMs = 0
      this._collided = false
    },
    check(angles, kp, baseline, elapsed, dt) {
      const progress = Math.min(1, elapsed / 3000)
      const obstacleCenterX = 1 - progress - (40 / 1280)
      const obstacle = {
        left: obstacleCenterX - (60 / 1280),
        right: obstacleCenterX + (60 / 1280),
        top: 0.3 - (25 / 720),
        bottom: 0.3 + (25 / 720),
      }

      const xs = [1 - kp[11].x, 1 - kp[12].x, 1 - kp[13].x, 1 - kp[14].x, 1 - kp[0].x]
      const shoulderY = (kp[11].y + kp[12].y) / 2
      const upperBody = {
        left: Math.min(...xs) - 0.03,
        right: Math.max(...xs) + 0.03,
        top: Math.min(kp[0].y, shoulderY, kp[13].y, kp[14].y) - 0.03,
        bottom: Math.max(shoulderY, kp[13].y, kp[14].y) + 0.03,
      }

      const overlaps =
        obstacle.left < upperBody.right &&
        obstacle.right > upperBody.left &&
        obstacle.top < upperBody.bottom &&
        obstacle.bottom > upperBody.top

      if (overlaps) this._collided = true
      if (this._collided) return false
      return progress >= 1
    },
  },

  // ── PULL ──────────────────────────────────────────────────────────────────
  {
    id: 'pull',
    instruction: { en: 'PULL!' },
    hint: { en: 'Use either hand: hit the top dot, then pull straight down to the lower dot' },
    timeMs: 3500,
    scene: 'pull',
    _phase: 'reach',
    _activeHand: null,
    _topDot: null,
    _bottomDot: null,
    reset() {
      const x = 0.26 + Math.random() * 0.48
      const yTop = 0.16 + Math.random() * 0.1
      const yBottom = Math.min(0.78, yTop + 0.36)
      this._phase = 'reach'
      this._activeHand = null
      this._topDot = { x, y: yTop }
      this._bottomDot = { x, y: yBottom }
    },
    check(angles, kp) {
      if (!this._topDot || !this._bottomDot) this.reset()

      const left = { x: 1 - kp[15].x, y: kp[15].y }
      const right = { x: 1 - kp[16].x, y: kp[16].y }
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

      if (this._phase === 'reach') {
        const leftDist = dist(left, this._topDot)
        const rightDist = dist(right, this._topDot)
        const hitRadius = 0.1
        if (leftDist <= hitRadius || rightDist <= hitRadius) {
          this._activeHand = leftDist <= rightDist ? 'left' : 'right'
          this._phase = 'pull'
        }
        return false
      }

      const hand = this._activeHand === 'right' ? right : left
      const laneTolerance = 0.14
      const followsDownArrow = Math.abs(hand.x - this._topDot.x) <= laneTolerance
      const movedDown = hand.y > this._topDot.y + 0.1
      const reachedBottomDot = dist(hand, this._bottomDot) <= 0.11
      return followsDownArrow && movedDown && reachedBottomDot
    },
  },

  // ── PUNCH ─────────────────────────────────────────────────────────────────
  {
    id: 'punch',
    instruction: { en: 'PUNCH!' },
    hint: { en: 'Quickly jab all 3 red targets' },
    timeMs: 4500,
    scene: 'punch',
    _prevWrist: null,
    _targetsCleared: 0,
    _target: null,
    _targetIndex: 0,
    reset() {
      this._prevWrist = null
      this._targetsCleared = 0
      this._targetIndex = 0
      this._target = null
    },
    _spawnTarget(kp) {
      const visible = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26].filter((idx) => kp[idx])
      const xs = visible.map((idx) => 1 - kp[idx].x)
      const ys = visible.map((idx) => kp[idx].y)
      const bodyBox = {
        left: Math.max(0.08, Math.min(...xs) - 0.12),
        right: Math.min(0.92, Math.max(...xs) + 0.12),
        top: Math.max(0.14, Math.min(...ys) - 0.08),
        bottom: Math.min(0.82, Math.max(...ys) + 0.08),
      }

      for (let tries = 0; tries < 18; tries++) {
        const candidate = {
          x: 0.14 + Math.random() * 0.72,
          y: 0.16 + Math.random() * 0.42,
          radius: 0.11,
        }
        const outsideBody =
          candidate.x < bodyBox.left ||
          candidate.x > bodyBox.right ||
          candidate.y < bodyBox.top ||
          candidate.y > bodyBox.bottom
        if (outsideBody) return candidate
      }

      const leftSpace = bodyBox.left - 0.08
      const rightSpace = 0.92 - bodyBox.right
      const spawnLeft = rightSpace < leftSpace
      return {
        x: spawnLeft ? Math.max(0.14, bodyBox.left * 0.55) : Math.min(0.86, bodyBox.right + 0.12),
        y: Math.max(0.18, bodyBox.top + (bodyBox.bottom - bodyBox.top) * 0.25),
        radius: 0.11,
      }
    },
    check(angles, kp) {
      if (!this._target) this._target = this._spawnTarget(kp)
      const target = this._target
      if (!target) return true
      const wrists = [
        { x: 1 - kp[15].x, y: kp[15].y },
        { x: 1 - kp[16].x, y: kp[16].y },
      ]
      let hit = false

      for (const wrist of wrists) {
        const dx = wrist.x - target.x
        const dy = wrist.y - target.y
        const dist = Math.hypot(dx, dy)
        const speed = this._prevWrist ? Math.hypot(wrist.x - this._prevWrist.x, wrist.y - this._prevWrist.y) : 0
        this._prevWrist = wrist
        if (dist <= target.radius && speed > 0.035) {
          hit = true
          break
        }
      }
      if (!hit) return false
      this._targetsCleared += 1
      this._targetIndex = this._targetsCleared
      this._prevWrist = null
      this._target = this._targetsCleared >= 3 ? null : this._spawnTarget(kp)
      return this._targetsCleared >= 3
    },
  },

  // ── SLASH ─────────────────────────────────────────────────────────────────
  {
    id: 'slash',
    instruction: { en: 'SLASH!' },
    hint: { en: 'Use both hands and follow the arrow line direction' },
    timeMs: 3200,
    scene: 'slash',
    _direction: 'uldr',
    _prevLeft: null,
    _prevRight: null,
    _prevMid: null,
    reset() {
      const dirs = ['urdl', 'uldr']
      this._direction = dirs[Math.floor(Math.random() * dirs.length)]
      this._prevLeft = null
      this._prevRight = null
      this._prevMid = null
    },
    getInstruction() {
      const map = {
        urdl: 'SLASH ↙',
        uldr: 'SLASH ↘',
      }
      return map[this._direction] || 'SLASH!'
    },
    check(angles, kp) {
      const left = { x: 1 - kp[15].x, y: kp[15].y }
      const right = { x: 1 - kp[16].x, y: kp[16].y }
      const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
      if (!this._prevMid || !this._prevLeft || !this._prevRight) {
        this._prevLeft = left
        this._prevRight = right
        this._prevMid = mid
        return false
      }

      const leftDelta = { x: left.x - this._prevLeft.x, y: left.y - this._prevLeft.y }
      const rightDelta = { x: right.x - this._prevRight.x, y: right.y - this._prevRight.y }
      const delta = { x: mid.x - this._prevMid.x, y: mid.y - this._prevMid.y }
      this._prevLeft = left
      this._prevRight = right
      this._prevMid = mid

      const leftSpeed = Math.hypot(leftDelta.x, leftDelta.y)
      const rightSpeed = Math.hypot(rightDelta.x, rightDelta.y)
      const bothHandsMoving = leftSpeed > 0.035 && rightSpeed > 0.035
      if (!bothHandsMoving) return false

      const speed = Math.hypot(delta.x, delta.y)
      if (speed <= 0.05) return false

      const nx = delta.x / speed
      const ny = delta.y / speed
      const directionVectors = {
        urdl: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
        uldr: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      }
      const target = directionVectors[this._direction] || directionVectors.uldr
      const alignment = nx * target.x + ny * target.y
      const leftAlignment = (leftDelta.x / leftSpeed) * target.x + (leftDelta.y / leftSpeed) * target.y
      const rightAlignment = (rightDelta.x / rightSpeed) * target.x + (rightDelta.y / rightSpeed) * target.y
      return alignment > 0.86 && leftAlignment > 0.78 && rightAlignment > 0.78
    },
  },

  // ── MIRROR ────────────────────────────────────────────────────────────────
  {
    id: 'mirror',
    instruction: { en: 'MIRROR!' },
    hint: { en: 'Do a T-pose: both arms straight out to the sides and hold briefly' },
    timeMs: 5000,
    scene: 'mirror',
    _heldMs: 0,
    reset() { this._heldMs = 0 },
    check(angles, kp, baseline, elapsed, dt) {
      const leftShoulder = { x: 1 - kp[11].x, y: kp[11].y }
      const rightShoulder = { x: 1 - kp[12].x, y: kp[12].y }
      const leftWrist = { x: 1 - kp[15].x, y: kp[15].y }
      const rightWrist = { x: 1 - kp[16].x, y: kp[16].y }

      const shoulderWidth = Math.max(0.08, Math.abs(rightShoulder.x - leftShoulder.x))
      const shoulderLevel = Math.abs(leftShoulder.y - rightShoulder.y) < 0.04
      const elbowsStraight = angles.elbow_L > 145 && angles.elbow_R > 145

      const leftArmHorizontal =
        leftWrist.x < leftShoulder.x - shoulderWidth * 0.6 &&
        Math.abs(leftWrist.y - leftShoulder.y) < 0.11
      const rightArmHorizontal =
        rightWrist.x > rightShoulder.x + shoulderWidth * 0.6 &&
        Math.abs(rightWrist.y - rightShoulder.y) < 0.11

      const wristSpan = Math.abs(rightWrist.x - leftWrist.x)
      const wideSpan = wristSpan > shoulderWidth * 2.3

      const isTPose = shoulderLevel && elbowsStraight && leftArmHorizontal && rightArmHorizontal && wideSpan
      if (isTPose) {
        this._heldMs += dt
      } else {
        this._heldMs = 0
      }
      return this._heldMs >= 380
    },
  },

  // ── CONDUCT ───────────────────────────────────────────────────────────────
  {
    id: 'conduct',
    instruction: { en: 'CONDUCT!' },
    hint: { en: 'Wave both hands up and down 3 times' },
    timeMs: 7000,
    scene: 'conduct',
    _L: { dir: 0, reversals: 0, prevY: null },
    _R: { dir: 0, reversals: 0, prevY: null },
    _cycles: 0,
    _reactionMs: 0,
    reset() {
      this._L = { dir: 0, reversals: 0, prevY: null }
      this._R = { dir: 0, reversals: 0, prevY: null }
      this._cycles = 0
      this._reactionMs = 0
    },
    check(angles, kp, baseline, elapsed, dt) {
      if (this._reactionMs > 0) this._reactionMs = Math.max(0, this._reactionMs - dt)
      for (const [side, idx] of [['_L', 15], ['_R', 16]]) {
        const wristY = kp[idx].y
        const state = this[side]
        if (state.prevY !== null) {
          const delta = wristY - state.prevY
          if (Math.abs(delta) < 0.01) {
            state.prevY = wristY
            continue
          }
          const newDir = wristY < state.prevY ? -1 : 1
          if (newDir !== state.dir && state.dir !== 0) state.reversals++
          state.dir = newDir
        }
        state.prevY = wristY
      }
      const completed = Math.min(
        Math.floor(this._L.reversals / 2),
        Math.floor(this._R.reversals / 2)
      )
      if (completed > this._cycles) {
        this._cycles = completed
        this._reactionMs = 520
      }
      return this._cycles >= 3
    },
  },

  // ── LEAN ──────────────────────────────────────────────────────────────────
  {
    id: 'lean',
    instruction: { en: 'LEAN!' },
    hint: { en: 'Tilt your body toward the arrow' },
    timeMs: 3000,
    scene: 'lean',
    _direction: null,
    reset() { this._direction = Math.random() > 0.5 ? 'left' : 'right' },
    getInstruction() {
      const dir = this._direction
      if (!dir) return 'LEAN!'
      return dir === 'left' ? 'LEAN LEFT!' : 'LEAN RIGHT!'
    },
    check(angles, kp) {
      if (!this._direction) this._direction = 'left'
      const leftShoulder = kp[11], rightShoulder = kp[12]
      const shoulderTilt = leftShoulder.y - rightShoulder.y  // + = left lower
      if (this._direction === 'left') return shoulderTilt > 0.06
      return shoulderTilt < -0.06
    },
  },

  // ── FREEZE ────────────────────────────────────────────────────────────────
  // ── CATCH ─────────────────────────────────────────────────────────────────
  {
    id: 'catch',
    instruction: { en: 'CATCH!' },
    hint: { en: 'Catch the falling ball with both hands together' },
    timeMs: 4000,
    scene: 'catch',
    _heldMs: 0,
    reset() { this._heldMs = 0 },
    check(angles, kp, baseline, elapsed, dt) {
      const progress = Math.min(1, elapsed / 2200)
      const ball = { x: 0.5, y: 0.1 + progress * 0.55, radius: 0.12 }
      const wrists = [
        { x: 1 - kp[15].x, y: kp[15].y },
        { x: 1 - kp[16].x, y: kp[16].y },
      ]
      const touched = wrists.every((wrist) => Math.hypot(wrist.x - ball.x, wrist.y - ball.y) <= ball.radius)
      if (touched) {
        this._heldMs += dt
      } else {
        this._heldMs = 0
      }
      return this._heldMs >= 200
    },
  },

  // ── FREEZE ────────────────────────────────────────────────────────────────
  {
    id: 'freeze',
    instruction: { en: 'FREEZE!' },
    hint: { en: 'Pull both hands in front of your chest and hold' },
    timeMs: 5000,
    scene: 'freeze',
    _frozenMs: 0,
    reset() { this._frozenMs = 0 },
    check(angles, kp, baseline, elapsed, dt) {
      const shoulderMidX = (kp[11].x + kp[12].x) / 2
      const shoulderMidY = (kp[11].y + kp[12].y) / 2
      const hipMidY = (kp[23].y + kp[24].y) / 2
      const torsoHeight = Math.max(0.12, hipMidY - shoulderMidY)
      const shoulderWidth = Math.max(0.08, Math.abs(kp[11].x - kp[12].x))
      const chestY = shoulderMidY + torsoHeight * 0.35
      const leftHandIn =
        Math.abs(kp[15].x - shoulderMidX) < shoulderWidth * 1.05 &&
        Math.abs(kp[15].y - chestY) < torsoHeight * 0.75
      const rightHandIn =
        Math.abs(kp[16].x - shoulderMidX) < shoulderWidth * 1.05 &&
        Math.abs(kp[16].y - chestY) < torsoHeight * 0.75
      const bothHandsIn = leftHandIn && rightHandIn
      const lowMotion = angles.total_motion < 42

      if (bothHandsIn && lowMotion) {
        this._frozenMs += dt
      } else {
        this._frozenMs = 0
      }
      return this._frozenMs >= 320
    },
  },

]

window.MICROGAMES = MICROGAMES
