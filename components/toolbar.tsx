"use client"

import { Pen, Eraser, Undo2, Trash2, Download, Video, VideoOff } from "lucide-react"
import type { ToolMode } from "@/lib/strokes"

export const PALETTE = ["#22d3ee", "#fafafa", "#fbbf24", "#fb7185", "#a3e635"] as const

interface ToolbarProps {
  color: string
  onColorChange: (color: string) => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
  canUndo: boolean
  onUndo: () => void
  onClear: () => void
  onSave: () => void
  showVideo: boolean
  onToggleVideo: () => void
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      } disabled:pointer-events-none disabled:opacity-35`}
    >
      {children}
    </button>
  )
}

export function Toolbar({
  color,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  tool,
  onToolChange,
  canUndo,
  onUndo,
  onClear,
  onSave,
  showVideo,
  onToggleVideo,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/85 px-4 py-2.5 shadow-2xl backdrop-blur-md">
      {/* Colors */}
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Brush color">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c && tool === "draw"}
            aria-label={`Color ${c}`}
            onClick={() => {
              onColorChange(c)
              onToolChange("draw")
            }}
            className={`size-6 rounded-full transition-transform hover:scale-110 ${
              color === c && tool === "draw" ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="h-6 w-px bg-border" aria-hidden="true" />

      {/* Tools */}
      <div className="flex items-center gap-1">
        <IconButton label="Pen" active={tool === "draw"} onClick={() => onToolChange("draw")}>
          <Pen className="size-4" />
        </IconButton>
        <IconButton label="Eraser" active={tool === "erase"} onClick={() => onToolChange("erase")}>
          <Eraser className="size-4" />
        </IconButton>
      </div>

      <div className="h-6 w-px bg-border" aria-hidden="true" />

      {/* Brush size */}
      <div className="flex items-center gap-2">
        <label htmlFor="brush-size" className="font-mono text-[10px] tracking-wider text-muted uppercase">
          Size
        </label>
        <input
          id="brush-size"
          type="range"
          min={3}
          max={30}
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          className="w-20 accent-(--color-accent)"
        />
      </div>

      <div className="h-6 w-px bg-border" aria-hidden="true" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Clear canvas" disabled={!canUndo} onClick={onClear}>
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton label={showVideo ? "Hide camera" : "Show camera"} onClick={onToggleVideo}>
          {showVideo ? <Video className="size-4" /> : <VideoOff className="size-4" />}
        </IconButton>
        <IconButton label="Save as image" onClick={onSave}>
          <Download className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}
