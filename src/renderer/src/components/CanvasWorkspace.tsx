import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Plus,
  Terminal,
  Globe,
  Maximize,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  Layers
} from 'lucide-react'
import { CanvasCard, ProcessMetrics, Workspace } from '../types'
import { TerminalCanvasCard } from './TerminalCanvasCard'
import { BrowserCard } from './BrowserCard'
import { terminalPool } from '../services/terminal-pool'

interface CanvasWorkspaceProps {
  workspace: Workspace
  panelsMetrics: Record<string, ProcessMetrics>
  onSaveCanvasCards: (cards: CanvasCard[]) => void
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  workspace,
  panelsMetrics,
  onSaveCanvasCards
}) => {
  // Initialize cards from workspace panels or canvasCards
  const [cards, setCards] = useState<CanvasCard[]>(() => {
    if (workspace.canvasCards && workspace.canvasCards.length > 0) {
      return workspace.canvasCards
    }
    // Generate initial canvas cards from existing panels
    return workspace.panels.map((p, idx) => ({
      id: p.id,
      kind: 'terminal',
      title: p.title,
      cwd: p.cwd,
      command: p.command,
      autoStart: p.autoStart,
      x: 60 + (idx % 2) * 580,
      y: 60 + Math.floor(idx / 2) * 440,
      width: 550,
      height: 400,
      zIndex: idx + 1
    }))
  })

  // Synchronize any panels that exist in the workspace but not in cards
  useEffect(() => {
    setCards((prev) => {
      const missingPanels = workspace.panels.filter(
        (p) => !prev.some((c) => c.id === p.id)
      )
      if (missingPanels.length === 0) return prev

      const newCards: CanvasCard[] = missingPanels.map((p, i) => ({
        id: p.id,
        kind: 'terminal' as const,
        title: p.title,
        cwd: p.cwd,
        command: p.command,
        autoStart: p.autoStart,
        x: 60 + ((prev.length + i) % 2) * 580,
        y: 60 + Math.floor((prev.length + i) / 2) * 440,
        width: 550,
        height: 400,
        zIndex: prev.length + i + 1
      }))
      const updated = [...prev, ...newCards]
      onSaveCanvasCards(updated)
      return updated
    })
  }, [workspace.panels, onSaveCanvasCards])

  // Pan & Zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)

  // Dragging card state
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, cardX: 0, cardY: 0 })

  // Resizing card state
  const [resizingCardId, setResizingCardId] = useState<string | null>(null)
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, cardW: 0, cardH: 0 })

  const containerRef = useRef<HTMLDivElement>(null)

  // Sync to parent on card change
  const updateCardsAndNotify = useCallback(
    (updater: (prev: CanvasCard[]) => CanvasCard[]) => {
      setCards((prev) => {
        const next = updater(prev)
        onSaveCanvasCards(next)
        return next
      })
    },
    [onSaveCanvasCards]
  )

  // Add new Terminal card
  const handleAddTerminal = (): void => {
    const newId = `canvas-term-${Date.now()}`
    const newCard: CanvasCard = {
      id: newId,
      kind: 'terminal',
      title: `TERMINAL-${cards.filter((c) => c.kind === 'terminal').length + 1}`,
      x: -pan.x + 120,
      y: -pan.y + 100,
      width: 560,
      height: 400,
      cwd: '',
      command: '',
      autoStart: true,
      zIndex: cards.length + 1
    }
    updateCardsAndNotify((prev) => [...prev, newCard])
    setFocusedCardId(newId)
  }

  // Add new Browser card
  const handleAddBrowser = (): void => {
    const newId = `canvas-browser-${Date.now()}`
    const newCard: CanvasCard = {
      id: newId,
      kind: 'browser',
      title: 'LOCAL-PREVIEW',
      url: 'http://localhost:5173',
      x: -pan.x + 200,
      y: -pan.y + 120,
      width: 580,
      height: 480,
      zIndex: cards.length + 1
    }
    updateCardsAndNotify((prev) => [...prev, newCard])
    setFocusedCardId(newId)
  }

  const handleDeleteCard = (id: string): void => {
    terminalPool.destroyTerminal(id)
    updateCardsAndNotify((prev) => prev.filter((c) => c.id !== id))
    if (focusedCardId === id) setFocusedCardId(null)
  }

  const handleUpdateCard = (id: string, updates: Partial<CanvasCard>): void => {
    updateCardsAndNotify((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }

  const bringToFront = (id: string): void => {
    setFocusedCardId(id)
    updateCardsAndNotify((prev) => {
      const maxZ = prev.reduce((max, c) => Math.max(max, c.zIndex || 0), 0)
      return prev.map((c) => (c.id === id ? { ...c, zIndex: maxZ + 1 } : c))
    })
  }

  // Mouse pan handlers
  const handleCanvasMouseDown = (e: React.MouseEvent): void => {
    // Left click on background or middle click anywhere initiates pan
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      setIsPanning(true)
      panStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: pan.x,
        panY: pan.y
      }
    }
  }

  // Zoom with Wheel centered at cursor position
  const handleWheel = (e: React.WheelEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92
      const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.35), 2.2)
      if (newZoom === zoom) return

      // Anchor zoom around current mouse coordinates
      const newPanX = mx - ((mx - pan.x) / zoom) * newZoom
      const newPanY = my - ((my - pan.y) / zoom) * newZoom

      setZoom(newZoom)
      setPan({ x: newPanX, y: newPanY })
    } else {
      // Regular scroll pans vertically or horizontally
      setPan((prev) => ({
        x: prev.x - e.deltaX * 0.8,
        y: prev.y - e.deltaY * 0.8
      }))
    }
  }

  // Drag Card start
  const handleDragStart = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const targetCard = cards.find((c) => c.id === id)
    if (!targetCard) return

    bringToFront(id)
    setDraggingCardId(id)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      cardX: targetCard.x,
      cardY: targetCard.y
    }
  }

  // Resize Card start
  const handleResizeStart = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const targetCard = cards.find((c) => c.id === id)
    if (!targetCard) return

    bringToFront(id)
    setResizingCardId(id)
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      cardW: targetCard.width,
      cardH: targetCard.height
    }
  }

  // Global mouse move & mouse up
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (isPanning) {
        const dx = e.clientX - panStartRef.current.mouseX
        const dy = e.clientY - panStartRef.current.mouseY
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy
        })
      } else if (draggingCardId) {
        const dx = (e.clientX - dragStartRef.current.mouseX) / zoom
        const dy = (e.clientY - dragStartRef.current.mouseY) / zoom
        setCards((prev) =>
          prev.map((c) =>
            c.id === draggingCardId
              ? {
                  ...c,
                  x: Math.round(dragStartRef.current.cardX + dx),
                  y: Math.round(dragStartRef.current.cardY + dy)
                }
              : c
          )
        )
      } else if (resizingCardId) {
        const dw = (e.clientX - resizeStartRef.current.mouseX) / zoom
        const dh = (e.clientY - resizeStartRef.current.mouseY) / zoom
        setCards((prev) =>
          prev.map((c) =>
            c.id === resizingCardId
              ? {
                  ...c,
                  width: Math.max(320, Math.round(resizeStartRef.current.cardW + dw)),
                  height: Math.max(220, Math.round(resizeStartRef.current.cardH + dh))
                }
              : c
          )
        )
      }
    }

    const handleMouseUp = (): void => {
      if (isPanning) {
        setIsPanning(false)
      }
      if (draggingCardId || resizingCardId) {
        setDraggingCardId(null)
        setResizingCardId(null)
        onSaveCanvasCards(cards)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPanning, draggingCardId, resizingCardId, zoom, cards, onSaveCanvasCards])

  const handleZoomCenter = (factor: number): void => {
    const rect = containerRef.current?.getBoundingClientRect()
    const mx = rect ? rect.width / 2 : window.innerWidth / 2
    const my = rect ? rect.height / 2 : window.innerHeight / 2

    const newZoom = Math.min(Math.max(zoom * factor, 0.35), 2.2)
    if (newZoom === zoom) return

    const newPanX = mx - ((mx - pan.x) / zoom) * newZoom
    const newPanY = my - ((my - pan.y) / zoom) * newZoom

    setZoom(newZoom)
    setPan({ x: newPanX, y: newPanY })
  }

  const handleResetView = (): void => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  return (
    <div className="flex-1 relative h-full w-full min-h-0 overflow-hidden bg-[#07080a] select-none">
      {/* Floating Toolbar on Top */}
      <div className="absolute top-3 left-3 z-40 flex items-center space-x-1.5 bg-[#0e1116]/90 backdrop-blur-md border border-zinc-800 p-1 rounded-lg shadow-xl font-mono text-xs">
        <button
          onClick={handleAddTerminal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors font-medium"
        >
          <Terminal size={13} />
          <span>+ Console</span>
        </button>

        <button
          onClick={handleAddBrowser}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-colors font-medium"
        >
          <Globe size={13} />
          <span>+ Browser</span>
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        <button
          onClick={() => handleZoomCenter(1.15)}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Zoom In (Ctrl + Wheel)"
        >
          <ZoomIn size={14} />
        </button>

        <span className="text-[11px] text-zinc-400 px-1 font-mono min-w-[42px] text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={() => handleZoomCenter(0.85)}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Zoom Out (Ctrl + Wheel)"
        >
          <ZoomOut size={14} />
        </button>

        <button
          onClick={handleResetView}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Reset View to 100%"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      {/* Infinite Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        style={{
          cursor: isPanning ? 'grabbing' : 'default',
          backgroundImage:
            'radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
          backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
        className="w-full h-full relative overflow-hidden"
      >
        {/* World Transform Layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          <div className="w-full h-full relative pointer-events-auto">
            {cards.map((card) => {
              const isFocused = card.id === focusedCardId

              if (card.kind === 'browser') {
                return (
                  <BrowserCard
                    key={card.id}
                    card={card}
                    isFocused={isFocused}
                    onFocus={() => bringToFront(card.id)}
                    onUpdate={(updates) => handleUpdateCard(card.id, updates)}
                    onDelete={handleDeleteCard}
                    onDragStart={handleDragStart}
                    onResizeStart={handleResizeStart}
                  />
                )
              }

              return (
                <TerminalCanvasCard
                  key={card.id}
                  card={card}
                  metrics={panelsMetrics[card.id]}
                  isFocused={isFocused}
                  onFocus={() => bringToFront(card.id)}
                  onUpdate={(updates) => handleUpdateCard(card.id, updates)}
                  onDelete={handleDeleteCard}
                  onDragStart={handleDragStart}
                  onResizeStart={handleResizeStart}
                />
              )
            })}
          </div>
        </div>

        {/* Empty state hint */}
        {cards.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 font-mono text-xs select-none pointer-events-none">
            <div className="w-12 h-12 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-2">
              <Layers size={20} className="text-zinc-600" />
            </div>
            <span className="text-zinc-400 font-medium">CANVAS VACÍO</span>
            <span className="text-[11px] text-zinc-600 mt-1">
              Usa los botones "+ Console" o "+ Browser" arriba para agregar nodos.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
