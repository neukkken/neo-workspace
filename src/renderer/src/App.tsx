import React, { useEffect, useState, useRef } from 'react'
import { Play, Power } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { Launchpad } from './components/Launchpad'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { TerminalGrid } from './components/TerminalGrid'
import { CanvasWorkspace } from './components/CanvasWorkspace'
import { StatusBar } from './components/StatusBar'
import { WorkspaceModal } from './components/WorkspaceModal'
import { SettingsModal } from './components/SettingsModal'
import { ShortcutsModal } from './components/ShortcutsModal'
import { UpdateNotificationToast } from './components/UpdateNotificationToast'
import {
  Workspace,
  AppState,
  TelemetryPayload,
  SidebarPosition,
  PanelConfig,
  CanvasCard,
  UpdateStatusPayload,
  TerminalThemeName
} from './types'
import { terminalPool } from './services/terminal-pool'

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
  const [isSidebarVisible, setIsSidebarVisible] = useState(true)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null)

  const appStateRef = useRef<AppState | null>(null)
  appStateRef.current = appState

  const runningWorkspaceIdsRef = useRef<string[]>([])
  runningWorkspaceIdsRef.current = runningWorkspaceIds

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
    return () => {
      unsubscribe()
    }
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
        setIsShortcutsModalOpen(false)
        setIsSettingsModalOpen(false)
        setIsWorkspaceModalOpen(false)
        return
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey

      // Ctrl + N: Create new workspace
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        handleNewWorkspace()
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
        handleSaveAll()
        return
      }

      const current = appStateRef.current
      if (!current) return

      // Ctrl + Shift + F: Toggle Grid vs Canvas
      if (isCtrlOrCmd && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        if (current.activeWorkspaceId) {
          handleToggleLayoutMode(current.activeWorkspaceId)
        }
        return
      }

      // Ctrl + Shift + R: Restart active workspace
      if (isCtrlOrCmd && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        if (current.activeWorkspaceId) {
          handleRestartWorkspace(current.activeWorkspaceId)
        }
        return
      }

      // Ctrl + 1..9: Quick switch workspaces
      if (isCtrlOrCmd && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1
        if (current.workspaces[index]) {
          e.preventDefault()
          handleSelectWorkspace(current.workspaces[index].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  if (!appState) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#090a0d] text-zinc-400 font-mono text-xs">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>INITIALIZING NEO-WORKSPACE ORCHESTRATOR...</span>
        </div>
      </div>
    )
  }

  const activeWorkspace: Workspace | undefined =
    appState.workspaces.find((w) => w.id === appState.activeWorkspaceId) || appState.workspaces[0]

  const sidebarPosition: SidebarPosition = appState.settings?.sidebarPosition || 'left'

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
    const panelsToKill =
      activeSessionPanels[id] || appState.workspaces.find((w) => w.id === id)?.panels || []
    if (panelsToKill.length > 0) {
      // Kill all active terminals for this workspace's panels
      await Promise.all(
        panelsToKill.map(async (p) => {
          terminalPool.destroyTerminal(p.id)
          return window.neoAPI.killTerminal(p.id)
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

  const handleRestartWorkspace = (id: string): void => {
    const ws = appState.workspaces.find((w) => w.id === id)
    if (ws) {
      // Explicit restart applies the latest saved workspace configuration and restarts terminals
      ws.panels.forEach((p) => {
        terminalPool.getTerminal(p.id)?.restart()
      })
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

  const handleToggleLayoutMode = (workspaceId: string): void => {
    const ws = appState.workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    const nextMode = ws.layoutMode === 'canvas' ? 'grid' : 'canvas'
    const updatedWorkspaces = appState.workspaces.map((w) =>
      w.id === workspaceId ? { ...w, layoutMode: nextMode } : w
    )
    persistState({ ...appState, workspaces: updatedWorkspaces })
  }

  const handleSaveCanvasCards = (workspaceId: string, cards: CanvasCard[]): void => {
    const updatedWorkspaces = appState.workspaces.map((w) =>
      w.id === workspaceId ? { ...w, canvasCards: cards } : w
    )
    persistState({ ...appState, workspaces: updatedWorkspaces })
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
    let updatedWorkspaces: Workspace[]
    const isRunning = runningWorkspaceIds.includes(savedWorkspace.id)

    if (editingWorkspace) {
      updatedWorkspaces = appState.workspaces.map((w) =>
        w.id === savedWorkspace.id ? savedWorkspace : w
      )
      if (isRunning) {
        // Workspace is currently running: do NOT restart terminals or touch activeSessionPanels!
        // Running consoles will NOT be interrupted. Flag workspace as having pending config changes.
        setPendingChangesWorkspaceIds((prev) =>
          prev.includes(savedWorkspace.id) ? prev : [...prev, savedWorkspace.id]
        )
      } else {
        // Workspace is stopped: update session panels configuration directly
        setActiveSessionPanels((prev) => ({
          ...prev,
          [savedWorkspace.id]: savedWorkspace.panels
        }))
        setPendingChangesWorkspaceIds((prev) => prev.filter((id) => id !== savedWorkspace.id))
      }
    } else {
      updatedWorkspaces = [...appState.workspaces, savedWorkspace]
      // Start the newly created workspace
      setActiveSessionPanels((prev) => ({
        ...prev,
        [savedWorkspace.id]: savedWorkspace.panels
      }))
      setRunningWorkspaceIds((prev) => [...prev, savedWorkspace.id])
    }

    const updatedState: AppState = {
      ...appState,
      workspaces: updatedWorkspaces,
      activeWorkspaceId: savedWorkspace.id
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
  const totalRunningPanelsCount = runningWorkspaceIds.reduce((sum, wsId) => {
    const panels =
      activeSessionPanels[wsId] || appState.workspaces.find((w) => w.id === wsId)?.panels || []
    return sum + panels.length
  }, 0)

  // Main workspace view containing header, idle message and terminal grid
  const mainWorkspaceContent = (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0b0d10] overflow-hidden relative">
      {!activeWorkspace ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 shadow-xl">
            <span className="text-2xl font-mono text-emerald-400 font-bold">&gt;_</span>
          </div>
          <h2 className="font-mono text-base font-semibold text-zinc-100 uppercase tracking-wider mb-1">
            BIENVENIDO A NEOWORK
          </h2>
          <p className="font-mono text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
            No tienes ningún workspace configurado aún. Crea tu primer entorno de trabajo con tus terminales, rutas de proyecto y comandos de inicio.
          </p>
          <button
            onClick={handleNewWorkspace}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-mono font-semibold text-xs transition-colors shadow-lg shadow-emerald-500/20"
          >
            <span>+ CREAR PRIMER WORKSPACE</span>
          </button>
        </div>
      ) : (
        <>
          {/* Header for the currently active workspace */}
          <WorkspaceHeader
            workspace={activeWorkspace}
            activePanels={currentSessionPanels}
            panelsMetrics={telemetry?.panels || {}}
            isRunning={isCurrentWorkspaceRunning}
            hasPendingChanges={hasPendingChanges}
            layoutMode={activeWorkspace.layoutMode || 'grid'}
            onToggleLayoutMode={() => handleToggleLayoutMode(activeWorkspace.id)}
            onEditWorkspace={() => handleEditWorkspace(activeWorkspace)}
            onRestartAll={() => handleRestartWorkspace(activeWorkspace.id)}
            onStartWorkspace={() => handleStartWorkspace(activeWorkspace.id)}
            onStopWorkspace={() => handleStopWorkspace(activeWorkspace.id)}
          />

          {/* If the current workspace is stopped, show idle prompt */}
          {!isCurrentWorkspaceRunning && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
              <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
                <Power size={24} className="text-zinc-500" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-zinc-200 uppercase tracking-wide">
                WORKSPACE DETENIDO // {activeWorkspace.name}
              </h3>
              <p className="font-mono text-xs text-zinc-500 max-w-sm mt-1 mb-5">
                Las {activeWorkspace.panels.length} terminales de este workspace no se están ejecutando
                en segundo plano. Haz clic para iniciarlas.
              </p>
              <button
                onClick={() => handleStartWorkspace(activeWorkspace.id)}
                className="flex items-center space-x-2 px-5 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-mono font-semibold text-xs transition-colors shadow-lg shadow-emerald-500/10"
              >
                <Play size={14} fill="currentColor" />
                <span>INICIAR TERMINALES DEL WORKSPACE</span>
              </button>
            </div>
          )}

          {/* Render running workspaces: active one is visible, others stay mounted in background via 'hidden' */}
          {appState.workspaces
            .filter((ws) => runningWorkspaceIds.includes(ws.id))
            .map((ws) => {
              const isSelected = ws.id === activeWorkspace.id
              const restartKey = workspaceRestartKeys[ws.id] || 0
              const panelsToRender = activeSessionPanels[ws.id] || ws.panels
              const isCanvas = ws.layoutMode === 'canvas'

              return (
                <div
                  key={ws.id}
                  className={`flex-1 min-h-0 min-w-0 h-full w-full ${
                    isSelected ? 'flex flex-col' : 'hidden'
                  }`}
                >
                  {isCanvas ? (
                    <CanvasWorkspace
                      key={`${ws.id}-canvas`}
                      workspace={ws}
                      panelsMetrics={telemetry?.panels || {}}
                      onSaveCanvasCards={(cards) => handleSaveCanvasCards(ws.id, cards)}
                    />
                  ) : (
                    <TerminalGrid
                      key={`${ws.id}-${restartKey}`}
                      panels={panelsToRender}
                      panelsMetrics={telemetry?.panels || {}}
                      isActive={isSelected}
                    />
                  )}
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
    setAppState(nextState)
    saveStateToDisk(nextState)
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
          setAppState(nextState)
          saveStateToDisk(nextState)
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
    setAppState(nextState)
    saveStateToDisk(nextState)
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
    setAppState(nextState)
    saveStateToDisk(nextState)
  }

  const launchpadComponent = (
    <Launchpad
      workspaces={appState.workspaces}
      activeWorkspaceId={appState.activeWorkspaceId}
      runningWorkspaceIds={runningWorkspaceIds}
      pendingChangesWorkspaceIds={pendingChangesWorkspaceIds}
      position={sidebarPosition}
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090a0d] text-zinc-200">
      {/* Top Frameless TitleBar */}
      <TitleBar
        systemMetrics={telemetry?.system}
        activeWorkspaceName={activeWorkspace?.name}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
      />

      {/* TOP POSITION */}
      {isSidebarVisible && sidebarPosition === 'top' && launchpadComponent}

      {/* CENTRAL AREA */}
      {sidebarPosition === 'top' || sidebarPosition === 'bottom' ? (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {mainWorkspaceContent}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {isSidebarVisible && sidebarPosition === 'left' && launchpadComponent}
          {mainWorkspaceContent}
          {isSidebarVisible && sidebarPosition === 'right' && launchpadComponent}
        </div>
      )}

      {/* BOTTOM POSITION */}
      {isSidebarVisible && sidebarPosition === 'bottom' && launchpadComponent}

      {/* Footer Status Bar */}
      <StatusBar
        onSave={handleSaveAll}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        activePanelsCount={totalRunningPanelsCount}
        updateAvailable={updateStatus?.state === 'available' || updateStatus?.state === 'downloaded'}
      />

      {/* Modals */}
      <WorkspaceModal
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
        terminalTheme={appState.settings?.terminalTheme || 'matrix'}
        terminalFontSize={appState.settings?.terminalFontSize || 12.5}
        onClose={() => setIsSettingsModalOpen(false)}
        onPositionChange={handleUpdateSidebarPosition}
        onThemeChange={handleThemeChange}
        onFontSizeChange={handleFontSizeChange}
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
