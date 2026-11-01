import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { Launchpad } from './components/Launchpad'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { CanvasWorkspace } from './components/CanvasWorkspace'
import { WorkspaceModal } from './components/WorkspaceModal'
import { SettingsModal } from './components/SettingsModal'
import { ShortcutsModal } from './components/ShortcutsModal'
import { CommandPaletteModal } from './components/CommandPaletteModal'
import { UpdateNotificationToast } from './components/UpdateNotificationToast'
import { AgentToasts } from './components/AgentToasts'
import { ActivityCenter } from './components/ActivityCenter'
import {
  AgentStatus,
  Workspace,
  AppState,
  TelemetryPayload,
  SidebarPosition,
  PanelConfig,
  CanvasCard,
  CanvasConnector,
  NodeKind,
  UpdateStatusPayload,
  TerminalThemeName,
  WorkspaceLayoutMode
} from './types'
import { terminalPool } from './services/terminal-pool'
import { createCard, openingView } from './utils/cards'
import { applyPalette, DEFAULT_WALLPAPER, readWallpaperPalette, wallpaperUrl } from './wallpapers'

const ACTIVITY_LIMIT = 30

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null)

  const [runningWorkspaceIds, setRunningWorkspaceIds] = useState<string[]>([])
  const [workspaceRestartKeys, setWorkspaceRestartKeys] = useState<Record<string, number>>({})
  const [activeSessionPanels, setActiveSessionPanels] = useState<Record<string, PanelConfig[]>>({})
  const [pendingChangesWorkspaceIds, setPendingChangesWorkspaceIds] = useState<string[]>([])

  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isSidebarVisible, setIsSidebarVisible] = useState(true)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null)
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({})
  const [attentionWorkspaceIds, setAttentionWorkspaceIds] = useState<string[]>([])
  const [agentToasts, setAgentToasts] = useState<AgentStatus[]>([])
  const [activityLog, setActivityLog] = useState<AgentStatus[]>([])
  const [revealRequest, setRevealRequest] = useState<{ panelId: string; at: number } | null>(null)

  const appStateRef = useRef<AppState | null>(null)
  appStateRef.current = appState

  const runningWorkspaceIdsRef = useRef<string[]>([])
  runningWorkspaceIdsRef.current = runningWorkspaceIds

  const addCanvasCardRef = useRef<((kind: NodeKind) => void) | null>(null)

  // Listeners registered once on mount go through this: the first render returns before the handlers exist
  const handlersRef = useRef<{
    selectWorkspace: (id: string) => void
    openPanel: (workspaceId: string, panelId: string) => void
    newWorkspace: () => void
    saveAll: () => Promise<void>
    restartWorkspace: (id: string) => Promise<void>
  } | null>(null)

  // 1. Load initial workspaces from store once on mount
  useEffect(() => {
    window.neoAPI
      .getStore()
      .then((state) => {
        setAppState(state)
        if (state.settings?.terminalTheme) {
          terminalPool.setTheme(state.settings.terminalTheme as TerminalThemeName)
        }
        if (state.settings?.terminalFontSize) {
          terminalPool.setFontSize(state.settings.terminalFontSize)
        }
        const initialWs =
          (state.activeWorkspaceId &&
            state.workspaces.find((w) => w.id === state.activeWorkspaceId)) ||
          state.workspaces[0]

        if (initialWs) {
          setActiveSessionPanels({
            [initialWs.id]: initialWs.panels
          })
          setRunningWorkspaceIds([initialWs.id])
        }
      })
      .catch((err) => {
        console.error('Failed to getStore from neoAPI:', err)
        setAppState({ activeWorkspaceId: '', workspaces: [] })
      })
  }, [])

  // 2. Listen to real-time telemetry updates
  useEffect(() => {
    const unsubscribe = window.neoAPI.onTelemetry((data) => {
      setTelemetry(data)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  // 3. Listen to auto-updater status updates
  useEffect(() => {
    const unsubscribe = window.neoAPI.onUpdaterStatus((status) => {
      setUpdateStatus(status)
    })
    const unsubRemoteWs = window.neoAPI.onRemoteWorkspaceSelect?.((wsId) => {
      handlersRef.current?.selectWorkspace(wsId)
    })
    return () => {
      unsubscribe()
      unsubRemoteWs?.()
    }
  }, [])

  // Agent runs across every workspace; finished ones elsewhere ask for attention
  useEffect(() => {
    const unsubscribeStatus = window.neoAPI.onAgentStatus((status) => {
      setAgentStatuses((prev) => {
        const { [status.panelId]: _previous, ...rest } = prev
        return status.state === 'stopped' ? rest : { ...rest, [status.panelId]: status }
      })
      setAgentToasts((prev) => {
        const others = prev.filter((t) => t.panelId !== status.panelId)
        return status.notify ? [...others, status].slice(-4) : others
      })
      if (status.log) setActivityLog((prev) => [status, ...prev].slice(0, ACTIVITY_LIMIT))
      if (status.notify) {
        setAttentionWorkspaceIds((prev) =>
          prev.includes(status.workspaceId) ? prev : [...prev, status.workspaceId]
        )
      }
    })
    const unsubscribeOpen = window.neoAPI.onAgentOpen(({ workspaceId, panelId }) => {
      handlersRef.current?.openPanel(workspaceId, panelId)
    })
    return () => {
      unsubscribeStatus()
      unsubscribeOpen()
    }
  }, [])

  const dismissAgentToast = useCallback((panelId: string): void => {
    setAgentToasts((prev) => prev.filter((t) => t.panelId !== panelId))
  }, [])

  // 3. Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable

      // Help modal with ? (Shift + /)
      if (!isInput && e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setIsShortcutsModalOpen((prev) => !prev)
        return
      }

      // Escape closes open modals
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false)
        setIsShortcutsModalOpen(false)
        setIsSettingsModalOpen(false)
        setIsWorkspaceModalOpen(false)
        return
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey

      // Ctrl + K or Ctrl + P: Command Palette
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setIsCommandPaletteOpen((prev) => !prev)
        return
      }

      // Ctrl + N: Create new workspace
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        handlersRef.current?.newWorkspace()
        return
      }

      // Ctrl + B: Toggle sidebar visibility
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        setIsSidebarVisible((prev) => !prev)
        return
      }

      // Ctrl + S: Save all workspaces
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        handlersRef.current?.saveAll()
        return
      }

      const current = appStateRef.current
      if (!current) return

      // Ctrl + Shift + R: Restart active workspace
      if (isCtrlOrCmd && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        if (current.activeWorkspaceId) {
          handlersRef.current?.restartWorkspace(current.activeWorkspaceId)
        }
        return
      }

      // Ctrl + 1..9: Quick switch workspaces
      if (isCtrlOrCmd && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1
        if (current.workspaces[index]) {
          e.preventDefault()
          handlersRef.current?.selectWorkspace(current.workspaces[index].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  const handleSaveCanvasCards = useCallback(
    (
      workspaceId: string,
      cards: CanvasCard[],
      connectors?: CanvasConnector[]
    ): void => {
      setAppState((prev) => {
        if (!prev) return prev
        const updatedWorkspaces = prev.workspaces.map((w) => {
          if (w.id !== workspaceId) return w

          // Synchronize terminal cards into panels so Grid mode and WorkspaceModal always have the latest commands/paths
          const updatedPanels = w.panels.map((p) => {
            const matchingCard = cards.find((c) => c.kind === 'terminal' && c.id === p.id)
            if (matchingCard) {
              return {
                ...p,
                title: matchingCard.title || p.title,
                cwd: matchingCard.cwd !== undefined ? matchingCard.cwd : p.cwd,
                command: matchingCard.command !== undefined ? matchingCard.command : p.command,
                autoStart: matchingCard.autoStart !== undefined ? matchingCard.autoStart : p.autoStart,
                env: matchingCard.env || p.env
              }
            }
            return p
          })

          return {
            ...w,
            panels: updatedPanels,
            canvasCards: cards,
            ...(connectors !== undefined ? { canvasConnectors: connectors } : {})
          }
        })
        const nextState: AppState = { ...prev, workspaces: updatedWorkspaces }
        window.neoAPI.saveStore(nextState)
        return nextState
      })
    },
    []
  )

  // The whole palette follows the selected wallpaper
  const isLoaded = appState !== null
  const selectedWallpaper = appState?.settings?.wallpaper
  useEffect(() => {
    if (!isLoaded) return
    let cancelled = false
    readWallpaperPalette(selectedWallpaper)
      .catch(() => null)
      .then((palette) => {
        if (cancelled) return
        applyPalette(palette)
        terminalPool.setWallpaperColors(palette?.terminal ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [isLoaded, selectedWallpaper])

  useEffect(() => {
    if (isLoaded) window.neoAPI.setRunningWorkspaces(runningWorkspaceIds)
  }, [isLoaded, runningWorkspaceIds])

  if (!appState) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-void text-zinc-400 text-xs">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-signal animate-ping"></span>
          <span>INITIALIZING NEO-WORKSPACE ORCHESTRATOR...</span>
        </div>
      </div>
    )
  }

  const activeWorkspace: Workspace | undefined =
    appState.workspaces.find((w) => w.id === appState.activeWorkspaceId) || appState.workspaces[0]

  const sidebarPosition: SidebarPosition = appState.settings?.sidebarPosition || 'left'
  const currentWallpaper = appState.settings?.wallpaper ?? DEFAULT_WALLPAPER
  const backgroundUrl = wallpaperUrl(currentWallpaper)
  const wallpaperLook = appState.settings?.wallpaperAppearance?.[currentWallpaper]
  const islandOpacity = wallpaperLook?.islandOpacity ?? appState.settings?.islandOpacity ?? 0.7
  const islandBlur = wallpaperLook?.islandBlur ?? appState.settings?.islandBlur ?? 10

  const persistState = async (newState: AppState): Promise<void> => {
    setAppState(newState)
    await window.neoAPI.saveStore(newState)
  }

  const handleUpdateSidebarPosition = (pos: SidebarPosition): void => {
    const updatedState: AppState = {
      ...appState,
      settings: {
        ...appState.settings,
        sidebarPosition: pos
      }
    }
    persistState(updatedState)
  }

  const handleSelectWorkspace = (id: string): void => {
    setAttentionWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
    setAgentToasts((prev) => prev.filter((t) => t.workspaceId !== id))
    if (id === appState.activeWorkspaceId) return

    const updated: AppState = { ...appState, activeWorkspaceId: id }
    persistState(updated)

    // Automatically start the workspace if not already running
    if (!runningWorkspaceIds.includes(id)) {
      const ws = appState.workspaces.find((w) => w.id === id)
      if (ws) {
        setActiveSessionPanels((prev) => ({
          ...prev,
          [id]: ws.panels
        }))
      }
      setPendingChangesWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
      setRunningWorkspaceIds((prev) => [...prev, id])
    }
  }

  const handleStartWorkspace = (id: string): void => {
    const ws = appState.workspaces.find((w) => w.id === id)
    if (ws) {
      setActiveSessionPanels((prev) => ({
        ...prev,
        [id]: ws.panels
      }))
    }
    setPendingChangesWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
    if (!runningWorkspaceIds.includes(id)) {
      setRunningWorkspaceIds((prev) => [...prev, id])
    }
  }

  const handleStopWorkspace = async (id: string): Promise<void> => {
    const ws = appState.workspaces.find((w) => w.id === id)
    const sessionPanels = activeSessionPanels[id] || []
    const wsPanels = ws?.panels || []
    const canvasTerminalCards = (ws?.canvasCards || []).filter((c) => c.kind === 'terminal')

    const idsToKill = new Set<string>([
      ...sessionPanels.map((p) => p.id),
      ...wsPanels.map((p) => p.id),
      ...canvasTerminalCards.map((c) => c.id)
    ])

    if (idsToKill.size > 0) {
      // Kill all active terminals for this workspace's panels and canvas cards
      await Promise.all(
        Array.from(idsToKill).map(async (terminalId) => {
          terminalPool.destroyTerminal(terminalId)
          return window.neoAPI.killTerminal(terminalId)
        })
      )
    }
    setRunningWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
    setPendingChangesWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
    setActiveSessionPanels((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  const handleRestartWorkspace = async (id: string): Promise<void> => {
    const ws = appState.workspaces.find((w) => w.id === id)
    if (ws) {
      // 1. Identify previous panels for this workspace
      const previousPanels = activeSessionPanels[id] || []
      const currentPanelIds = new Set(ws.panels.map((p) => p.id))
      const currentCanvasTerminalIds = new Set(
        (ws.canvasCards || []).filter((c) => c.kind === 'terminal').map((c) => c.id)
      )

      // 2. Kill and destroy any panels that were removed
      for (const prevPanel of previousPanels) {
        if (!currentPanelIds.has(prevPanel.id) && !currentCanvasTerminalIds.has(prevPanel.id)) {
          terminalPool.destroyTerminal(prevPanel.id)
          await window.neoAPI.killTerminal(prevPanel.id)
        }
      }

      // 3. For all panels in the latest workspace config, reconfigure and restart
      ws.panels.forEach((p) => {
        const existing = terminalPool.getTerminal(p.id)
        if (existing) {
          existing.restart({
            cwd: p.cwd,
            command: p.command,
            env: p.env,
            autoStart: p.autoStart
          })
        }
      })

      // 4. For any additional terminal cards in canvasCards, reconfigure and restart
      if (ws.canvasCards) {
        ws.canvasCards.forEach((c) => {
          if (c.kind === 'terminal') {
            const existing = terminalPool.getTerminal(c.id)
            if (existing) {
              existing.restart({
                cwd: c.cwd || '',
                command: c.command || '',
                env: c.env,
                autoStart: c.autoStart ?? true
              })
            }
          }
        })
      }

      setActiveSessionPanels((prev) => ({
        ...prev,
        [id]: ws.panels
      }))
    }
    setPendingChangesWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
    setWorkspaceRestartKeys((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }))
  }

  const handleNewWorkspace = (): void => {
    setEditingWorkspace(null)
    setIsWorkspaceModalOpen(true)
  }

  const handleEditWorkspace = (ws: Workspace): void => {
    setEditingWorkspace(ws)
    setIsWorkspaceModalOpen(true)
  }

  const handleSaveWorkspaceModal = (savedWorkspace: Workspace): void => {
    // Safety sync: ensure canvasCards terminals always reflect latest panels
    const cleanSavedWorkspace = { ...savedWorkspace }
    if (cleanSavedWorkspace.canvasCards && cleanSavedWorkspace.panels) {
      cleanSavedWorkspace.canvasCards = cleanSavedWorkspace.canvasCards.map((card) => {
        if (card.kind !== 'terminal') return card
        const matchingPanel = cleanSavedWorkspace.panels.find((p) => p.id === card.id)
        if (matchingPanel) {
          return {
            ...card,
            title: matchingPanel.title,
            cwd: matchingPanel.cwd,
            command: matchingPanel.command,
            autoStart: matchingPanel.autoStart,
            env: matchingPanel.env
          }
        }
        return card
      })
    }

    let updatedWorkspaces: Workspace[]
    const isRunning = runningWorkspaceIds.includes(cleanSavedWorkspace.id)

    if (editingWorkspace) {
      updatedWorkspaces = appState.workspaces.map((w) =>
        w.id === cleanSavedWorkspace.id ? cleanSavedWorkspace : w
      )
      if (isRunning) {
        // Workspace is currently running: do NOT restart terminals or touch activeSessionPanels!
        // Running consoles will NOT be interrupted. Flag workspace as having pending config changes.
        setPendingChangesWorkspaceIds((prev) =>
          prev.includes(cleanSavedWorkspace.id) ? prev : [...prev, cleanSavedWorkspace.id]
        )
      } else {
        // Workspace is stopped: update session panels configuration directly
        setActiveSessionPanels((prev) => ({
          ...prev,
          [cleanSavedWorkspace.id]: cleanSavedWorkspace.panels
        }))
        setPendingChangesWorkspaceIds((prev) => prev.filter((id) => id !== cleanSavedWorkspace.id))
      }
    } else {
      updatedWorkspaces = [...appState.workspaces, cleanSavedWorkspace]
      // Start the newly created workspace
      setActiveSessionPanels((prev) => ({
        ...prev,
        [cleanSavedWorkspace.id]: cleanSavedWorkspace.panels
      }))
      setRunningWorkspaceIds((prev) => [...prev, cleanSavedWorkspace.id])
    }

    const updatedState: AppState = {
      ...appState,
      workspaces: updatedWorkspaces,
      activeWorkspaceId: cleanSavedWorkspace.id
    }

    persistState(updatedState)
    setIsWorkspaceModalOpen(false)
    setEditingWorkspace(null)
  }

  const handleDeleteWorkspace = async (id: string): Promise<void> => {
    // Stop terminals if running
    await handleStopWorkspace(id)

    setPendingChangesWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
    setActiveSessionPanels((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })

    const updatedWorkspaces = appState.workspaces.filter((w) => w.id !== id)
    let newActiveId = appState.activeWorkspaceId
    if (newActiveId === id) {
      newActiveId = updatedWorkspaces.length > 0 ? updatedWorkspaces[0].id : ''
      if (newActiveId && !runningWorkspaceIds.includes(newActiveId)) {
        const nextWs = updatedWorkspaces[0]
        setActiveSessionPanels((prev) => ({
          ...prev,
          [newActiveId]: nextWs.panels
        }))
        setRunningWorkspaceIds((prev) => [...prev, newActiveId])
      }
    }

    const updatedState: AppState = {
      ...appState,
      workspaces: updatedWorkspaces,
      activeWorkspaceId: newActiveId
    }

    persistState(updatedState)
  }

  const handleSaveAll = async (): Promise<void> => {
    if (appState) {
      await window.neoAPI.saveStore(appState)
    }
  }

  const handleOpenPanel = (workspaceId: string, panelId: string): void => {
    handleSelectWorkspace(workspaceId)
    setRevealRequest({ panelId, at: Date.now() })
  }

  handlersRef.current = {
    selectWorkspace: handleSelectWorkspace,
    openPanel: handleOpenPanel,
    newWorkspace: handleNewWorkspace,
    saveAll: handleSaveAll,
    restartWorkspace: handleRestartWorkspace
  }

  const handleResetDefaults = async (): Promise<void> => {
    terminalPool.destroyAll()
    await window.neoAPI.killAllTerminals()
    setRunningWorkspaceIds([])
    setActiveSessionPanels({})
    setPendingChangesWorkspaceIds([])
    const freshState = await window.neoAPI.getStore()
    setAppState(freshState)
    if (freshState.activeWorkspaceId) {
      const activeWs =
        freshState.workspaces.find((w) => w.id === freshState.activeWorkspaceId) ||
        freshState.workspaces[0]
      if (activeWs) {
        setActiveSessionPanels({
          [activeWs.id]: activeWs.panels
        })
        setRunningWorkspaceIds([activeWs.id])
      }
    }
  }

  const isCurrentWorkspaceRunning = activeWorkspace
    ? runningWorkspaceIds.includes(activeWorkspace.id)
    : false
  const currentSessionPanels = activeWorkspace
    ? activeSessionPanels[activeWorkspace.id] || activeWorkspace.panels
    : []
  const hasPendingChanges = activeWorkspace
    ? pendingChangesWorkspaceIds.includes(activeWorkspace.id)
    : false

  // Calculate count of active terminal processes across ALL running workspaces
  // Main workspace view containing header, idle message and terminal grid
  const mainWorkspaceContent = (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 gap-1.5 relative">
      {!activeWorkspace ? (
        <div className="flex-1 flex items-center justify-center p-8 select-none">
          <div className="island flex flex-col items-center text-center p-10 max-w-xl">
          <span className="stamp text-[10px] text-zinc-400 mb-4">NWS</span>
          <h2 className="display-serif text-6xl text-zinc-100 mb-4">Tu nuevo espacio</h2>
          <p className="text-sm font-light text-zinc-400 max-w-md mb-8 leading-relaxed">
            Crea tu primer entorno de trabajo con tus terminales, rutas de proyecto y comandos de inicio.
          </p>
          <button
            onClick={handleNewWorkspace}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-button bg-signal hover:bg-signal/85 text-zinc-950 font-medium text-xs transition-colors"
          >
            <span>Crear primer workspace</span>
          </button>
          </div>
        </div>
      ) : (
        <>
          {/* If the current workspace is stopped, show idle prompt */}
          {!isCurrentWorkspaceRunning && (
            <div className="flex-1 flex items-center justify-center p-6 select-none">
              <div className="island flex flex-col items-center text-center p-10 max-w-xl">
              <span className="stamp text-[10px] text-zinc-400 mb-4">Workspace detenido</span>
              <h3 className="display-serif text-5xl text-zinc-100 mb-4">{activeWorkspace.name}</h3>
              <p className="text-sm font-light text-zinc-400 max-w-sm mb-8 leading-relaxed">
                Las {activeWorkspace.panels.length} terminales de este workspace no se están ejecutando.
              </p>
              <button
                onClick={() => handleStartWorkspace(activeWorkspace.id)}
                className="flex items-center space-x-2 px-5 py-2 rounded-button bg-signal hover:bg-signal/85 text-zinc-950 font-medium text-xs transition-colors"
              >
                <Play size={14} fill="currentColor" />
                <span>Iniciar terminales</span>
              </button>
              </div>
            </div>
          )}

          {/* Render running workspaces: active one is visible, others stay mounted in background via 'hidden' */}
          {appState.workspaces
            .filter((ws) => runningWorkspaceIds.includes(ws.id))
            .map((ws) => {
              const isSelected = ws.id === activeWorkspace.id
              const restartKey = workspaceRestartKeys[ws.id] || 0

              return (
                <div
                  key={ws.id}
                  className={`flex-1 min-h-0 min-w-0 h-full w-full ${
                    isSelected ? 'flex flex-col' : 'hidden'
                  }`}
                >
                  <CanvasWorkspace
                    key={`${ws.id}-${restartKey}-canvas`}
                    workspace={ws}
                    panelsMetrics={telemetry?.panels || {}}
                    agentStatuses={agentStatuses}
                    isVisible={isSelected}
                    addCardRef={isSelected ? addCanvasCardRef : undefined}
                    revealRequest={isSelected ? revealRequest : null}
                    onSaveCanvasCards={(cards, connectors) => handleSaveCanvasCards(ws.id, cards, connectors)}
                  />
                </div>
              )
            })}
        </>
      )}
    </main>
  )

  const handleDuplicateWorkspace = (ws: Workspace): void => {
    if (!appState) return
    const newId = `ws-${Date.now()}`
    const cloned: Workspace = {
      ...ws,
      id: newId,
      name: `${ws.name} (Copia)`,
      code: `${(appState.workspaces.length + 1).toString().padStart(2, '0')}`,
      panels: ws.panels.map((p, idx) => ({
        ...p,
        id: `panel-${Date.now()}-${idx + 1}`
      })),
      canvasCards: ws.canvasCards?.map((c, idx) => ({
        ...c,
        id: c.kind === 'terminal' ? `panel-${Date.now()}-${idx + 1}` : `${c.kind}-${Date.now()}-${idx + 1}`
      }))
    }
    const nextWorkspaces = [...appState.workspaces, cloned]
    const nextState = { ...appState, workspaces: nextWorkspaces }
    persistState(nextState)
  }

  const handleExportWorkspaces = async (): Promise<void> => {
    if (!appState) return
    const jsonStr = JSON.stringify(appState.workspaces, null, 2)
    await window.neoAPI.writeClipboard(jsonStr)
    alert('¡Configuración de workspaces copiada al portapapeles en formato JSON!')
  }

  const handleImportWorkspaces = async (): Promise<void> => {
    if (!appState) return
    const text = await window.neoAPI.readClipboard()
    let raw = text
    if (!raw || !raw.trim().startsWith('[')) {
      const input = prompt('Pega aquí el contenido JSON de los workspaces:')
      if (!input) return
      raw = input
    }
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (confirm(`¿Importar ${parsed.length} workspaces y añadirlos a tu lista actual?`)) {
          const imported = parsed.map((w: Workspace, i: number) => ({
            ...w,
            id: `ws-${Date.now()}-${i + 1}`
          }))
          const nextWorkspaces = [...appState.workspaces, ...imported]
          const nextState = { ...appState, workspaces: nextWorkspaces }
          persistState(nextState)
          alert(`¡${imported.length} workspaces importados con éxito!`)
        }
      } else {
        alert('El texto pegado no es una lista de workspaces válida.')
      }
    } catch (e) {
      alert(`Error al analizar JSON: ${e}`)
    }
  }

  const handleThemeChange = (theme: TerminalThemeName): void => {
    if (!appState) return
    terminalPool.setTheme(theme)
    const nextSettings = {
      ...appState.settings,
      sidebarPosition: appState.settings?.sidebarPosition || 'left',
      terminalTheme: theme
    }
    const nextState = { ...appState, settings: nextSettings }
    persistState(nextState)
  }

  const handleWallpaperChange = (wallpaper: string): void => {
    const settings = { ...appState.settings, sidebarPosition, wallpaper }
    persistState({ ...appState, settings })
  }

  const handleWallpaperRemoved = (wallpaper: string): void => {
    const { [wallpaper]: _removed, ...wallpaperAppearance } = appState.settings?.wallpaperAppearance ?? {}
    const settings = { ...appState.settings, sidebarPosition, wallpaperAppearance }
    if (settings.wallpaper === wallpaper) delete settings.wallpaper
    persistState({ ...appState, settings })
  }

  const handleAppearanceChange = (patch: {
    islandScale?: number
    islandOpacity?: number
    islandBlur?: number
    railHeight?: number
  }): void => {
    // Glass is remembered per wallpaper; size applies everywhere
    const { islandOpacity, islandBlur, ...shared } = patch
    const glass = { ...(islandOpacity !== undefined && { islandOpacity }), ...(islandBlur !== undefined && { islandBlur }) }
    const settings = {
      ...appState.settings,
      sidebarPosition,
      ...shared,
      wallpaperAppearance: {
        ...appState.settings?.wallpaperAppearance,
        [currentWallpaper]: { ...appState.settings?.wallpaperAppearance?.[currentWallpaper], ...glass }
      }
    }
    persistState({ ...appState, settings })
  }

  const handleFontSizeChange = (size: number): void => {
    if (!appState) return
    terminalPool.setFontSize(size)
    const nextSettings = {
      ...appState.settings,
      sidebarPosition: appState.settings?.sidebarPosition || 'left',
      terminalFontSize: size
    }
    const nextState = { ...appState, settings: nextSettings }
    persistState(nextState)
  }

  const handleDefaultShellChange = (defaultShell: string): void => {
    persistState({ ...appState, settings: { ...appState.settings, sidebarPosition, defaultShell } })
  }

  const workspaceActions = activeWorkspace && (
    <WorkspaceHeader
      workspace={activeWorkspace}
      activePanels={currentSessionPanels}
      isRunning={isCurrentWorkspaceRunning}
      hasPendingChanges={hasPendingChanges}
      onEditWorkspace={() => handleEditWorkspace(activeWorkspace)}
      onRestartAll={() => handleRestartWorkspace(activeWorkspace.id)}
      onStartWorkspace={() => handleStartWorkspace(activeWorkspace.id)}
      onStopWorkspace={() => handleStopWorkspace(activeWorkspace.id)}
    />
  )

  const launchpadComponent = (
    <Launchpad
      workspaces={appState.workspaces}
      activeWorkspaceId={appState.activeWorkspaceId}
      runningWorkspaceIds={runningWorkspaceIds}
      pendingChangesWorkspaceIds={pendingChangesWorkspaceIds}
      attentionWorkspaceIds={attentionWorkspaceIds}
      workingWorkspaceIds={Object.values(agentStatuses)
        .filter((s) => s.state === 'working')
        .map((s) => s.workspaceId)}
      position={sidebarPosition}
      railHeight={appState.settings?.railHeight ?? 200}
      onSelectWorkspace={handleSelectWorkspace}
      onNewWorkspace={handleNewWorkspace}
      onEditWorkspace={handleEditWorkspace}
      onDuplicateWorkspace={handleDuplicateWorkspace}
      onDeleteWorkspace={handleDeleteWorkspace}
      onStopWorkspace={handleStopWorkspace}
    />
  )

  const handleCheckForUpdates = (): void => {
    window.neoAPI.checkForUpdates()
  }

  const handleDownloadUpdate = (): void => {
    window.neoAPI.downloadUpdate()
  }

  const handleQuitAndInstallUpdate = (): void => {
    window.neoAPI.quitAndInstallUpdate()
  }

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-clip bg-void bg-cover bg-center text-zinc-200 gap-1.5 p-1.5"
      style={
        {
          ...(backgroundUrl ? { backgroundImage: `url("${backgroundUrl}")` } : {}),
          '--island-alpha': islandOpacity,
          '--island-blur': `${islandBlur}px`,
          '--island-scale': appState.settings?.islandScale ?? 1
        } as React.CSSProperties
      }
    >
      {/* Top islands: branding + palette on the left, workspace actions + tools on the right */}
      <TitleBar
        systemMetrics={telemetry?.system}
        workspaceActions={workspaceActions}
        activity={
          <ActivityCenter
            events={activityLog}
            onOpen={(status) => handleOpenPanel(status.workspaceId, status.panelId)}
          />
        }
        workspaceFolders={(activeWorkspace?.panels || []).map((p) => p.cwd).filter((cwd): cwd is string => !!cwd)}
        updateAvailable={updateStatus?.state === 'available' || updateStatus?.state === 'downloaded'}
        onSave={handleSaveAll}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {isSidebarVisible && sidebarPosition === 'top' && launchpadComponent}

      {sidebarPosition === 'left' || sidebarPosition === 'right' ? (
        <div className="flex flex-1 min-h-0 gap-1.5">
          {isSidebarVisible && sidebarPosition === 'left' && launchpadComponent}
          {mainWorkspaceContent}
          {isSidebarVisible && sidebarPosition === 'right' && launchpadComponent}
        </div>
      ) : (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-1.5">
          {mainWorkspaceContent}
        </div>
      )}

      {isSidebarVisible && sidebarPosition === 'bottom' && launchpadComponent}

      {/* Modals */}
      <WorkspaceModal
        key={editingWorkspace?.id || 'new-workspace'}
        isOpen={isWorkspaceModalOpen}
        workspace={editingWorkspace}
        isRunning={editingWorkspace ? runningWorkspaceIds.includes(editingWorkspace.id) : false}
        onClose={() => {
          setIsWorkspaceModalOpen(false)
          setEditingWorkspace(null)
        }}
        onSave={handleSaveWorkspaceModal}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        sidebarPosition={sidebarPosition}
        updateStatus={updateStatus}
        terminalTheme={appState.settings?.terminalTheme || 'midnight'}
        terminalFontSize={appState.settings?.terminalFontSize || 12.5}
        onClose={() => setIsSettingsModalOpen(false)}
        onPositionChange={handleUpdateSidebarPosition}
        onThemeChange={handleThemeChange}
        onFontSizeChange={handleFontSizeChange}
        defaultShell={appState.settings?.defaultShell}
        onDefaultShellChange={handleDefaultShellChange}
        wallpaper={currentWallpaper}
        onWallpaperChange={handleWallpaperChange}
        onWallpaperRemoved={handleWallpaperRemoved}
        islandScale={appState.settings?.islandScale ?? 1}
        islandOpacity={islandOpacity}
        islandBlur={islandBlur}
        railHeight={appState.settings?.railHeight ?? 200}
        onAppearanceChange={handleAppearanceChange}
        onExportWorkspaces={handleExportWorkspaces}
        onImportWorkspaces={handleImportWorkspaces}
        onResetDefaults={handleResetDefaults}
        onCheckForUpdates={handleCheckForUpdates}
        onDownloadUpdate={handleDownloadUpdate}
        onQuitAndInstallUpdate={handleQuitAndInstallUpdate}
      />

      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        appState={appState}
        onSelectWorkspace={(id) => {
          handleSelectWorkspace(id)
          setIsCommandPaletteOpen(false)
        }}
        onNewWorkspace={() => {
          handleNewWorkspace()
          setIsCommandPaletteOpen(false)
        }}
        onToggleSidebar={() => setIsSidebarVisible((prev) => !prev)}
        onOpenSettings={() => {
          setIsSettingsModalOpen(true)
          setIsCommandPaletteOpen(false)
        }}
        onOpenShortcuts={() => {
          setIsShortcutsModalOpen(true)
          setIsCommandPaletteOpen(false)
        }}
        onRestartActiveWorkspace={() => {
          if (activeWorkspace) {
            handleRestartWorkspace(activeWorkspace.id)
          }
        }}
        onAddCanvasCard={(kind) => {
          if (!activeWorkspace) return
          if (addCanvasCardRef.current) {
            addCanvasCardRef.current(kind)
          } else {
            // A stopped workspace has no canvas mounted
            const currentCards = activeWorkspace.canvasCards || []
            const newCard = createCard(kind, activeWorkspace, currentCards, openingView())
            handleSaveCanvasCards(activeWorkspace.id, [...currentCards, newCard], activeWorkspace.canvasConnectors)
          }
          setIsCommandPaletteOpen(false)
        }}
      />

      <AgentToasts
        toasts={agentToasts}
        onOpen={(status) => handleOpenPanel(status.workspaceId, status.panelId)}
        onDismiss={dismissAgentToast}
      />

      {/* Floating Update Notification Toast */}
      <UpdateNotificationToast
        status={updateStatus}
        onDownload={handleDownloadUpdate}
        onRestart={handleQuitAndInstallUpdate}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />
    </div>
  )
}
