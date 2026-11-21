import React, { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react'
import { ArrowLeftRight, Link, Monitor, Unlink } from 'lucide-react'
import { AgentStatus, CanvasCard, CanvasConnector, NodeKind, ProcessMetrics, Workspace, PanelConfig, DisplayInfo } from '../types'
import { TerminalCanvasCard } from './TerminalCanvasCard'
import { BrowserCard } from './BrowserCard'
import { VSCodeCard } from './VSCodeCard'
import { NoteCard, NoteTerminal } from './NoteCard'
import { FileExplorerCard } from './FileExplorerCard'
import { PortMonitorCard } from './PortMonitorCard'
import { GitCard } from './GitCard'
import { CanvasConnectors } from './CanvasConnectors'
import { CanvasMinimap } from './CanvasMinimap'
import { CanvasToolbar } from './CanvasToolbar'
import { terminalPool } from '../services/terminal-pool'
import { createCard, openingView, panelCards } from '../utils/cards'
import {
  alignmentGuides,
  boundsOf,
  Box,
  Edges,
  findSpot,
  fitCamera,
  GRID,
  MAX_ZOOM,
  MIN_ZOOM,
  resizeBox,
  SNAP_DISTANCE,
  snapPosition,
  travelToShow,
  within
} from '../utils/canvasGrid'
import { confirmDialog } from './Dialogs'

// Screen pixels the bottom toolbar takes from the canvas
const TOOLBAR_CLEARANCE = 72

const UNDO_DELETE_MS = 8000

const marqueeBox = (band: { fromX: number; fromY: number; toX: number; toY: number }): Box => ({
  x: Math.min(band.fromX, band.toX),
  y: Math.min(band.fromY, band.toY),
  width: Math.abs(band.toX - band.fromX),
  height: Math.abs(band.toY - band.fromY)
})

interface CanvasWorkspaceProps {
  workspace: Workspace
  panelsMetrics: Record<string, ProcessMetrics>
  agentStatuses: Record<string, AgentStatus>
  isVisible: boolean
  addCardRef?: React.Ref<(kind: NodeKind) => void>
  revealRequest?: { panelId: string; at: number } | null
  onSaveCanvasCards: (cards: CanvasCard[], connectors?: CanvasConnector[]) => void
  isSecondaryWindow?: boolean
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  workspace,
  panelsMetrics,
  agentStatuses,
  isVisible,
  addCardRef,
  revealRequest,
  onSaveCanvasCards,
  isSecondaryWindow = false
}) => {
  // Initialize cards from workspace panels or canvasCards
  const [cards, setCards] = useState<CanvasCard[]>(() => {
    if (Array.isArray(workspace.canvasCards)) {
      // Reconcile terminal cards with latest workspace.panels to ensure startup commands/paths are always accurate
      return workspace.canvasCards.map((card) => {
        if (card.kind !== 'terminal') return card
        const matchingPanel = workspace.panels?.find((p) => p.id === card.id)
        if (matchingPanel) {
          return {
            ...card,
            title: matchingPanel.title,
            cwd: matchingPanel.cwd,
            command: matchingPanel.command,
            commands: matchingPanel.commands,
            autoStart: matchingPanel.autoStart,
            env: matchingPanel.env
          }
        }
        return card
      })
    }
    // Generate initial canvas cards from existing panels only on first creation
    return panelCards(workspace.panels, [], openingView())
  })

  // Visual connectors state
  const [connectors, setConnectors] = useState<CanvasConnector[]>(() => workspace.canvasConnectors || [])
  const [isConnectMode, setIsConnectMode] = useState(false)
  const [connectStartId, setConnectStartId] = useState<string | null>(null)
  const [showMinimap, setShowMinimap] = useState(true)

  // Ref to track last saved cards to prevent circular loops
  const lastSavedCardsJsonRef = useRef<string>(JSON.stringify(cards))
  const cardsRef = useRef<CanvasCard[]>(cards)
  cardsRef.current = cards

  const connectorsRef = useRef<CanvasConnector[]>(connectors)
  connectorsRef.current = connectors

  // Synchronize when workspace.canvasCards changes externally (e.g. from CommandPalette)
  useEffect(() => {
    if (workspace.canvasCards) {
      const reconciledCards = workspace.canvasCards.map((card) => {
        if (card.kind !== 'terminal') return card
        const matchingPanel = workspace.panels?.find((p) => p.id === card.id)
        if (matchingPanel) {
          return {
            ...card,
            title: matchingPanel.title,
            cwd: matchingPanel.cwd,
            command: matchingPanel.command,
            commands: matchingPanel.commands,
            autoStart: matchingPanel.autoStart,
            env: matchingPanel.env
          }
        }
        return card
      })
      const incomingJson = JSON.stringify(reconciledCards)
      if (incomingJson !== lastSavedCardsJsonRef.current) {
        lastSavedCardsJsonRef.current = incomingJson
        cardsRef.current = reconciledCards
        setCards(reconciledCards)
      }
    }
  }, [workspace.canvasCards, workspace.panels])

  // Synchronize external changes to canvasConnectors
  useEffect(() => {
    if (workspace.canvasConnectors) {
      setConnectors((prev) => {
        if (
          prev.length === workspace.canvasConnectors!.length &&
          prev.every((c, idx) => c.id === workspace.canvasConnectors![idx].id)
        ) {
          return prev
        }
        connectorsRef.current = workspace.canvasConnectors!
        return workspace.canvasConnectors!
      })
    }
  }, [workspace.canvasConnectors])

  // Track previous panels to detect actual modifications/additions/deletions from WorkspaceModal
  const prevPanelsRef = useRef<PanelConfig[]>(workspace.panels)

  useEffect(() => {
    const prevPanels = prevPanelsRef.current
    prevPanelsRef.current = workspace.panels

    // Check if workspace.panels actually changed
    const panelsUnchanged =
      prevPanels.length === workspace.panels.length &&
      prevPanels.every((p, idx) => {
        const current = workspace.panels[idx]
        return (
          current &&
          p.id === current.id &&
          p.title === current.title &&
          p.cwd === current.cwd &&
          p.command === current.command &&
          JSON.stringify(p.commands) === JSON.stringify(current.commands) &&
          p.autoStart === current.autoStart
        )
      })

    if (panelsUnchanged) return

    setCards((prev) => {
      const currentPanelIds = new Set(workspace.panels.map((p) => p.id))
      const prevPanelIds = new Set(prevPanels.map((p) => p.id))

      // 1. A panel was deleted in WorkspaceModal if it was in prevPanels but is not in currentPanels
      // Canvas-created cards (whose id was never in prevPanels) are ALWAYS preserved!
      const kept = prev.filter((c) => {
        if (c.kind !== 'terminal') return true
        if (prevPanelIds.has(c.id) && !currentPanelIds.has(c.id)) {
          return false
        }
        return true
      })

      // 2. Update existing cards matching workspace.panels with latest title, cwd, command, autoStart
      const updated = kept.map((c) => {
        if (c.kind !== 'terminal') return c
        const p = workspace.panels.find((panel) => panel.id === c.id)
        if (p) {
          return {
            ...c,
            title: p.title,
            cwd: p.cwd,
            command: p.command,
            commands: p.commands,
            autoStart: p.autoStart,
            env: p.env
          }
        }
        return c
      })

      // 3. Newly added panels in WorkspaceModal (in currentPanels but not in prevPanelIds)
      const newlyAddedPanels = workspace.panels.filter(
        (p) => !prevPanelIds.has(p.id) && !updated.some((c) => c.id === p.id)
      )

      if (newlyAddedPanels.length === 0) {
        lastSavedCardsJsonRef.current = JSON.stringify(updated)
        onSaveCanvasCards(updated, connectors)
        return updated
      }

      const next = [...updated, ...panelCards(newlyAddedPanels, updated, visibleArea())]
      lastSavedCardsJsonRef.current = JSON.stringify(next)
      onSaveCanvasCards(next, connectors)
      return next
    })
  }, [workspace.panels, onSaveCanvasCards, connectors])

  // Camera & Linked Viewport State
  const [isCameraLinked, setIsCameraLinked] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('neowork-camera-linked')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })
  const isCameraLinkedRef = useRef(isCameraLinked)
  isCameraLinkedRef.current = isCameraLinked

  // Multi-Monitor & Multi-Window Companion State
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const displaysRef = useRef<DisplayInfo[]>([])
  displaysRef.current = displays
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false)

  // Pan & Zoom state
  // If secondary window, start pan.x offset by -1920 (Monitor 1 width) so it begins exactly where Monitor 1 ends
  const [pan, setPan] = useState<{ x: number; y: number }>(() => {
    if (isSecondaryWindow) {
      return { x: -1920, y: 0 }
    }
    return { x: 0, y: 0 }
  })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  const dragRafRef = useRef<number | null>(null)

  useEffect(() => {
    if (window.neoAPI.getMultiMonitorStatus) {
      window.neoAPI.getMultiMonitorStatus().then((status) => {
        if (status) {
          setDisplays(status.displays || [])
          setIsSecondaryOpen(status.isSecondaryOpen || false)
          if (isSecondaryWindow && status.displays?.[0]?.bounds?.width) {
            const w = status.displays[0].bounds.width
            setPan((prev) => (prev.x === -1920 ? { ...prev, x: -w } : prev))
          }
        }
      }).catch(() => {})
    }

    const unsubStatus = window.neoAPI.onMultiMonitorStatus?.((status) => {
      setDisplays(status.displays || [])
      setIsSecondaryOpen(status.isSecondaryOpen || false)
    })

    return () => {
      unsubStatus?.()
    }
  }, [isSecondaryWindow])

  // Cross-Window real-time canvas synchronization via BroadcastChannel
  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('neowork-canvas-sync')
      channel.onmessage = (event) => {
        const {
          type,
          cards: incomingCards,
          connectors: incomingConnectors,
          pan: incomingPan,
          zoom: incomingZoom,
          sender,
          linked
        } = event.data || {}

        if (type === 'cards:sync' && Array.isArray(incomingCards)) {
          const json = JSON.stringify(incomingCards)
          if (json !== lastSavedCardsJsonRef.current) {
            lastSavedCardsJsonRef.current = json
            cardsRef.current = incomingCards
            setCards(incomingCards)
          }
        }

        if (type === 'connectors:sync' && Array.isArray(incomingConnectors)) {
          connectorsRef.current = incomingConnectors
          setConnectors(incomingConnectors)
        }

        if (type === 'camera:sync' && isCameraLinkedRef.current && incomingPan && typeof incomingZoom === 'number') {
          const primaryW = displaysRef.current[0]?.bounds?.width || 1920
          remoteCameraRef.current = true
          if (isSecondaryWindow && sender === 'primary') {
            setPan({
              x: incomingPan.x - primaryW,
              y: incomingPan.y
            })
            setZoom(incomingZoom)
          } else if (!isSecondaryWindow && sender === 'secondary') {
            setPan({
              x: incomingPan.x + primaryW,
              y: incomingPan.y
            })
            setZoom(incomingZoom)
          }
        }

        if (type === 'camera:link_toggle' && typeof linked === 'boolean') {
          setIsCameraLinked(linked)
        }
      }
    } catch {}

    return () => {
      channel?.close()
    }
  }, [isSecondaryWindow])

  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)

  // Dragging card state; `group` is every card moving with the one held
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const dragStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    cardX: 0,
    cardY: 0,
    group: [] as { id: string; x: number; y: number }[]
  })

  // Resizing card state
  const [resizingCardId, setResizingCardId] = useState<string | null>(null)
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; box: Box; edges: Edges }>({
    mouseX: 0,
    mouseY: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
    edges: {}
  })

  // Multi-selection, and the rubber band that makes one, in world coordinates
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [marquee, setMarquee] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null)

  const [lastDeleted, setLastDeleted] = useState<{ cards: CanvasCard[]; connectors: CanvasConnector[] } | null>(null)

  // Where the camera was before focusing a card, to go back to it
  const viewBeforeFocusRef = useRef<{ cardId: string; pan: { x: number; y: number }; zoom: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  // Broadcast camera position to peer window when cameras are linked
  const broadcastCamera = useCallback(
    (nextPan: { x: number; y: number }, nextZoom: number) => {
      if (!isCameraLinkedRef.current) return
      try {
        const channel = new BroadcastChannel('neowork-canvas-sync')
        channel.postMessage({
          type: 'camera:sync',
          pan: nextPan,
          zoom: nextZoom,
          sender: isSecondaryWindow ? 'secondary' : 'primary'
        })
        channel.close()
      } catch {}
    },
    [isSecondaryWindow]
  )

  // Camera moves from the peer window are applied here, not echoed back
  const remoteCameraRef = useRef(false)
  useEffect(() => {
    if (remoteCameraRef.current) {
      remoteCameraRef.current = false
      return
    }
    broadcastCamera(pan, zoom)
  }, [pan, zoom, broadcastCamera])

  // The peer window follows a drag or resize live, at most once per frame
  const broadcastCardsPreview = (): void => {
    if (dragRafRef.current) return
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null
      try {
        const channel = new BroadcastChannel('neowork-canvas-sync')
        channel.postMessage({ type: 'cards:sync', cards: cardsRef.current })
        channel.close()
      } catch {}
    })
  }

  // Toggle Camera Linkage between screens
  const handleToggleCameraLink = (): void => {
    const next = !isCameraLinked
    setIsCameraLinked(next)
    try {
      localStorage.setItem('neowork-camera-linked', String(next))
      const channel = new BroadcastChannel('neowork-canvas-sync')
      channel.postMessage({ type: 'camera:link_toggle', linked: next })
      channel.close()
    } catch {}
  }

  // Quick camera viewport jump to Monitor 1 or Monitor 2
  const handleFocusMonitor = (monitorNum: 1 | 2): void => {
    const primaryW = displaysRef.current[0]?.bounds?.width || 1920
    const targetPan = monitorNum === 1 ? { x: 0, y: 0 } : { x: -primaryW, y: 0 }
    setPan(targetPan)
    setZoom(1)
  }

  // Sync to parent on card change and broadcast across windows
  const updateCardsAndNotify = useCallback(
    (updater: (prev: CanvasCard[]) => CanvasCard[]) => {
      setCards((prev) => {
        const next = updater(prev)
        cardsRef.current = next
        lastSavedCardsJsonRef.current = JSON.stringify(next)
        onSaveCanvasCards(next, connectorsRef.current)
        try {
          const channel = new BroadcastChannel('neowork-canvas-sync')
          channel.postMessage({ type: 'cards:sync', cards: next })
          channel.close()
        } catch {}
        return next
      })
    },
    [onSaveCanvasCards]
  )

  const updateConnectorsAndNotify = useCallback(
    (updater: (prev: CanvasConnector[]) => CanvasConnector[]) => {
      setConnectors((prev) => {
        const next = updater(prev)
        connectorsRef.current = next
        onSaveCanvasCards(cardsRef.current, next)
        try {
          const channel = new BroadcastChannel('neowork-canvas-sync')
          channel.postMessage({ type: 'connectors:sync', connectors: next })
          channel.close()
        } catch {}
        return next
      })
    },
    [onSaveCanvasCards]
  )

  const handleToggleSecondary = async (): Promise<void> => {
    if (isSecondaryOpen) {
      await window.neoAPI.closeSecondaryWindow()
      setIsSecondaryOpen(false)
    } else {
      const opened = await window.neoAPI.openSecondaryWindow()
      if (opened) setIsSecondaryOpen(true)
    }
  }

  const handleMoveWindow = async (displayIndex = 1): Promise<void> => {
    await window.neoAPI.moveWindowToDisplay(displayIndex)
  }

  // Seamless Card Transfer between Monitor 1 and Monitor 2
  const handleMoveCardToDisplay = async (cardId: string): Promise<void> => {
    const card = cardsRef.current.find((c) => c.id === cardId)
    if (!card) return

    if (!isSecondaryOpen && window.neoAPI.openSecondaryWindow) {
      const opened = await window.neoAPI.openSecondaryWindow()
      if (opened) setIsSecondaryOpen(true)
    }

    const primaryW = displaysRef.current[0]?.bounds?.width || 1920
    const isCurrentlyOnMonitor2 = card.x >= primaryW
    const nextX = isCurrentlyOnMonitor2
      ? Math.max(60, card.x - primaryW)
      : card.x + primaryW

    updateCardsAndNotify((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, x: Math.round(nextX) } : c))
    )
    setFocusedCardId(cardId)
  }

  // Multi-Monitor Keyboard Shortcuts (Ctrl+Alt+2, Ctrl+Alt+M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      if (isInput) return

      const isCtrlOrCmd = e.ctrlKey || e.metaKey
      if (isCtrlOrCmd && e.altKey) {
        if (e.key === '2') {
          e.preventDefault()
          handleToggleSecondary()
          return
        }
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault()
          handleMoveWindow(1)
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [displays, isSecondaryOpen])

  // The part of the screen cards can use, clear of the bottom toolbar
  const canvasSize = (): { width: number; height: number } => ({
    width: containerRef.current?.clientWidth || window.innerWidth,
    height: (containerRef.current?.clientHeight || window.innerHeight) - TOOLBAR_CLEARANCE
  })

  // The canvas the user can see, in world coordinates
  const visibleArea = (at = pan, scale = zoom): Box => {
    const { width, height } = canvasSize()
    return {
      x: -at.x / scale + GRID,
      y: -at.y / scale + GRID,
      width: width / scale - 2 * GRID,
      height: height / scale - GRID
    }
  }

  const reveal = (box: Box): void => {
    const { x, y } = travelToShow(box, visibleArea())
    setPan((prev) => ({ x: prev.x - x * zoom, y: prev.y - y * zoom }))
  }

  const frame = (box: Box): void => {
    const { width, height } = canvasSize()
    const camera = fitCamera(box, width, height)
    setZoom(camera.zoom)
    setPan(camera.pan)
  }

  const addCard = (kind: NodeKind, overrides?: Partial<CanvasCard>): void => {
    const newCard = createCard(kind, workspace, cards, visibleArea(), overrides)
    updateCardsAndNotify((prev) => [...prev, newCard])
    setFocusedCardId(newCard.id)
    reveal(newCard)
  }

  useImperativeHandle(addCardRef, () => addCard)

  // A notification opened from anywhere lands here; a hidden canvas has no size to work with yet
  const handledRevealRef = useRef(0)
  useEffect(() => {
    if (!revealRequest || !isVisible || revealRequest.at === handledRevealRef.current) return
    const card = cards.find((c) => c.id === revealRequest.panelId)
    if (!card) return
    handledRevealRef.current = revealRequest.at
    setFocusedCardId(card.id)
    reveal(card)
  }, [revealRequest, isVisible, cards])

  const handleAddBrowser = (url: string): void => addCard('browser', { url })

  // The repos a git card lists are the ones this workspace's terminals work in
  const terminalFolders = cards.flatMap((c) => (c.kind === 'terminal' && c.cwd ? [c.cwd] : []))
  const lastAgentFinishedAt = Object.values(agentStatuses)
    .filter((s) => s.workspaceId === workspace.id && s.state === 'done')
    .reduce((latest, s) => Math.max(latest, s.at), 0)

  const findConnector = (a: string, b: string): CanvasConnector | undefined =>
    connectorsRef.current.find((c) => (c.fromId === a && c.toId === b) || (c.fromId === b && c.toId === a))

  const connectCards = (fromId: string, toId: string): void => {
    if (findConnector(fromId, toId)) return
    const newConnector: CanvasConnector = { id: `conn-${Date.now()}`, fromId, toId, color: '#828384' }
    updateConnectorsAndNotify((prev) => [...prev, newConnector])
  }

  // Handle connection creation or disconnection toggle
  const handleCardClickForConnection = (cardId: string): void => {
    if (!isConnectMode) return
    if (!connectStartId) {
      setConnectStartId(cardId)
    } else {
      if (connectStartId !== cardId) {
        const existing = findConnector(connectStartId, cardId)
        if (existing) {
          // Already connected: toggle OFF (Disconnect!)
          handleDeleteConnector(existing.id)
        } else {
          connectCards(connectStartId, cardId)
        }
      }
      setConnectStartId(null)
      setIsConnectMode(false)
    }
  }

  const terminalsForNote = (noteId: string): NoteTerminal[] =>
    cards
      .filter((c) => c.kind === 'terminal')
      .map((c) => ({
        id: c.id,
        title: c.title || 'Terminal',
        state: agentStatuses[c.id]?.state,
        linked: !!findConnector(noteId, c.id)
      }))

  const handleDeleteConnector = (connId: string): void => {
    const nextConnectors = connectorsRef.current.filter((c) => c.id !== connId)
    connectorsRef.current = nextConnectors
    setConnectors(nextConnectors)
    onSaveCanvasCards(cardsRef.current, nextConnectors)
  }

  // Auto-arrange all cards in clean grid layout
  const handleAutoArrange = (): void => {
    if (cards.length === 0) return
    const view = visibleArea({ x: 0, y: 0 }, 1)
    viewBeforeFocusRef.current = null

    updateCardsAndNotify((prev) =>
      prev.reduce<CanvasCard[]>((placed, c) => {
        // Cards from before the grid have sizes that fall between its dots
        const width = Math.ceil(c.width / GRID) * GRID
        const height = Math.ceil(c.height / GRID) * GRID
        return [...placed, { ...c, ...findSpot(width, height, placed, view), width, height, zIndex: placed.length + 1 }]
      }, [])
    )
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  const handleDeleteCards = async (ids: string[]): Promise<void> => {
    const targets = cardsRef.current.filter((c) => ids.includes(c.id))
    if (targets.length === 0) return

    const working = targets.filter((c) => agentStatuses[c.id]?.state === 'working').map((c) => c.title)
    if (working.length > 0 && !(await confirmDialog(`${working.join(', ')} sigue trabajando. Si lo eliminas, se detendrá. ¿Eliminar?`))) {
      return
    }

    for (const target of targets) {
      terminalPool.destroyTerminal(target.id)
      if (target.kind === 'vscode' && target.vscodePort) {
        window.neoAPI.vscodeStopServer(target.vscodePort).catch(() => {})
      }
    }

    // Atomically filter both cards and attached connectors in a single synchronous operation
    const nextCards = cardsRef.current.filter((c) => !ids.includes(c.id))
    const nextConnectors = connectorsRef.current.filter((conn) => !ids.includes(conn.fromId) && !ids.includes(conn.toId))

    setLastDeleted({
      // The server just stopped, so its address means nothing to a restored card
      cards: targets.map((c) => (c.vscodePort ? { ...c, vscodePort: undefined, vscodeUrl: undefined } : c)),
      connectors: connectorsRef.current.filter((conn) => !nextConnectors.includes(conn))
    })

    cardsRef.current = nextCards
    connectorsRef.current = nextConnectors
    lastSavedCardsJsonRef.current = JSON.stringify(nextCards)

    setCards(nextCards)
    setConnectors(nextConnectors)
    onSaveCanvasCards(nextCards, nextConnectors)

    if (focusedCardId && ids.includes(focusedCardId)) setFocusedCardId(null)
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
  }

  const handleDeleteCard = (id: string): void => void handleDeleteCards([id])

  const handleUndoDelete = (): void => {
    if (!lastDeleted) return
    updateCardsAndNotify((prev) => [...prev, ...lastDeleted.cards])
    updateConnectorsAndNotify((prev) => [...prev, ...lastDeleted.connectors])
    setLastDeleted(null)
  }

  useEffect(() => {
    if (!lastDeleted) return
    const timer = setTimeout(() => setLastDeleted(null), UNDO_DELETE_MS)
    return () => clearTimeout(timer)
  }, [lastDeleted])

  useEffect(() => {
    if (!isVisible) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'Escape') setSelectedIds([])
      if (e.key === 'Delete' && selectedIds.length > 0) void handleDeleteCards(selectedIds)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

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

  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect()
    return {
      x: (clientX - (rect?.left ?? 0) - pan.x) / zoom,
      y: (clientY - (rect?.top ?? 0) - pan.y) / zoom
    }
  }

  // Mouse pan handlers
  const handleCanvasMouseDown = (e: React.MouseEvent): void => {
    if (e.button === 0 && e.shiftKey && e.target === surfaceRef.current) {
      const { x, y } = toWorld(e.clientX, e.clientY)
      setMarquee({ fromX: x, fromY: y, toX: x, toY: y })
      return
    }
    if (e.button === 1 || (e.button === 0 && e.target === surfaceRef.current)) {
      setFocusedCardId(null)
      setSelectedIds([])
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
      const newZoom = Math.min(Math.max(zoom * zoomFactor, MIN_ZOOM), MAX_ZOOM)
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

  // Refresh terminal metrics when zoom level changes to keep text sharp and aligned
  useEffect(() => {
    const timer = setTimeout(() => {
      terminalPool.refreshAllMetrics()
    }, 120)
    return () => clearTimeout(timer)
  }, [zoom])

  // Drag Card start
  const handleDragStart = (e: React.MouseEvent, id: string): void => {
    if (isConnectMode) {
      handleCardClickForConnection(id)
      return
    }
    e.stopPropagation()
    const targetCard = cards.find((c) => c.id === id)
    if (!targetCard) return

    if (e.shiftKey) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((other) => other !== id) : [...prev, id]))
      return
    }

    if (e.detail === 2 && !(e.target as HTMLElement).closest('button, input, select, a')) {
      toggleCardFocus(targetCard)
      return
    }

    const isGroup = selectedIds.includes(id)
    if (!isGroup) setSelectedIds([])

    bringToFront(id)
    setDraggingCardId(id)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      cardX: targetCard.x,
      cardY: targetCard.y,
      group: (isGroup ? cards.filter((c) => selectedIds.includes(c.id)) : [targetCard]).map(({ id, x, y }) => ({ id, x, y }))
    }
  }

  // Resize Card start
  const handleResizeStart = (e: React.MouseEvent, id: string, edges: Edges): void => {
    e.stopPropagation()
    const targetCard = cards.find((c) => c.id === id)
    if (!targetCard) return

    bringToFront(id)
    setResizingCardId(id)
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      box: { x: targetCard.x, y: targetCard.y, width: targetCard.width, height: targetCard.height },
      edges
    }
  }

  // Double-clicking a header brings the card up close; doing it again goes back
  const toggleCardFocus = (card: CanvasCard): void => {
    const before = viewBeforeFocusRef.current
    if (before?.cardId === card.id) {
      viewBeforeFocusRef.current = null
      setPan(before.pan)
      setZoom(before.zoom)
      return
    }
    viewBeforeFocusRef.current = { cardId: card.id, pan: before?.pan ?? pan, zoom: before?.zoom ?? zoom }
    setFocusedCardId(card.id)
    frame(card)
  }

  const handleFitAll = (): void => {
    if (cards.length > 0) frame(boundsOf(cards))
  }

  // Global mouse move & mouse up
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (marquee) {
        const { x, y } = toWorld(e.clientX, e.clientY)
        setMarquee({ ...marquee, toX: x, toY: y })
      } else if (isPanning) {
        const dx = e.clientX - panStartRef.current.mouseX
        const dy = e.clientY - panStartRef.current.mouseY
        const nextPan = {
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy
        }
        setPan(nextPan)
      } else if (draggingCardId) {
        const dx = (e.clientX - dragStartRef.current.mouseX) / zoom
        const dy = (e.clientY - dragStartRef.current.mouseY) / zoom
        const { cardX, cardY, group } = dragStartRef.current
        const x = Math.round(cardX + dx)
        const y = Math.round(cardY + dy)
        setCards((prev) => {
          const held = prev.find((c) => c.id === draggingCardId)
          if (!held) return prev
          const others = prev.filter((c) => !group.some((g) => g.id === c.id))
          // The whole group follows the card in hand, sticking included
          const snapped = snapPosition({ ...held, x, y }, others, SNAP_DISTANCE / zoom)
          return prev.map((c) => {
            const start = group.find((g) => g.id === c.id)
            return start ? { ...c, x: start.x + snapped.x - cardX, y: start.y + snapped.y - cardY } : c
          })
        })
        broadcastCardsPreview()
      } else if (resizingCardId) {
        const { mouseX, mouseY, box, edges } = resizeStartRef.current
        const dx = Math.round((e.clientX - mouseX) / zoom)
        const dy = Math.round((e.clientY - mouseY) / zoom)
        setCards((prev) => {
          const others = prev.filter((c) => c.id !== resizingCardId)
          return prev.map((c) =>
            c.id === resizingCardId ? { ...c, ...resizeBox(box, edges, dx, dy, others, SNAP_DISTANCE / zoom) } : c
          )
        })
        broadcastCardsPreview()
      }
    }

    const handleMouseUp = (): void => {
      if (marquee) {
        const band = marqueeBox(marquee)
        setSelectedIds(cards.filter((c) => within(c, band, 0)).map((c) => c.id))
        setMarquee(null)
      }
      if (isPanning) {
        setIsPanning(false)
      }
      if (draggingCardId || resizingCardId) {
        setDraggingCardId(null)
        setResizingCardId(null)
        const finalCards = cardsRef.current
        onSaveCanvasCards(finalCards, connectorsRef.current)
        try {
          const channel = new BroadcastChannel('neowork-canvas-sync')
          channel.postMessage({ type: 'cards:sync', cards: finalCards })
          channel.close()
        } catch {}
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPanning, marquee, draggingCardId, resizingCardId, zoom, pan, cards, connectors, onSaveCanvasCards])

  const handleZoomCenter = (factor: number): void => {
    const rect = containerRef.current?.getBoundingClientRect()
    const mx = rect ? rect.width / 2 : window.innerWidth / 2
    const my = rect ? rect.height / 2 : window.innerHeight / 2

    const newZoom = Math.min(Math.max(zoom * factor, MIN_ZOOM), MAX_ZOOM)
    if (newZoom === zoom) return

    const newPanX = mx - ((mx - pan.x) / zoom) * newZoom
    const newPanY = my - ((my - pan.y) / zoom) * newZoom

    setZoom(newZoom)
    setPan({ x: newPanX, y: newPanY })
  }

  const handleResetView = (): void => {
    viewBeforeFocusRef.current = null
    const primaryW = displaysRef.current[0]?.bounds?.width || 1920
    const targetPan = isSecondaryWindow ? { x: -primaryW, y: 0 } : { x: 0, y: 0 }
    setPan(targetPan)
    setZoom(1)
  }

  const heldCard = cards.find((c) => c.id === (draggingCardId ?? resizingCardId))
  const selectedCards = cards.filter((c) => selectedIds.includes(c.id))
  const movingIds = !heldCard ? [] : selectedIds.includes(heldCard.id) ? selectedIds : [heldCard.id]
  const canvasTopZ = cards.reduce((top, c) => Math.max(top, c.zIndex ?? 0), 50) + 1

  return (
    <div className="flex-1 relative h-full w-full min-h-0 select-none">
      <CanvasToolbar
        zoom={zoom}
        isConnectMode={isConnectMode}
        connectStartId={connectStartId}
        showMinimap={showMinimap}
        onAddCard={addCard}
        onToggleConnect={() => {
          setIsConnectMode(!isConnectMode)
          setConnectStartId(null)
        }}
        onToggleMinimap={() => setShowMinimap(!showMinimap)}
        onFitAll={handleFitAll}
        onArrange={handleAutoArrange}
        onZoom={handleZoomCenter}
        onResetView={handleResetView}
      />

      {displays.length > 1 && (
        <div
          onWheel={(e) => e.stopPropagation()}
          style={{ zoom: 'var(--island-scale)' } as React.CSSProperties}
          className="canvas-toolbar absolute bottom-4 left-4 z-40 flex items-center space-x-1 island rounded-full px-2 py-1.5 text-xs whitespace-nowrap"
        >
          <button
            onClick={handleToggleSecondary}
            title={isSecondaryOpen ? 'Cerrar ventana del Monitor 2' : `Abrir ventana en ${displays[1]?.label || 'Monitor 2'}`}
            className={`p-1.5 rounded-button transition-colors cursor-pointer ${
              isSecondaryOpen ? 'text-emerald-300 bg-emerald-500/15' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/10'
            }`}
          >
            <Monitor size={14} />
          </button>
          <button
            onClick={handleToggleCameraLink}
            title={isCameraLinked ? 'Cámaras vinculadas entre monitores' : 'Cámaras independientes'}
            className={`p-1.5 rounded-button transition-colors cursor-pointer ${
              isCameraLinked ? 'text-zinc-100 bg-white/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/10'
            }`}
          >
            {isCameraLinked ? <Link size={14} /> : <Unlink size={14} />}
          </button>
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => handleFocusMonitor(n)}
              title={`Centrar vista en Monitor ${n}`}
              className="px-1.5 py-1 rounded-button text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
            >
              M{n}
            </button>
          ))}
          <button
            onClick={() => handleMoveWindow(1)}
            title="Mover esta ventana al Monitor 2"
            className="p-1.5 rounded-button text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeftRight size={14} />
          </button>
        </div>
      )}

      {lastDeleted && (
        <div
          role="status"
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 island rounded-full flex items-center gap-3 pl-4 pr-1.5 py-1.5 text-xs text-zinc-200 whitespace-nowrap"
        >
          <span>
            {lastDeleted.cards.length === 1
              ? `Eliminada: ${lastDeleted.cards[0].title || 'tarjeta'}`
              : `${lastDeleted.cards.length} tarjetas eliminadas`}
          </span>
          <button
            onClick={handleUndoDelete}
            className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-zinc-100 transition-colors cursor-pointer"
          >
            Deshacer
          </button>
        </div>
      )}

      {/* While holding a card the mouse may cross a webview, which would swallow its events */}
      {(heldCard || marquee) && <div className="fixed inset-0 z-[60]" />}

      {/* Infinite Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? 'grabbing' : isConnectMode ? 'crosshair' : 'default' }}
        className="w-full h-full relative"
      >
        {/* Reaches the window edges so cards, panning and the grid run under the islands */}
        <div
          ref={surfaceRef}
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
            backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }}
          className="fixed inset-0"
        />

        {/* World Transform Layer */}
        <div
          style={{
            transform: `translate3d(${Math.round(pan.x)}px, ${Math.round(pan.y)}px, 0) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          {/* Dual Monitor Seam Boundary Line (Shows physical bezel connection at x = primaryMonitorWidth) */}
          {displays.length > 1 && (
            <div
              className="absolute pointer-events-none select-none z-10"
              style={{
                left: displays[0]?.bounds?.width || 1920,
                top: -10000,
                width: 2,
                height: 20000
              }}
            >
              {/* Glowing vertical seam */}
              <div className="w-full h-full border-l-2 border-dashed border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.35)]" />

              {/* Seam Markers along the vertical axis */}
              {[-500, 40, 600, 1200, 1800, 2400].map((yOffset) => (
                <div
                  key={yOffset}
                  className="absolute flex items-center -translate-x-1/2 whitespace-nowrap bg-zinc-950/95 border border-emerald-500/40 rounded-full px-3 py-1 shadow-2xl backdrop-blur-md"
                  style={{ top: 10000 + yOffset }}
                >
                  <div className="flex items-center space-x-2 text-[11px] font-mono">
                    <span className="text-zinc-400 font-medium">◀ {displays[0]?.label || 'MONITOR 1'}</span>
                    <span className="text-emerald-400 font-bold">|</span>
                    <span className="text-emerald-400 font-medium">{displays[1]?.label || 'MONITOR 2'} ▶</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <CanvasConnectors cards={cards} connectors={connectors} onDisconnect={handleDeleteConnector} />

          {/* Selection, rubber band and alignment guides, above every card */}
          {(heldCard || marquee || selectedCards.length > 0) && (
            <svg
              style={{ zIndex: canvasTopZ }}
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
            >
              {selectedCards.map((c) => (
                <rect
                  key={c.id}
                  data-selection-outline
                  x={c.x - 3}
                  y={c.y - 3}
                  width={c.width + 6}
                  height={c.height + 6}
                  rx={14}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={2}
                  className="stroke-signal"
                />
              ))}
              {marquee && (
                <rect
                  {...marqueeBox(marquee)}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={1}
                  className="stroke-signal fill-signal/10"
                />
              )}
              {heldCard &&
                alignmentGuides(
                  heldCard,
                  cards.filter((c) => !movingIds.includes(c.id))
                ).map((line, i) => (
                  <line key={i} {...line} vectorEffect="non-scaling-stroke" strokeWidth={2} className="stroke-signal" />
                ))}
            </svg>
          )}

          {/* Cards Layer. A Shift + click only selects: focusing the card would hand the keyboard to it */}
          <div
            onClickCapture={(e) => e.shiftKey && e.stopPropagation()}
            className="w-full h-full relative pointer-events-none"
          >
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
                    displaysCount={displays.length}
                    onMoveToNextDisplay={() => handleMoveCardToDisplay(card.id)}
                  />
                )
              }

              if (card.kind === 'note') {
                return (
                  <NoteCard
                    key={card.id}
                    card={card}
                    terminals={terminalsForNote(card.id)}
                    isFocused={isFocused}
                    onFocus={() => bringToFront(card.id)}
                    onUpdate={(updates) => handleUpdateCard(card.id, updates)}
                    onLinkTerminal={(terminalId) => connectCards(card.id, terminalId)}
                    onDelete={handleDeleteCard}
                    onDragStart={handleDragStart}
                    onResizeStart={handleResizeStart}
                  />
                )
              }

              if (card.kind === 'git') {
                return (
                  <GitCard
                    key={card.id}
                    card={card}
                    folders={terminalFolders}
                    isVisible={isVisible}
                    refreshKey={lastAgentFinishedAt}
                    isFocused={isFocused}
                    onFocus={() => bringToFront(card.id)}
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
                    displaysCount={displays.length}
                    onMoveToNextDisplay={() => handleMoveCardToDisplay(card.id)}
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
                    displaysCount={displays.length}
                    onMoveToNextDisplay={() => handleMoveCardToDisplay(card.id)}
                  />
                )
              }

              if (card.kind === 'vscode') {
                return (
                  <VSCodeCard
                    key={card.id}
                    card={card}
                    workspacePath={workspace.panels[0]?.cwd || ''}
                    isFocused={isFocused}
                    onFocus={() => bringToFront(card.id)}
                    onUpdate={(updates) => handleUpdateCard(card.id, updates)}
                    onDelete={handleDeleteCard}
                    onDragStart={handleDragStart}
                    onResizeStart={handleResizeStart}
                    displaysCount={displays.length}
                    onMoveToNextDisplay={() => handleMoveCardToDisplay(card.id)}
                  />
                )
              }

              return (
                <TerminalCanvasCard
                  key={card.id}
                  card={card}
                  metrics={panelsMetrics[card.id]}
                  agentStatus={agentStatuses[card.id]}
                  isFocused={isFocused}
                  onFocus={() => bringToFront(card.id)}
                  onUpdate={(updates) => handleUpdateCard(card.id, updates)}
                  onDelete={handleDeleteCard}
                  onDragStart={handleDragStart}
                  onResizeStart={handleResizeStart}
                  onOpenInBrowser={(url) => handleAddBrowser(url)}
                  displaysCount={displays.length}
                  onMoveToNextDisplay={() => handleMoveCardToDisplay(card.id)}
                />
              )
            })}
          </div>
        </div>

        {/* Empty state hint */}
        {cards.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 text-xs select-none pointer-events-none">
            <span className="display-serif text-5xl text-zinc-100 mb-3">Lienzo vacío</span>
            <span className="text-sm font-light text-zinc-400">
              Agrega una consola, un navegador o una nota desde la barra inferior.
            </span>
          </div>
        )}

        {showMinimap && (
          <CanvasMinimap
            cards={cards}
            connectors={connectors}
            pan={pan}
            zoom={zoom}
            focusedCardId={focusedCardId}
            containerRef={containerRef}
            onPan={setPan}
            onHide={() => setShowMinimap(false)}
          />
        )}
      </div>
    </div>
  )
}
