"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { detectPinch, getPinchPoint, PointSmoother, type Point } from "@/lib/hand-tracking"
import { renderStrokes, type Stroke, type ToolMode } from "@/lib/strokes"
import { StatusHud, type TrackingStatus } from "@/components/status-hud"
import { Toolbar, PALETTE } from "@/components/toolbar"

const MIN_POINT_DISTANCE = 0.004 // normalized — skip micro-jitter points

export function AirCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Hot-loop state kept in refs to avoid per-frame re-renders
  const strokesRef = useRef<Stroke[]>([])
  const currentStrokeRef = useRef<Stroke | null>(null)
  const pinchingRef = useRef(false)
  const smootherRef = useRef(new PointSmoother(0.45))
  const settingsRef = useRef<{ color: string; size: number; tool: ToolMode }>({
    color: PALETTE[0],
    size: 8,
    tool: "draw",
  })
  const statusRef = useRef<TrackingStatus>("loading")

  const [status, setStatus] = useState<TrackingStatus>("loading")
  const [color, setColor] = useState<string>(PALETTE[0])
  const [brushSize, setBrushSize] = useState(8)
  const [tool, setTool] = useState<ToolMode>("draw")
  const [canUndo, setCanUndo] = useState(false)
  const [showVideo, setShowVideo] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  const handleRetry = useCallback(() => {
    setErrorMessage(null)
    statusRef.current = "loading"
    setStatus("loading")
    setRetryToken((t) => t + 1)
  }, [])

  // Keep the hot loop in sync with UI state without re-creating the loop
  useEffect(() => {
    settingsRef.current = { color, size: brushSize, tool }
  }, [color, brushSize, tool])

  const updateStatus = useCallback((next: TrackingStatus) => {
    if (statusRef.current !== next) {
      statusRef.current = next
      setStatus(next)
    }
  }, [])

  const repaint = useCallback(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const all = currentStrokeRef.current
      ? [...strokesRef.current, currentStrokeRef.current]
      : strokesRef.current
    renderStrokes(ctx, all, canvas.width, canvas.height)
  }, [])

  // Main setup: camera + hand tracking + render loop
  useEffect(() => {
    let cancelled = false
    let rafId = 0
    let stream: MediaStream | null = null
    let landmarker: import("@mediapipe/tasks-vision").HandLandmarker | null = null
    let lastVideoTime = -1

    async function init() {
      const video = videoRef.current
      if (!video) return

      try {
        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision")
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        )
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        })

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        })
        if (cancelled) return
        video.srcObject = stream
        await video.play()
        updateStatus("no-hand")
        rafId = requestAnimationFrame(loop)
      } catch (err) {
        console.log("[v0] Init error:", err)
        if (!cancelled) {
          updateStatus("error")
          setErrorMessage(
            err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
              ? "Camera access was denied. Click the camera icon in your browser's address bar (or check site permissions), allow the camera, then press Try again."
              : "Could not start the camera or hand tracking. Check that a webcam is connected and not in use by another app, then press Try again."
          )
        }
      }
    }

    function drawCursor(point: Point | null, pinching: boolean) {
      const canvas = cursorCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!point) return

      const x = point.x * canvas.width
      const y = point.y * canvas.height
      const { color: c, size, tool: t } = settingsRef.current
      const r = Math.max(6, size * (canvas.width / 1000) * (t === "erase" ? 2.5 : 1))

      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      if (pinching) {
        ctx.fillStyle = t === "erase" ? "rgba(251,113,133,0.25)" : `${c}40`
        ctx.fill()
        ctx.strokeStyle = t === "erase" ? "#fb7185" : c
        ctx.lineWidth = 2
      } else {
        ctx.strokeStyle = "rgba(250,250,250,0.6)"
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
      }
      ctx.stroke()
      // Center dot
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fillStyle = pinching ? (t === "erase" ? "#fb7185" : c) : "rgba(250,250,250,0.8)"
      ctx.fill()
      ctx.restore()
    }

    function commitStroke() {
      const stroke = currentStrokeRef.current
      if (stroke && stroke.points.length > 1) {
        strokesRef.current.push(stroke)
        setCanUndo(true)
      }
      currentStrokeRef.current = null
    }

    function loop() {
      const video = videoRef.current
      if (!video || !landmarker || cancelled) return

      if (video.currentTime !== lastVideoTime && video.videoWidth > 0) {
        lastVideoTime = video.currentTime
        const result = landmarker.detectForVideo(video, performance.now())
        const landmarks = result.landmarks?.[0]

        if (landmarks) {
          const wasPinching = pinchingRef.current
          const pinching = detectPinch(landmarks, wasPinching)
          const rawPoint = getPinchPoint(landmarks)
          const point = smootherRef.current.smooth(rawPoint)

          if (pinching && !wasPinching) {
            // Start a new stroke
            const { color: c, size, tool: t } = settingsRef.current
            currentStrokeRef.current = { points: [point], color: c, size, mode: t }
          } else if (pinching && currentStrokeRef.current) {
            const pts = currentStrokeRef.current.points
            const last = pts[pts.length - 1]
            if (Math.hypot(point.x - last.x, point.y - last.y) > MIN_POINT_DISTANCE) {
              pts.push(point)
            }
          } else if (!pinching && wasPinching) {
            commitStroke()
          }

          pinchingRef.current = pinching
          if (pinching) repaint()
          drawCursor(point, pinching)
          updateStatus(pinching ? (settingsRef.current.tool === "erase" ? "erasing" : "drawing") : "hover")
        } else {
          // Hand lost — commit any in-progress stroke
          if (pinchingRef.current) {
            commitStroke()
            pinchingRef.current = false
            repaint()
          }
          smootherRef.current.reset()
          drawCursor(null, false)
          updateStatus("no-hand")
        }
      }

      rafId = requestAnimationFrame(loop)
    }

    init()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
    }
  }, [repaint, updateStatus, retryToken])

  // Keep canvases sized to the viewport
  useEffect(() => {
    function resize() {
      const container = containerRef.current
      if (!container) return
      const { clientWidth: w, clientHeight: h } = container
      for (const ref of [drawCanvasRef, cursorCanvasRef]) {
        if (ref.current) {
          ref.current.width = w
          ref.current.height = h
        }
      }
      repaint()
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [repaint])

  const handleUndo = useCallback(() => {
    strokesRef.current.pop()
    setCanUndo(strokesRef.current.length > 0)
    repaint()
  }, [repaint])

  const handleClear = useCallback(() => {
    strokesRef.current = []
    currentStrokeRef.current = null
    setCanUndo(false)
    repaint()
  }, [repaint])

  const handleSave = useCallback(() => {
    const drawCanvas = drawCanvasRef.current
    if (!drawCanvas) return
    const out = document.createElement("canvas")
    out.width = drawCanvas.width
    out.height = drawCanvas.height
    const ctx = out.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#09090b"
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(drawCanvas, 0, 0)
    const link = document.createElement("a")
    link.download = `airdraw-${Date.now()}.png`
    link.href = out.toDataURL("image/png")
    link.click()
  }, [])

  return (
    <div ref={containerRef} className="relative h-dvh w-full overflow-hidden bg-background">
      {/* Mirrored webcam feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        className={`absolute inset-0 size-full -scale-x-100 object-cover transition-opacity duration-500 ${
          showVideo ? "opacity-25" : "opacity-0"
        }`}
      />

      {/* Drawing layer */}
      <canvas ref={drawCanvasRef} className="absolute inset-0" aria-label="Air drawing canvas" role="img" />
      {/* Cursor layer */}
      <canvas ref={cursorCanvasRef} className="absolute inset-0" aria-hidden="true" />

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-mono text-sm font-semibold tracking-widest text-foreground uppercase">
            Air<span className="text-accent">Draw</span>
          </h1>
          <p className="text-xs text-muted text-pretty">Pinch thumb + index finger to draw. Release to stop.</p>
        </div>
        <StatusHud status={status} />
      </header>

      {/* Error state */}
      {errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-6 text-center">
            <div>
              <p className="mb-2 font-semibold text-danger">Camera unavailable</p>
              <p className="text-sm leading-relaxed text-muted text-pretty">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {status === "loading" && !errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden="true" />
            <p className="font-mono text-xs tracking-wide text-muted uppercase">Loading hand tracking…</p>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <footer className="absolute inset-x-0 bottom-0 flex justify-center p-4">
        <Toolbar
          color={color}
          onColorChange={setColor}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          tool={tool}
          onToolChange={setTool}
          canUndo={canUndo}
          onUndo={handleUndo}
          onClear={handleClear}
          onSave={handleSave}
          showVideo={showVideo}
          onToggleVideo={() => setShowVideo((v) => !v)}
        />
      </footer>
    </div>
  )
}
