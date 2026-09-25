import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Terminal,
  Globe,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  FileText,
  Sparkles,
  FolderOpen,
  Activity,
  GitBranch,
  MapPin,
  X
} from 'lucide-react'
import { CanvasCard, CanvasConnector, ProcessMetrics, Workspace } from '../types'
import { TerminalCanvasCard } from './TerminalCanvasCard'
import { BrowserCard } from './BrowserCard'
import { NoteCard } from './NoteCard'
import { FileExplorerCard } from './FileExplorerCard'
import { PortMonitorCard } from './PortMonitorCard'
import { terminalPool } from '../services/terminal-pool'

interface CanvasWorkspaceProps {
  workspace: Workspace
  panelsMetrics: Record<string, ProcessMetrics>
  onSaveCanvasCards: (cards: CanvasCard[], connectors?: CanvasConnector[]) => void
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

  // Visual connectors state
  const [connectors, setConnectors] = useState<CanvasConnector[]>(() => workspace.canvasConnectors || [])
  const [isConnectMode, setIsConnectMode] = useState(false)
  const [connectStartId, setConnectStartId] = useState<string | null>(null)
  const [showMinimap, setShowMinimap] = useState(true)

  // Synchronize any panels that exist in the workspace with cards (updates, additions, deletions)
  useEffect(() => {
    setCards((prev) => {
      const activePanelIds = new Set(workspace.panels.map((p) => p.id))
      // 1. Filter out deleted panels
      const kept = prev.filter((c) => c.kind !== 'terminal' || activePanelIds.has(c.id))

      // 2. Update existing terminal cards with latest title, cwd, command, autoStart
      const updated = kept.map((c) => {
        if (c.kind !== 'terminal') return c
        const p = workspace.panels.find((panel) => panel.id === c.id)
        if (p) {
          return {
            ...c,
            title: p.title,
            cwd: p.cwd,
            command: p.command,
            autoStart: p.autoStart
          }
        }
        return c
      })

      // 3. Add any newly added panels
      const missingPanels = workspace.panels.filter(
        (p) => !updated.some((c) => c.id === p.id)
      )

      if (missingPanels.length === 0) {
        const isSame =
          prev.length === updated.length &&
          prev.every((oldCard, idx) => {
            const newCard = updated[idx]
            return (
              oldCard.id === newCard.id &&
              oldCard.title === newCard.title &&
              oldCard.cwd === newCard.cwd &&
              oldCard.command === newCard.command &&
              oldCard.autoStart === newCard.autoStart
            )
          })
        if (isSame) return prev
        onSaveCanvasCards(updated, connectors)
        return updated
      }

      const newCards: CanvasCard[] = missingPanels.map((p, i) => ({
        id: p.id,
        kind: 'terminal' as const,
        title: p.title,
        cwd: p.cwd,
        command: p.command,
        autoStart: p.autoStart,
        x: 60 + ((updated.length + i) % 2) * 580,
        y: 60 + Math.floor((updated.length + i) / 2) * 440,
        width: 550,
        height: 400,
        zIndex: updated.length + i + 1
      }))
      const next = [...updated, ...newCards]
      onSaveCanvasCards(next, connectors)
      return next
    })
  }, [workspace.panels, onSaveCanvasCards, connectors])

