"use client"

export type TrackingStatus = "loading" | "error" | "no-hand" | "hover" | "drawing" | "erasing"

const STATUS_CONFIG: Record<TrackingStatus, { label: string; dot: string; text: string }> = {
  loading: { label: "Starting camera…", dot: "bg-muted animate-pulse", text: "text-muted" },
  error: { label: "Camera unavailable", dot: "bg-danger", text: "text-danger" },
  "no-hand": { label: "Show your hand", dot: "bg-muted", text: "text-muted" },
  hover: { label: "Hand detected — pinch to draw", dot: "bg-amber-400", text: "text-amber-300" },
  drawing: { label: "Drawing", dot: "bg-accent", text: "text-accent" },
  erasing: { label: "Erasing", dot: "bg-danger", text: "text-danger" },
}

export function StatusHud({ status }: { status: TrackingStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex items-center gap-2.5 rounded-full border border-border bg-surface/80 px-4 py-2 backdrop-blur-md"
    >
      <span className={`size-2 rounded-full ${cfg.dot}`} aria-hidden="true" />
      <span className={`font-mono text-xs tracking-wide uppercase ${cfg.text}`}>{cfg.label}</span>
    </div>
  )
}
