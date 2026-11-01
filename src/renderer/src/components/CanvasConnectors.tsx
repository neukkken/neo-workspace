import React from 'react'
import { CanvasCard, CanvasConnector } from '../types'

interface CanvasConnectorsProps {
  cards: CanvasCard[]
  connectors: CanvasConnector[]
  onDisconnect: (id: string) => void
}

export const CanvasConnectors: React.FC<CanvasConnectorsProps> = ({ cards, connectors, onDisconnect }) => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible">
    <defs>
      <marker
        id="canvas-arrow"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#828384" />
      </marker>
    </defs>
    {connectors.map((conn) => {
      const fromCard = cards.find((c) => c.id === conn.fromId)
      const toCard = cards.find((c) => c.id === conn.toId)
      if (!fromCard || !toCard) return null

      const x1 = fromCard.x + fromCard.width
      const y1 = fromCard.y + fromCard.height / 2
      const x2 = toCard.x
      const y2 = toCard.y + toCard.height / 2
      const dx = Math.abs(x2 - x1) * 0.5

      const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2

      return (
        <g key={conn.id} className="group/conn">
          {/* Invisible wide path for easy clicking / hovering to disconnect */}
          <path
            d={pathData}
            stroke="transparent"
            strokeWidth="24"
            fill="none"
            className="cursor-pointer pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onDisconnect(conn.id)
            }}
          >
            <title>Haz clic para desconectar</title>
          </path>

          {/* Flow line */}
          <path
            d={pathData}
            stroke="#828384"
            strokeWidth="2.5"
            strokeDasharray="6 3"
            fill="none"
            opacity="0.85"
            markerEnd="url(#canvas-arrow)"
            className="group-hover/conn:stroke-rose-400 group-hover/conn:opacity-100 transition-colors pointer-events-none"
          />

          {/* Midpoint Interactive Delete / Disconnect Badge */}
          <g
            className="cursor-pointer pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onDisconnect(conn.id)
            }}
          >
            <title>Desconectar enlace</title>
            {/* Circle badge */}
            <circle
              cx={midX}
              cy={midY}
              r="12"
              className="fill-void stroke-zinc-700 group-hover/conn:stroke-rose-500 group-hover/conn:fill-rose-950/90 transition-all"
              strokeWidth="1.5"
            />
            {/* Cross icon */}
            <line
              x1={midX - 3.5}
              y1={midY - 3.5}
              x2={midX + 3.5}
              y2={midY + 3.5}
              stroke="#a1a1aa"
              strokeWidth="1.6"
              strokeLinecap="round"
              className="group-hover/conn:stroke-rose-300 transition-colors"
            />
            <line
              x1={midX + 3.5}
              y1={midY - 3.5}
              x2={midX - 3.5}
              y2={midY + 3.5}
              stroke="#a1a1aa"
              strokeWidth="1.6"
              strokeLinecap="round"
              className="group-hover/conn:stroke-rose-300 transition-colors"
            />
          </g>
        </g>
      )
    })}
  </svg>
)
