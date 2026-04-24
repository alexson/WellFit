/**
 * PoseEngine — MediaPipe PoseLandmarker wrapper
 * Shared by Pose Mirror and BodyWare games
 */

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task'

// ── Angle helper ──────────────────────────────────────────────────────────────

/**
 * Compute the angle (degrees) at vertex B formed by points A–B–C
 * @param {{x:number,y:number}} A
 * @param {{x:number,y:number}} B  vertex
 * @param {{x:number,y:number}} C
 * @returns {number} angle in degrees 0–180
 */
function angleBetweenThreePoints(A, B, C) {
  const BAx = A.x - B.x, BAy = A.y - B.y
  const BCx = C.x - B.x, BCy = C.y - B.y
  const dot = BAx * BCx + BAy * BCy
  const magBA = Math.hypot(BAx, BAy)
  const magBC = Math.hypot(BCx, BCy)
  if (magBA === 0 || magBC === 0) return 0
  return Math.acos(Math.min(1, Math.max(-1, dot / (magBA * magBC)))) * (180 / Math.PI)
}

// MediaPipe landmark index constants
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,     RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,     RIGHT_WRIST: 16,
  LEFT_HIP: 23,       RIGHT_HIP: 24,
  LEFT_KNEE: 25,      RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,     RIGHT_ANKLE: 28,
}

// Skeleton bone connections for drawing
const SKELETON_BONES = [
  // torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // left arm
  [11, 13], [13, 15],
  // right arm
  [12, 14], [14, 16],
  // left leg
  [23, 25], [25, 27],
  // right leg
  [24, 26], [26, 28],
  // head
  [0, 11], [0, 12],
]

// ── PoseEngine ────────────────────────────────────────────────────────────────

