import React from 'react'
import { CanvasCard } from '../types'

interface WorkspacePreviewProps {
  cards?: CanvasCard[]
  width: number
  height: number
  className?: string
}

// Static minimap of a workspace's canvas: every card as a block, fitted to width x height
export const WorkspacePreview: React.FC<WorkspacePreviewProps> = ({ cards = [], width, height, className = '' }) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of cards) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + c.width)
    maxY = Math.max(maxY, c.y + c.height)
  }
  const pad = 4
  const scale = cards.length
    ? Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY))
    : 0
  const offsetX = (width - (maxX - minX) * scale) / 2
  const offsetY = (height - (maxY - minY) * scale) / 2

  return (
    <div
      style={{ width, height }}
      className={`relative shrink-0 overflow-hidden rounded-control bg-void border border-zinc-800/80 ${className}`}
    >
      {cards.map((c) => (
        <div
          key={c.id}
          style={{
            left: offsetX + (c.x - minX) * scale,
            top: offsetY + (c.y - minY) * scale,
            width: Math.max(3, c.width * scale),
            height: Math.max(3, c.height * scale)
          }}
          className={`absolute rounded-[1.5px] ${c.kind === 'terminal' ? 'bg-signal/70' : 'bg-zinc-500/70'}`}
        />
      ))}
    </div>
  )
}