  // Pan & Zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

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
        onSaveCanvasCards(next, connectors)
        return next
      })
    },
    [onSaveCanvasCards, connectors]
  )

  const updateConnectorsAndNotify = useCallback(
    (updater: (prev: CanvasConnector[]) => CanvasConnector[]) => {
      setConnectors((prev) => {
        const next = updater(prev)
        onSaveCanvasCards(cards, next)
        return next
      })
    },
    [cards, onSaveCanvasCards]
  )

  // Add new Terminal card
  const handleAddTerminal = (): void => {
    const newId = `canvas-term-${Date.now()}`
    const newCard: CanvasCard = {
      id: newId,
      kind: 'terminal',
      title: `TERMINAL-${cards.filter((c) => c.kind === 'terminal').length + 1}`,
      x: Math.round(-pan.x / zoom + 120),
      y: Math.round(-pan.y / zoom + 100),
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
  const handleAddBrowser = (url = 'http://localhost:5173'): void => {
    const newId = `canvas-browser-${Date.now()}`
    const newCard: CanvasCard = {
      id: newId,
      kind: 'browser',
      title: 'LOCAL-PREVIEW',
      url,
      x: Math.round(-pan.x / zoom + 200),
      y: Math.round(-pan.y / zoom + 120),
      width: 580,
      height: 480,
      zIndex: cards.length + 1
    }
    updateCardsAndNotify((prev) => [...prev, newCard])
    setFocusedCardId(newId)
  }

  // Add new Note card
  const handleAddNote = (): void => {
    const newId = `canvas-note-${Date.now()}`
    const newCard: CanvasCard = {
      id: newId,
      kind: 'note',
      title: 'NOTAS / TAREAS',
      noteColor: 'emerald',
      noteContent: '### Sprint Notes & TODOs\n- [x] Configure backend endpoints\n- [ ] Verify test tokens\n- [ ] Check migration script',
      x: Math.round(-pan.x / zoom + 160),
      y: Math.round(-pan.y / zoom + 120),
      width: 380,
      height: 320,
      zIndex: cards.length + 1
    }
    updateCardsAndNotify((prev) => [...prev, newCard])
    setFocusedCardId(newId)
  }

  // Add new File Explorer card
  const handleAddExplorer = (): void => {
    const newId = `canvas-explorer-${Date.now()}`
    const newCard: CanvasCard = {
      id: newId,
      kind: 'explorer',
      title: 'EXPLORADOR ARCHIVOS',
      explorerPath: workspace.panels[0]?.cwd || '',
      x: Math.round(-pan.x / zoom + 180),
      y: Math.round(-pan.y / zoom + 100),
      width: 480,
      height: 420,
      zIndex: cards.length + 1
    }
    updateCardsAndNotify((prev) => [...prev, newCard])
    setFocusedCardId(newId)
  }

  // Add new Port Monitor card
  const handleAddPortMonitor = (): void => {
    const newId = `canvas-ports-${Date.now()}`
    const newCard: CanvasCard = {
      id: newId,
      kind: 'port-monitor',
      title: 'MONITOR DE PUERTOS',
      monitoredPorts: [3000, 5173, 8000, 8080],
      x: Math.round(-pan.x / zoom + 220),
      y: Math.round(-pan.y / zoom + 140),
      width: 380,
      height: 360,
      zIndex: cards.length + 1
    }
    updateCardsAndNotify((prev) => [...prev, newCard])
    setFocusedCardId(newId)
  }

  // Handle connection creation or disconnection toggle
  const handleCardClickForConnection = (cardId: string): void => {
    if (!isConnectMode) return
    if (!connectStartId) {
      setConnectStartId(cardId)
    } else {
      if (connectStartId !== cardId) {
        // Check if connector already exists between connectStartId and cardId in either direction
        const existing = connectors.find(
          (c) =>
            (c.fromId === connectStartId && c.toId === cardId) ||
            (c.fromId === cardId && c.toId === connectStartId)
        )

        if (existing) {
          // Already connected: toggle OFF (Disconnect!)
          handleDeleteConnector(existing.id)
        } else {
          // Not connected: create new connection
          const newConnector: CanvasConnector = {
            id: `conn-${Date.now()}`,
            fromId: connectStartId,
            toId: cardId,
            color: '#10b981'
          }
          updateConnectorsAndNotify((prev) => [...prev, newConnector])
        }
      }
      setConnectStartId(null)
      setIsConnectMode(false)
    }
  }

  const handleDeleteConnector = (connId: string): void => {
    updateConnectorsAndNotify((prev) => prev.filter((c) => c.id !== connId))
  }

  // Auto-arrange all cards in clean grid layout
  const handleAutoArrange = (): void => {
    if (cards.length === 0) return
    const cols = cards.length > 4 ? 3 : 2
    const colWidth = 570
    const rowHeight = 430
    const startX = 60
    const startY = 60

    updateCardsAndNotify((prev) =>
      prev.map((c, i) => ({
        ...c,
        x: startX + (i % cols) * colWidth,
        y: startY + Math.floor(i / cols) * rowHeight,
        zIndex: i + 1
      }))
    )
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  const handleDeleteCard = (id: string): void => {
    terminalPool.destroyTerminal(id)
    updateCardsAndNotify((prev) => prev.filter((c) => c.id !== id))
    updateConnectorsAndNotify((prev) => prev.filter((conn) => conn.fromId !== id && conn.toId !== id))
    if (focusedCardId === id) setFocusedCardId(null)
  }

  const handleUpdateCard = (id: string, updates: Partial<CanvasCard>): void => {
    updateCardsAndNotify((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }

  const bringToFront = (id: string): void => {
    if (isConnectMode) {
      handleCardClickForConnection(id)
      return
    }
    setFocusedCardId(id)
    updateCardsAndNotify((prev) => {
      const maxZ = prev.reduce((max, c) => Math.max(max, c.zIndex || 0), 0)
      return prev.map((c) => (c.id === id ? { ...c, zIndex: maxZ + 1 } : c))
    })
  }

  // Mouse pan handlers
  const handleCanvasMouseDown = (e: React.MouseEvent): void => {
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      setFocusedCardId(null)
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
    // If scroll occurred inside any card, toolbar or minimap, isolate it: do NOT pan or zoom canvas!
    const target = e.target as HTMLElement | null
    if (target && target.closest('.canvas-card, .minimap-container, .canvas-toolbar')) {
      return
    }

    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92
      const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.35), 2.2)
      if (newZoom === zoom) return

      const newPanX = mx - ((mx - pan.x) / zoom) * newZoom
      const newPanY = my - ((my - pan.y) / zoom) * newZoom

      setZoom(newZoom)
      setPan({ x: newPanX, y: newPanY })
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX * 0.8,
        y: prev.y - e.deltaY * 0.8
      }))
    }
  }

  // Drag Card start
  const handleDragStart = (e: React.MouseEvent, id: string): void => {
    if (isConnectMode) {
      handleCardClickForConnection(id)
      return
    }
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

  const minimapBoxRef = useRef<HTMLDivElement>(null)
  const isMinimapDraggingRef = useRef(false)

  // Dynamic Minimap calculation based on actual card positions & viewport
  const minimapData = useMemo(() => {
    if (cards.length === 0) return null

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
  }, [cards, pan, zoom])

  const panFromMinimap = useCallback(
    (clientX: number, clientY: number): void => {
      if (!minimapData || !minimapBoxRef.current) return
      const rect = minimapBoxRef.current.getBoundingClientRect()
      const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left))
      const clickY = Math.max(0, Math.min(rect.height, clientY - rect.top))

      const { worldMinX, worldMinY, scale, offsetX, offsetY, containerW, containerH } = minimapData

      const targetWorldX = worldMinX + (clickX - offsetX) / scale
      const targetWorldY = worldMinY + (clickY - offsetY) / scale

      setPan({
        x: containerW / 2 - targetWorldX * zoom,
        y: containerH / 2 - targetWorldY * zoom
      })
    },
    [minimapData, zoom]
  )

  const handleMinimapMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    isMinimapDraggingRef.current = true
    panFromMinimap(e.clientX, e.clientY)
  }

  // Global mouse move & mouse up
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (isMinimapDraggingRef.current) {
        panFromMinimap(e.clientX, e.clientY)
      } else if (isPanning) {
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
      if (isMinimapDraggingRef.current) {
        isMinimapDraggingRef.current = false
      }
      if (isPanning) {
        setIsPanning(false)
      }
      if (draggingCardId || resizingCardId) {
        setDraggingCardId(null)
        setResizingCardId(null)
        onSaveCanvasCards(cards, connectors)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPanning, draggingCardId, resizingCardId, zoom, cards, connectors, onSaveCanvasCards, panFromMinimap])

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
      <div
        onWheel={(e) => e.stopPropagation()}
        className="canvas-toolbar absolute top-3 left-3 z-40 flex items-center space-x-1.5 bg-[#0e1116]/95 backdrop-blur-md border border-zinc-800 p-1 rounded-lg shadow-xl font-mono text-xs"
      >
        <button
          onClick={handleAddTerminal}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors font-medium cursor-pointer"
        >
          <Terminal size={13} />
          <span>+ Console</span>
        </button>

        <button
          onClick={() => handleAddBrowser()}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-colors font-medium cursor-pointer"
        >
          <Globe size={13} />
          <span>+ Browser</span>
        </button>

        <button
          onClick={handleAddNote}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors font-medium cursor-pointer"
        >
          <FileText size={13} />
          <span>+ Note</span>
        </button>

        <button
          onClick={handleAddExplorer}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 transition-colors font-medium cursor-pointer"
        >
          <FolderOpen size={13} />
          <span>+ Explorer</span>
        </button>

        <button
          onClick={handleAddPortMonitor}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors font-medium cursor-pointer"
        >
          <Activity size={13} />
          <span>+ Ports</span>
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        {/* Link / Connector Mode Toggle */}
        <button
          onClick={() => {
            setIsConnectMode(!isConnectMode)
            setConnectStartId(null)
          }}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
            isConnectMode
              ? 'bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/20'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title="Modo Conectar / Desconectar: Haz clic en dos tarjetas para enlazarlas o desenlazarlas"
        >
          <GitBranch size={13} />
          <span>
            {isConnectMode
              ? connectStartId
                ? 'Elige destino (conectar o desconectar)'
                : 'Elige origen'
              : 'Conectar'}
          </span>
        </button>

        <button
          onClick={() => setShowMinimap(!showMinimap)}
          className={`p-1.5 rounded text-xs font-mono transition-colors cursor-pointer ${
            showMinimap ? 'text-emerald-400 bg-zinc-800' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title="Mostrar/Ocultar Minimap"
        >
          <MapPin size={13} />
        </button>

        <button
          onClick={handleAutoArrange}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
          title="Auto-organizar cuadrícula limpia"
        >
          <Sparkles size={13} />
        </button>

        <button
          onClick={() => handleZoomCenter(1.15)}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Zoom In (Ctrl + Wheel)"
        >
          <ZoomIn size={14} />
        </button>

        <span className="text-[11px] text-zinc-400 px-1 font-mono min-w-[42px] text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={() => handleZoomCenter(0.85)}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Zoom Out (Ctrl + Wheel)"
        >
          <ZoomOut size={14} />
        </button>

        <button
          onClick={handleResetView}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
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
          cursor: isPanning ? 'grabbing' : isConnectMode ? 'crosshair' : 'default',
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
          {/* Connector SVG Layer */}
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
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
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
                      handleDeleteConnector(conn.id)
                    }}
                  >
                    <title>Haz clic para desconectar</title>
                  </path>

                  {/* Flow line */}
                  <path
                    d={pathData}
                    stroke={conn.color || '#10b981'}
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
                      handleDeleteConnector(conn.id)
                    }}
                  >
                    <title>Desconectar enlace</title>
                    {/* Circle badge */}
                    <circle
                      cx={midX}
                      cy={midY}
                      r="12"
                      className="fill-[#0c0e12] stroke-zinc-700 group-hover/conn:stroke-rose-500 group-hover/conn:fill-rose-950/90 transition-all shadow-xl"
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

          {/* Cards Layer */}
          <div className="w-full h-full relative pointer-events-none">
            {cards.map((card) => {
              const isFocused = card.id === focusedCardId || card.id === connectStartId

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

              if (card.kind === 'note') {
                return (
                  <NoteCard
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

              if (card.kind === 'explorer') {
                return (
                  <FileExplorerCard
                    key={card.id}
                    card={card}
                    isFocused={isFocused}
                    onFocus={() => bringToFront(card.id)}
                    onUpdate={(updates) => handleUpdateCard(card.id, updates)}
                    onDelete={handleDeleteCard}
                    onDragStart={handleDragStart}
                    onResizeStart={handleResizeStart}
                    onOpenInBrowser={(url) => handleAddBrowser(url)}
                  />
                )
              }

              if (card.kind === 'port-monitor') {
                return (
                  <PortMonitorCard
                    key={card.id}
                    card={card}
                    isFocused={isFocused}
                    onFocus={() => bringToFront(card.id)}
                    onUpdate={(updates) => handleUpdateCard(card.id, updates)}
                    onDelete={handleDeleteCard}
                    onDragStart={handleDragStart}
                    onResizeStart={handleResizeStart}
                    onOpenInBrowser={(url) => handleAddBrowser(url)}
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
                  onOpenInBrowser={(url) => handleAddBrowser(url)}
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
              Usa los botones "+ Console", "+ Browser", "+ Explorer" o "+ Ports" arriba para agregar nodos.
            </span>
          </div>
        )}

        {/* Floating Minimap (Bottom Right) */}
        {showMinimap && cards.length > 0 && minimapData && (
          <div
            onWheel={(e) => e.stopPropagation()}
            className="minimap-container absolute bottom-4 right-4 z-40 w-56 bg-[#0d1017]/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-2 select-none font-mono"
          >
            <div className="flex items-center justify-between text-[10px] text-zinc-400 border-b border-zinc-800/80 pb-1 mb-1.5">
              <span className="font-semibold text-emerald-400 flex items-center space-x-1">
                <MapPin size={11} />
                <span>MINIMAP</span>
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-[9px] text-zinc-500 bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800">
                  {Math.round(zoom * 100)}%
                </span>
                <span className="text-zinc-500">{cards.length} nodos</span>
                <button
                  onClick={() => setShowMinimap(false)}
                  className="p-0.5 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Ocultar minimapa"
                >
                  <X size={11} />
                </button>
              </div>
            </div>

            <div
              ref={minimapBoxRef}
              onMouseDown={handleMinimapMouseDown}
              className="relative w-full h-28 bg-[#06080b] rounded border border-zinc-800/80 cursor-crosshair overflow-hidden shadow-inner"
            >
              {/* Connector lines in minimap */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                {connectors.map((conn) => {
                  const fromCard = cards.find((c) => c.id === conn.fromId)
                  const toCard = cards.find((c) => c.id === conn.toId)
                  if (!fromCard || !toCard) return null

                  const x1 = minimapData.offsetX + (fromCard.x + fromCard.width / 2 - minimapData.worldMinX) * minimapData.scale
                  const y1 = minimapData.offsetY + (fromCard.y + fromCard.height / 2 - minimapData.worldMinY) * minimapData.scale
                  const x2 = minimapData.offsetX + (toCard.x + toCard.width / 2 - minimapData.worldMinX) * minimapData.scale
                  const y2 = minimapData.offsetY + (toCard.y + toCard.height / 2 - minimapData.worldMinY) * minimapData.scale

                  return (
                    <line
                      key={conn.id}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={conn.color || '#10b981'}
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      opacity="0.6"
                    />
                  )
                })}
              </svg>

              {/* Cards in minimap */}
              {cards.map((c) => {
                const cardX = minimapData.offsetX + (c.x - minimapData.worldMinX) * minimapData.scale
                const cardY = minimapData.offsetY + (c.y - minimapData.worldMinY) * minimapData.scale
                const cardW = Math.max(5, c.width * minimapData.scale)
                const cardH = Math.max(4, c.height * minimapData.scale)

                let color = 'bg-emerald-500'
                if (c.kind === 'browser') color = 'bg-cyan-500'
                if (c.kind === 'note') color = 'bg-amber-500'
                if (c.kind === 'explorer') color = 'bg-indigo-500'
                if (c.kind === 'port-monitor') color = 'bg-rose-500'

                const isFocused = c.id === focusedCardId

                return (
                  <div
                    key={c.id}
                    style={{
                      left: `${cardX}px`,
                      top: `${cardY}px`,
                      width: `${cardW}px`,
                      height: `${cardH}px`
                    }}
                    className={`absolute rounded-[1.5px] ${color} pointer-events-none transition-all ${
                      isFocused
                        ? 'ring-1 ring-white opacity-100 shadow-[0_0_6px_rgba(255,255,255,0.9)] z-10'
                        : 'opacity-70'
                    }`}
                  />
                )
              })}

              {/* Viewport Camera Box */}
              <div
                style={{
                  left: `${minimapData.viewportRect.x}px`,
                  top: `${minimapData.viewportRect.y}px`,
                  width: `${minimapData.viewportRect.w}px`,
                  height: `${minimapData.viewportRect.h}px`
                }}
                className="absolute border border-emerald-400 bg-emerald-500/15 rounded-[2px] pointer-events-none shadow-[0_0_10px_rgba(16,185,129,0.35)] transition-all duration-75"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