class PoseEngine {
  constructor(videoElement, canvasElement) {
    this.video = videoElement
    this.canvas = canvasElement
    this.ctx = canvasElement.getContext('2d')

    this._poseLandmarker = null
    this._rafId = null
    this._running = false
    this._lastTimestamp = 0
    this._lastVideoTime = -1
    this._lastDetectTimestamp = 0
    this._lostTimer = 0
    this._poseFound = false

    this._currentAngles = null
    this._currentKeypoints = null
    this._prevKeypoints = null

    this._listeners = { frame: [], lost: [], found: [] }
    this.baseline = null
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * @param {(progress: number) => void} [onProgress]
   *   Called with 0–1 as the model downloads. If Content-Length is unknown,
   *   called with -1 (indeterminate) on each chunk.
   */
  async init(onProgress = null) {
    const FilesetResolver = window.FilesetResolver
    const PoseLandmarker  = window.PoseLandmarker

    if (!FilesetResolver || !PoseLandmarker) {
      throw new Error('FilesetResolver / PoseLandmarker not found on window. Ensure the HTML imports them from the tasks-vision ES module before calling engine.init().')
    }

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
    )

    // Download model manually so we can report byte-level progress,
    // then hand the buffer directly to MediaPipe via modelAssetBuffer.
    const modelBuffer = await this._fetchWithProgress(MODEL_URL, onProgress)

    this._poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetBuffer: new Uint8Array(modelBuffer),
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    })
  }

  async _fetchWithProgress(url, onProgress) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Model fetch failed: ${response.status} ${response.statusText}`)

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0

    const reader = response.body.getReader()
    const chunks = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (onProgress) {
        onProgress(total > 0 ? received / total : -1)
      }
    }

    // Concatenate into a single ArrayBuffer
    const out = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
    return out.buffer
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  async startCamera() {
    const constraints = {
      video: {
        facingMode: 'user',
        frameRate: { ideal: 30 },
        // No width/height — let the camera use its native resolution
      },
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    this.video.srcObject = stream
    this.video.style.transform = 'scaleX(-1)'  // mirror for user-facing
    await this.video.play()

    // Wait for actual dimensions to be available
    await new Promise(resolve => {
      if (this.video.videoWidth > 0) { resolve(); return }
      this.video.addEventListener('loadedmetadata', resolve, { once: true })
    })

    // Resize canvas buffer to match camera.
    // Keep it sharp on high-DPI displays while capping total pixels for performance.
    const MAX_W = 1920
    const MAX_RENDER_PIXELS = 5_000_000
    let w = this.video.videoWidth  || 1280
    let h = this.video.videoHeight || 720
    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    let renderW = Math.round(w * dpr)
    let renderH = Math.round(h * dpr)

    const renderPixels = renderW * renderH
    if (renderPixels > MAX_RENDER_PIXELS) {
      const scale = Math.sqrt(MAX_RENDER_PIXELS / renderPixels)
      renderW = Math.max(1, Math.round(renderW * scale))
      renderH = Math.max(1, Math.round(renderH * scale))
    }

    this.canvas.width  = renderW
    this.canvas.height = renderH

    // Scale CSS to cover the full window (no black bars), centred
    this._coverFit()
    this._resizeHandler = () => this._coverFit()
    window.addEventListener('resize', this._resizeHandler)
  }

  /** Scale canvas CSS to cover the viewport while keeping the buffer aspect ratio. */
  _coverFit() {
    const camAR  = this.canvas.width / this.canvas.height
    const winW   = window.innerWidth
    const winH   = window.innerHeight
    const winAR  = winW / winH

    let cssW, cssH
    if (winAR >= camAR) {
      // Window is wider than camera → fit width, overflow height
      cssW = winW
      cssH = Math.ceil(winW / camAR)
    } else {
      // Window is taller than camera → fit height, overflow width
      cssH = winH
      cssW = Math.ceil(winH * camAR)
    }

    this.canvas.style.width  = cssW + 'px'
    this.canvas.style.height = cssH + 'px'
    // Remove aspect-ratio — we're setting explicit px dimensions
    this.canvas.style.aspectRatio = ''
  }

  // ── Loop ────────────────────────────────────────────────────────────────────

  start() {
    if (this._running) return
    this._running = true
    this._lastTimestamp = 0
    this._lastVideoTime = -1
    this._lastDetectTimestamp = 0
    this._rafId = requestAnimationFrame(ts => this._loop(ts))
  }

  stop() {
    this._running = false
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = null
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop())
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler)
    }
  }

  _loop(timestamp) {
    if (!this._running) return
    this._rafId = requestAnimationFrame(ts => this._loop(ts))

    if (!this.video.readyState || this.video.readyState < 2) return

    // Process only when a fresh camera frame is available.
    const videoTime = this.video.currentTime || 0
    if (videoTime === this._lastVideoTime) return

    // Prefer media timeline timestamp for stability across rAF timing quirks.
    let frameTimestamp = videoTime > 0 ? Math.round(videoTime * 1000) : Math.round(timestamp)
    if (!Number.isFinite(frameTimestamp)) frameTimestamp = Math.round(timestamp)

    // MediaPipe VIDEO mode requires strictly increasing timestamps.
    if (frameTimestamp <= this._lastDetectTimestamp) {
      frameTimestamp = this._lastDetectTimestamp + 1
    }

    const dt = this._lastTimestamp > 0 ? frameTimestamp - this._lastTimestamp : 16
    this._lastTimestamp = frameTimestamp
    this._lastVideoTime = videoTime

    let result
    try {
      result = this._poseLandmarker.detectForVideo(this.video, frameTimestamp)
      this._lastDetectTimestamp = frameTimestamp
    } catch (e) {
      return
    }

    this._processFrame(result, dt)
  }

  // ── Frame processing ────────────────────────────────────────────────────────

  _processFrame(result, dt = 16) {
    const hasPose = result.landmarks && result.landmarks.length > 0

    // Lost / found events
    if (!hasPose) {
      this._lostTimer += dt
      if (this._lostTimer > 500 && this._poseFound) {
        this._poseFound = false
        this._emit('lost')
      }
      this._currentAngles = null
      this._currentKeypoints = null
      return
    }

    if (!this._poseFound) {
      this._poseFound = true
      this._lostTimer = 0
      this._emit('found')
    }
    this._lostTimer = 0

    const kp = result.landmarks[0]
    this._currentKeypoints = kp

    // Compute angles
    const angles = this._computeAngles(kp, dt)
    this._currentAngles = angles
    this._prevKeypoints = kp

    this._emit('frame', angles, kp)
  }

  _computeAngles(kp, dt) {
    const lm = (i) => kp[i]

    // Joint angles
    const elbow_L   = angleBetweenThreePoints(lm(11), lm(13), lm(15))
    const elbow_R   = angleBetweenThreePoints(lm(12), lm(14), lm(16))
    const shoulder_L = angleBetweenThreePoints(lm(23), lm(11), lm(13))
    const shoulder_R = angleBetweenThreePoints(lm(24), lm(12), lm(14))
    const hip_L     = angleBetweenThreePoints(lm(11), lm(23), lm(25))
    const hip_R     = angleBetweenThreePoints(lm(12), lm(24), lm(26))
    const knee_L    = angleBetweenThreePoints(lm(23), lm(25), lm(27))
    const knee_R    = angleBetweenThreePoints(lm(24), lm(26), lm(28))

    // Spine: shoulder midpoint vs hip midpoint vs vertical
    const shoulderMid = { x: (lm(11).x + lm(12).x) / 2, y: (lm(11).y + lm(12).y) / 2 }
    const hipMid      = { x: (lm(23).x + lm(24).x) / 2, y: (lm(23).y + lm(24).y) / 2 }
    const verticalUp  = { x: hipMid.x, y: hipMid.y - 1 }
    const spine = angleBetweenThreePoints(shoulderMid, hipMid, verticalUp)

    // Neck: nose vs shoulder midpoint vs vertical
    const verticalUpShoulder = { x: shoulderMid.x, y: shoulderMid.y - 1 }
    const neck = angleBetweenThreePoints(lm(0), shoulderMid, verticalUpShoulder)

    // Wrist heights relative to nose (normalised)
    const wrist_L_height = lm(15).y - lm(0).y
    const wrist_R_height = lm(16).y - lm(0).y

    // Hip center x
    const hip_center_x = hipMid.x

    // Total motion vs previous frame
    let total_motion = 0
    if (this._prevKeypoints) {
      for (let i = 0; i < kp.length; i++) {
        const dx = kp[i].x - this._prevKeypoints[i].x
        const dy = kp[i].y - this._prevKeypoints[i].y
        total_motion += Math.hypot(dx, dy) * 640  // convert to ~px
      }
    }

    return {
      elbow_L, elbow_R,
      shoulder_L, shoulder_R,
      hip_L, hip_R,
      knee_L, knee_R,
      spine, neck,
      wrist_L_height, wrist_R_height,
      hip_center_x,
      total_motion,
    }
  }

  // ── Public accessors ────────────────────────────────────────────────────────

  getAngles() { return this._currentAngles }
  getKeypoints() { return this._currentKeypoints }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  _drawBodyBlob(ctx, points, cw, ch, lineW, jointR, color) {
    const px = (p) => (1 - p.x) * cw
    const py = (p) => p.y * ch
    const vis = (p) => p && (p.visibility || 0) >= 0.3

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = lineW
    ctx.strokeStyle = color
    ctx.fillStyle = color

    // Fill head triangle (nose → left shoulder → right shoulder)
    if ([0, 11, 12].every(i => vis(points[i]))) {
      ctx.beginPath()
      ctx.moveTo(px(points[0]),  py(points[0]))
      ctx.lineTo(px(points[11]), py(points[11]))
      ctx.lineTo(px(points[12]), py(points[12]))
      ctx.closePath()
      ctx.fill()
    }

    // Fill the torso quad so the centre doesn't have a hole
    if ([11, 12, 24, 23].every(i => vis(points[i]))) {
      ctx.beginPath()
      ctx.moveTo(px(points[11]), py(points[11]))
      ctx.lineTo(px(points[12]), py(points[12]))
      ctx.lineTo(px(points[24]), py(points[24]))
      ctx.lineTo(px(points[23]), py(points[23]))
      ctx.closePath()
      ctx.fill()
    }

    for (const [a, b] of SKELETON_BONES) {
      const pa = points[a], pb = points[b]
      if (!vis(pa) || !vis(pb)) continue
      ctx.beginPath()
      ctx.moveTo(px(pa), py(pa))
      ctx.lineTo(px(pb), py(pb))
      ctx.stroke()
    }

    for (const idx of [0,11,12,13,14,15,16,23,24,25,26,27,28]) {
      const p = points[idx]
      if (!vis(p)) continue
      ctx.beginPath()
      ctx.arc(px(p), py(p), jointR, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  /**
   * Draws a solid outline around the player's body, then composites the actual
   * camera image back on top so the face is never blocked.
   *
   * A separate "visual" copy of the keypoints is used for rendering, with the
   * head point (nose) shifted upward so the outline sits higher on the head.
   */
  drawPlayerWithOutline(ctx) {
    const points = this._currentKeypoints
    if (!points) return

    const cw = ctx.canvas.width
    const ch = ctx.canvas.height

    // Build visual keypoint copy with nose Y shifted upward
    const visualKp = points.slice()
    const nose = points[0]
    if (nose) {
      const lSh = points[11], rSh = points[12]
      const shY = (lSh && rSh) ? (lSh.y + rSh.y) / 2 : nose.y + 0.2
      const offset = Math.abs(shY - nose.y) * 0.45
      visualKp[0] = { ...nose, y: nose.y - offset }
    }

    // Ensure offscreen canvases match current resolution
    if (!this._maskCanvas || this._maskCanvas.width !== cw || this._maskCanvas.height !== ch) {
      this._maskCanvas = document.createElement('canvas')
      this._maskCanvas.width = cw
      this._maskCanvas.height = ch
      this._playerCanvas = document.createElement('canvas')
      this._playerCanvas.width = cw
      this._playerCanvas.height = ch
    }

    // 1. Draw outer blob (outline colour) on main canvas
    this._drawBodyBlob(ctx, visualKp, cw, ch, 54, 27, 'rgba(160, 230, 255, 0.85)')

    // 2. Build solid body mask (slightly smaller = inner edge of outline)
    const mctx = this._maskCanvas.getContext('2d')
    mctx.clearRect(0, 0, cw, ch)
    this._drawBodyBlob(mctx, visualKp, cw, ch, 44, 22, '#ffffff')

    // 3. Build masked player image: video clipped to the body mask
    const pctx = this._playerCanvas.getContext('2d')
    pctx.clearRect(0, 0, cw, ch)
    pctx.save()
    pctx.scale(-1, 1)
    pctx.drawImage(this.video, -cw, 0, cw, ch)
    pctx.restore()
    pctx.globalCompositeOperation = 'destination-in'
    pctx.drawImage(this._maskCanvas, 0, 0)
    pctx.globalCompositeOperation = 'source-over'

    // 4. Composite masked player image on top — covers the cyan fill, leaving
    //    only the outer ring visible as the outline
    ctx.drawImage(this._playerCanvas, 0, 0)
  }

  drawPlayerStar(ctx, kp = null) {
    const points = kp || this._currentKeypoints
    if (!points) return
    const nose = points[0]
    if (!nose || (nose.visibility || 0) < 0.3) return

    const cw = ctx.canvas.width
    const ch = ctx.canvas.height
    const x = (1 - nose.x) * cw
    const y = nose.y * ch - ch * 0.09
    const outerR = ch * 0.032
    const innerR = outerR * 0.42
    const xScale = 0.72   // squish horizontally to bring lower points together

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(xScale, 1)
    ctx.shadowBlur = 18
    ctx.shadowColor = '#FFD700'
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2
      const r = i % 2 === 0 ? outerR : innerR
      if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r)
      else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  drawSkeleton(ctx, color = '#ffffff', alpha = 1, kp = null) {
    const points = kp || this._currentKeypoints
    if (!points) return

    const cw = ctx.canvas.width
    const ch = ctx.canvas.height

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 6
    ctx.shadowBlur = 10
    ctx.shadowColor = color

    // Bones
    for (const [a, b] of SKELETON_BONES) {
      const pa = points[a], pb = points[b]
      if (!pa || !pb) continue
      if ((pa.visibility || 0) < 0.3 || (pb.visibility || 0) < 0.3) continue
      ctx.beginPath()
      ctx.moveTo((1 - pa.x) * cw, pa.y * ch)  // mirrored x
      ctx.lineTo((1 - pb.x) * cw, pb.y * ch)
      ctx.stroke()
    }

    // Joints
    for (const [idx] of [[0],[11],[12],[13],[14],[15],[16],[23],[24],[25],[26],[27],[28]]) {
      const p = points[idx]
      if (!p || (p.visibility || 0) < 0.3) continue
      ctx.beginPath()
      ctx.arc((1 - p.x) * cw, p.y * ch, 9, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  /**
   * Reconstruct and draw a ghost skeleton from angle data.
   * We use a simplified 2D forward-kinematics approach rooted at hip center.
   */
  drawTargetSkeleton(ctx, targetAngles, color = '#aa44ff', alpha = 0.5, options = {}) {
    if (!targetAngles) return

    const cw = ctx.canvas.width
    const ch = ctx.canvas.height
    const degToRad = (deg) => deg * Math.PI / 180

    // Use a normalized body model: root position and size can be customized.
    const scale = ch * (options.scaleRatio ?? 0.35)  // body height in pixels
    // Clamp rootX so the right arm (approx scale*0.85 to the right) stays within the canvas
    const rootX = Math.min(cw * (options.anchorX ?? 0.5), cw - scale * 0.85)
    const rootY = ch * (options.anchorY ?? 0.6)

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 4
    ctx.lineCap = 'round'

    const joint = (x, y, r = 7) => {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const drawBone = (x1, y1, x2, y2) => {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    const endPoint = (x, y, angleRad, len) => ({
      x: x + Math.cos(angleRad) * len,
      y: y + Math.sin(angleRad) * len,
    })

    // Body segments lengths (fraction of scale)
    const torsoLen  = scale * 0.45
    const headLen   = scale * 0.18
    const upperArm  = scale * 0.28
    const foreArm   = scale * 0.26
    const upperLeg  = scale * 0.35
    const lowerLeg  = scale * 0.33

    // Torso — spine angle offsets from vertical
    const spineOffset = (targetAngles.spine || 90) - 90
    const hipCx = rootX, hipCy = rootY

    joint(hipCx, hipCy, 8)

    // Hips (left/right)
    const avgHipAngle = (
      (targetAngles.hip_L ?? 175) +
      (targetAngles.hip_R ?? 175)
    ) / 2
    const hipOpenRatio = Math.max(0, Math.min(1, (175 - avgHipAngle) / 25))
    const hipSpread = scale * 0.12
    const lHipX = hipCx - hipSpread, lHipY = hipCy
    const rHipX = hipCx + hipSpread, rHipY = hipCy

    // Shoulders
    const shoulderY = hipCy - torsoLen
    const shoulderSpread = scale * 0.18
    const lShX = hipCx - shoulderSpread, lShY = shoulderY
    const rShX = hipCx + shoulderSpread, rShY = shoulderY

    // Draw torso
    ctx.beginPath()
    ctx.moveTo(lHipX, lHipY)
    ctx.lineTo(rHipX, rHipY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(lHipX, lHipY)
    ctx.lineTo(lShX, lShY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(rHipX, rHipY)
    ctx.lineTo(rShX, rShY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(lShX, lShY)
    ctx.lineTo(rShX, rShY)
    ctx.stroke()

    joint(lShX, lShY)
    joint(rShX, rShY)
    joint(lHipX, lHipY)
    joint(rHipX, rHipY)

    // Head
    ctx.beginPath()
    ctx.arc(hipCx - shoulderSpread / 2 * spineOffset / 90, shoulderY - headLen * 0.7, headLen * 0.5, 0, Math.PI * 2)
    ctx.stroke()

    // Left arm: shoulder angle is measured between torso-down and upper arm.
    const shoulderLAngle = targetAngles.shoulder_L || 90
    const elbowLAngle = targetAngles.elbow_L || 160
    const shoulderRAngle = targetAngles.shoulder_R || 90
    const elbowRAngle = targetAngles.elbow_R || 160
    const overheadHandsJoined = shoulderLAngle >= 160 && shoulderRAngle >= 160 && elbowLAngle >= 170 && elbowRAngle >= 170
    const joinedWristY = shoulderY - upperArm - foreArm + scale * 0.05
    const joinedWrist = { x: hipCx, y: joinedWristY }
    const armSplit = upperArm / (upperArm + foreArm)

    const lUpperArmRad = degToRad(90 + shoulderLAngle)
    const lElbow = overheadHandsJoined
      ? {
        x: lShX + (joinedWrist.x - lShX) * armSplit,
        y: lShY + (joinedWrist.y - lShY) * armSplit,
      }
      : endPoint(lShX, lShY, lUpperArmRad, upperArm)
    drawBone(lShX, lShY, lElbow.x, lElbow.y)
    joint(lElbow.x, lElbow.y)

    const lForearmRad = lUpperArmRad + degToRad(elbowLAngle - 180)
    const lWrist = overheadHandsJoined
      ? joinedWrist
      : endPoint(lElbow.x, lElbow.y, lForearmRad, foreArm)
    drawBone(lElbow.x, lElbow.y, lWrist.x, lWrist.y)
    joint(lWrist.x, lWrist.y, 5)

    // Right arm mirrors the left arm mapping.
    const rUpperArmRad = degToRad(90 - shoulderRAngle)
    const rElbow = overheadHandsJoined
      ? {
        x: rShX + (joinedWrist.x - rShX) * armSplit,
        y: rShY + (joinedWrist.y - rShY) * armSplit,
      }
      : endPoint(rShX, rShY, rUpperArmRad, upperArm)
    drawBone(rShX, rShY, rElbow.x, rElbow.y)
    joint(rElbow.x, rElbow.y)

    const rForearmRad = rUpperArmRad - degToRad(elbowRAngle - 180)
    const rWrist = overheadHandsJoined
      ? joinedWrist
      : endPoint(rElbow.x, rElbow.y, rForearmRad, foreArm)
    drawBone(rElbow.x, rElbow.y, rWrist.x, rWrist.y)
    joint(rWrist.x, rWrist.y, 5)

    // Hip angle is measured between torso-up and upper leg.
    const legCenterBias = (1 - hipOpenRatio) * scale * 0.08

    const hipLAngle = targetAngles.hip_L || 170
    const kneeLAngle = targetAngles.knee_L || 170
    const lUpperLegRad = degToRad(270 - hipLAngle)
    const lKnee = endPoint(lHipX, lHipY, lUpperLegRad, upperLeg)
    lKnee.x += legCenterBias
    drawBone(lHipX, lHipY, lKnee.x, lKnee.y)
    joint(lKnee.x, lKnee.y)

    const lLowerLegRad = lUpperLegRad + degToRad(180 - kneeLAngle)
    const lAnkle = endPoint(lKnee.x, lKnee.y, lLowerLegRad, lowerLeg)
    lAnkle.x += legCenterBias
    drawBone(lKnee.x, lKnee.y, lAnkle.x, lAnkle.y)
    joint(lAnkle.x, lAnkle.y, 5)

    const hipRAngle = targetAngles.hip_R || 170
    const kneeRAngle = targetAngles.knee_R || 170
    const rUpperLegRad = degToRad(hipRAngle - 90)
    const rKnee = endPoint(rHipX, rHipY, rUpperLegRad, upperLeg)
    rKnee.x -= legCenterBias
    drawBone(rHipX, rHipY, rKnee.x, rKnee.y)
    joint(rKnee.x, rKnee.y)

    const rLowerLegRad = rUpperLegRad - degToRad(180 - kneeRAngle)
    const rAnkle = endPoint(rKnee.x, rKnee.y, rLowerLegRad, lowerLeg)
    rAnkle.x -= legCenterBias
    drawBone(rKnee.x, rKnee.y, rAnkle.x, rAnkle.y)
    joint(rAnkle.x, rAnkle.y, 5)

    ctx.restore()
  }

  // ── Calibration ─────────────────────────────────────────────────────────────

  async calibrate(durationMs = 3000) {
    return new Promise((resolve) => {
      const samples = []
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        this._listeners.frame = this._listeners.frame.filter(h => h !== handler)

        const fallbackKp = this._currentKeypoints
        const fallbackSample = fallbackKp ? {
          noseY: fallbackKp[0].y,
          hipY: (fallbackKp[23].y + fallbackKp[24].y) / 2,
          shoulderWidth: Math.abs(fallbackKp[11].x - fallbackKp[12].x),
          hipCenterX: (fallbackKp[23].x + fallbackKp[24].x) / 2,
        } : {
          noseY: 0.2,
          hipY: 0.55,
          shoulderWidth: 0.18,
          hipCenterX: 0.5,
        }

        const source = samples.length ? samples : [fallbackSample]
        const avg = (key) => source.reduce((s, x) => s + x[key], 0) / source.length
        const baseline = {
          noseY: avg('noseY'),
          standingHipY: avg('hipY'),
          shoulderWidth: avg('shoulderWidth'),
          hipCenterX: avg('hipCenterX'),
        }
        this.baseline = baseline
        resolve(baseline)
      }

      const handler = (angles, kp) => {
        if (!kp) return
        samples.push({
          noseY: kp[0].y,
          hipY: (kp[23].y + kp[24].y) / 2,
          shoulderWidth: Math.abs(kp[11].x - kp[12].x),
          hipCenterX: (kp[23].x + kp[24].x) / 2,
        })
      }

      this._listeners.frame.push(handler)
      setTimeout(finish, durationMs)
    })
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  on(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].push(callback)
    }
  }

  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(h => h !== callback)
    }
  }

  _emit(event, ...args) {
    ;(this._listeners[event] || []).forEach(fn => fn(...args))
  }
}

window.PoseEngine = PoseEngine
window.angleBetweenThreePoints = angleBetweenThreePoints
