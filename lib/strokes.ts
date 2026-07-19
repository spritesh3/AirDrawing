import type { Point } from "./hand-tracking"

export type ToolMode = "draw" | "erase"

export interface Stroke {
  points: Point[] // normalized 0-1 coordinates
  color: string
  size: number // relative size, scaled by canvas width
  mode: ToolMode
}

/**
 * Renders all strokes to a canvas. Points are stored normalized so the
 * drawing survives window resizes. Uses quadratic curves for smooth lines.
 */
export function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height)

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue

    ctx.save()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = stroke.size * (width / 1000)

    if (stroke.mode === "erase") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
      ctx.lineWidth = stroke.size * 2.5 * (width / 1000)
    } else {
      ctx.strokeStyle = stroke.color
      ctx.shadowColor = stroke.color
      ctx.shadowBlur = stroke.size * 0.8
    }

    const pts = stroke.points
    ctx.beginPath()
    ctx.moveTo(pts[0].x * width, pts[0].y * height)

    if (pts.length < 3) {
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * width, pts[i].y * height)
      }
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = ((pts[i].x + pts[i + 1].x) / 2) * width
        const midY = ((pts[i].y + pts[i + 1].y) / 2) * height
        ctx.quadraticCurveTo(pts[i].x * width, pts[i].y * height, midX, midY)
      }
      const last = pts[pts.length - 1]
      ctx.lineTo(last.x * width, last.y * height)
    }

    ctx.stroke()
    ctx.restore()
  }
}
