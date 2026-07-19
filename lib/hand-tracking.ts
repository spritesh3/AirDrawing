import type { NormalizedLandmark } from "@mediapipe/tasks-vision"

export type GestureState = "idle" | "hover" | "pinch"

export interface Point {
  x: number
  y: number
}

/**
 * Distance between two normalized landmarks.
 */
function dist(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Detects a pinch (thumb tip <-> index tip) normalized by hand size so it
 * works at any distance from the camera. Uses hysteresis to avoid flicker:
 * a pinch starts below `startThreshold` and only releases above `endThreshold`.
 */
export function detectPinch(landmarks: NormalizedLandmark[], wasPinching: boolean): boolean {
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  // Hand scale reference: wrist -> middle finger MCP
  const handScale = dist(landmarks[0], landmarks[9])
  if (handScale < 1e-6) return false

  const pinchRatio = dist(thumbTip, indexTip) / handScale
  const startThreshold = 0.32
  const endThreshold = 0.45

  return wasPinching ? pinchRatio < endThreshold : pinchRatio < startThreshold
}

/**
 * Returns the drawing point: midpoint between thumb tip and index tip,
 * mirrored on X for a natural mirror-view experience.
 */
export function getPinchPoint(landmarks: NormalizedLandmark[]): Point {
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  return {
    x: 1 - (thumbTip.x + indexTip.x) / 2,
    y: (thumbTip.y + indexTip.y) / 2,
  }
}

/**
 * Exponential moving average smoother for cursor stability.
 */
export class PointSmoother {
  private last: Point | null = null
  constructor(private alpha = 0.4) {}

  smooth(p: Point): Point {
    if (!this.last) {
      this.last = p
      return p
    }
    const s = {
      x: this.last.x + this.alpha * (p.x - this.last.x),
      y: this.last.y + this.alpha * (p.y - this.last.y),
    }
    this.last = s
    return s
  }

  reset() {
    this.last = null
  }
}
