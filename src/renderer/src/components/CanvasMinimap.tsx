import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { CanvasCard, CanvasConnector } from '../types'

interface CanvasMinimapProps {
  cards: CanvasCard[]
  connectors: CanvasConnector[]
  pan: { x: number; y: number }
  zoom: number
  focusedCardId: string | null
  containerRef: React.RefObject<HTMLDivElement | null>
  onPan: (pan: { x: number; y: number }) => void
  onHide: () => void
}

export const CanvasMinimap: React.FC<CanvasMinimapProps> = ({
  cards,
  connectors,
  pan,
  zoom,
  focusedCardId,
  containerRef,
  onPan,
  onHide
}) => {
  const boxRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Dynamic Minimap calculation based on actual card positions & viewport
  const data = useMemo(() => {
    const containerW = containerRef.current?.clientWidth || window.innerWidth
    const containerH = containerRef.current?.clientHeight || window.innerHeight

    // Current viewport in world coordinates
    const viewX1 = -pan.x / zoom
    const viewY1 = -pan.y / zoom
    const viewW = containerW / zoom
    const viewH = containerH / zoom
    const viewX2 = viewX1 + viewW
    const viewY2 = viewY1 + viewH

    // Bounding box encompassing both cards and camera viewport
    let minX = viewX1
    let maxX = viewX2
    let minY = viewY1
    let maxY = viewY2

    for (const c of cards) {
      if (c.x < minX) minX = c.x
      if (c.x + c.width > maxX) maxX = c.x + c.width
      if (c.y < minY) minY = c.y
      if (c.y + c.height > maxY) maxY = c.y + c.height
    }

    // Margin padding
    const pad = 140
    const worldMinX = minX - pad
    const worldMaxX = maxX + pad
    const worldMinY = minY - pad
    const worldMaxY = maxY + pad

    const worldW = Math.max(worldMaxX - worldMinX, 600)
    const worldH = Math.max(worldMaxY - worldMinY, 400)

    // Minimap display dimensions
    const mapW = 208
    const mapH = 112

    const scale = Math.min(mapW / worldW, mapH / worldH)
    const contentW = worldW * scale
    const contentH = worldH * scale
    const offsetX = (mapW - contentW) / 2
    const offsetY = (mapH - contentH) / 2

    return {
      containerW,
      containerH,
      worldMinX,
      worldMinY,
      scale,
      offsetX,
      offsetY,
      viewportRect: {
        x: offsetX + (viewX1 - worldMinX) * scale,
        y: offsetY + (viewY1 - worldMinY) * scale,
        w: Math.max(10, viewW * scale),
        h: Math.max(8, viewH * scale)
      }
    }
  }, [cards, pan, zoom, containerRef])

  const panTo = (clientX: number, clientY: number): void => {
    if (!boxRef.current) return
    const rect = boxRef.current.getBoundingClientRect()
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const clickY = Math.max(0, Math.min(rect.height, clientY - rect.top))

    const targetWorldX = data.worldMinX + (clickX - data.offsetX) / data.scale
    const targetWorldY = data.worldMinY + (clickY - data.offsetY) / data.scale

    onPan({
      x: data.containerW / 2 - targetWorldX * zoom,
      y: data.containerH / 2 - targetWorldY * zoom
    })
  }

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent): void => panTo(e.clientX, e.clientY)
    const handleUp = (): void => setIsDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  })

  if (cards.length === 0) return null

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className="minimap-container island absolute bottom-4 right-4 z-40 w-56 p-2.5 select-none"
    >
      <div className="flex items-center justify-between text-[10px] text-zinc-400 border-b border-zinc-800/80 pb-1 mb-1.5">
        <span className="font-medium text-zinc-100 flex items-center space-x-1">
          <MapPin size={11} />
          <span className="stamp text-[10px]">MINIMAP</span>
        </span>
        <div className="flex items-center space-x-2">
          <span className="text-[9px] text-zinc-500 bg-zinc-900 px-1 py-0.5 rounded-control border border-zinc-800">
            {Math.round(zoom * 100)}%
          </span>
          <span className="text-zinc-500">{cards.length} nodos</span>
          <button
            onClick={onHide}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 rounded-control hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Ocultar minimapa"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div
        ref={boxRef}
        onMouseDown={(e) => {
          e.stopPropagation()
          setIsDragging(true)
          panTo(e.clientX, e.clientY)
        }}
        className="relative w-full h-28 bg-void rounded-control border border-zinc-800/80 cursor-crosshair overflow-hidden"
      >
        {/* Connector lines in minimap */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
          {connectors.map((conn) => {
            const fromCard = cards.find((c) => c.id === conn.fromId)
            const toCard = cards.find((c) => c.id === conn.toId)
            if (!fromCard || !toCard) return null

            return (
              <line
                key={conn.id}
                x1={data.offsetX + (fromCard.x + fromCard.width / 2 - data.worldMinX) * data.scale}
                y1={data.offsetY + (fromCard.y + fromCard.height / 2 - data.worldMinY) * data.scale}
                x2={data.offsetX + (toCard.x + toCard.width / 2 - data.worldMinX) * data.scale}
                y2={data.offsetY + (toCard.y + toCard.height / 2 - data.worldMinY) * data.scale}
                stroke="#828384"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.6"
              />
            )
          })}
        </svg>

        {/* Cards in minimap */}
        {cards.map((c) => (
          <div
            key={c.id}
            style={{
              left: `${data.offsetX + (c.x - data.worldMinX) * data.scale}px`,
              top: `${data.offsetY + (c.y - data.worldMinY) * data.scale}px`,
              width: `${Math.max(5, c.width * data.scale)}px`,
              height: `${Math.max(4, c.height * data.scale)}px`
            }}
            className={`absolute rounded-[1.5px] bg-zinc-500 pointer-events-none transition-all ${
              c.id === focusedCardId
                ? 'ring-1 ring-white opacity-100 shadow-[0_0_6px_rgba(255,255,255,0.9)] z-10'
                : 'opacity-70'
            }`}
          />
        ))}

        {/* Viewport Camera Box */}
        <div
          style={{
            left: `${data.viewportRect.x}px`,
            top: `${data.viewportRect.y}px`,
            width: `${data.viewportRect.w}px`,
            height: `${data.viewportRect.h}px`
          }}
          className="absolute border border-white/15 bg-white/5 rounded-[2px] pointer-events-none shadow-[0_0_10px_rgb(var(--signal-rgb)/0.35)] transition-all duration-75"
        />
      </div>
    </div>
  )
}
