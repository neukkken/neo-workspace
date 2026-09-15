import React, { useEffect, useState } from 'react'
import { Play, Power } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { Launchpad } from './components/Launchpad'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { TerminalGrid } from './components/TerminalGrid'
import { StatusBar } from './components/StatusBar'
import { WorkspaceModal } from './components/WorkspaceModal'
import { SettingsModal } from './components/SettingsModal'
import { Workspace, AppState, TelemetryPayload, SidebarPosition } from './types'

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null)

  const [runningWorkspaceIds, setRunningWorkspaceIds] = useState<string[]>([])
  const [workspaceRestartKeys, setWorkspaceRestartKeys] = useState<Record<string, number>>({})

  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  // Load initial workspaces from store
  useEffect(() => {
    window.neoAPI.getStore().then((state) => {
      setAppState(state)
      // Automatically start the initial active workspace
      if (state.activeWorkspaceId) {
        setRunningWorkspaceIds([state.activeWorkspaceId])
      }
    })

    // Listen to real-time telemetry updates
    const unsubscribeTelemetry = window.neoAPI.onTelemetry((data) => {
      setTelemetry(data)
    })

    return () => {
      unsubscribeTelemetry()
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

  const activeWorkspace =
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
      setRunningWorkspaceIds((prev) => [...prev, id])
    }
  }

  const handleStartWorkspace = (id: string): void => {
    if (!runningWorkspaceIds.includes(id)) {
      setRunningWorkspaceIds((prev) => [...prev, id])
    }
  }

  const handleStopWorkspace = async (id: string): Promise<void> => {
    const ws = appState.workspaces.find((w) => w.id === id)
    if (ws) {
      // Kill all terminals for this workspace's panels
      await Promise.all(ws.panels.map((p) => window.neoAPI.killTerminal(p.id)))
    }
    setRunningWorkspaceIds((prev) => prev.filter((wId) => wId !== id))
  }

  const handleRestartWorkspace = (id: string): void => {
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
    let updatedWorkspaces: Workspace[]

    if (editingWorkspace) {
      updatedWorkspaces = appState.workspaces.map((w) =>
        w.id === savedWorkspace.id ? savedWorkspace : w
      )
      // Trigger a restart of its terminals so updated commands/paths take effect
      handleRestartWorkspace(savedWorkspace.id)
    } else {
      updatedWorkspaces = [...appState.workspaces, savedWorkspace]
      // Start the newly created workspace
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
    if (appState.workspaces.length <= 1) return

    // Stop terminals if running
    await handleStopWorkspace(id)

    const updatedWorkspaces = appState.workspaces.filter((w) => w.id !== id)
    let newActiveId = appState.activeWorkspaceId
    if (newActiveId === id) {
      newActiveId = updatedWorkspaces[0].id
      if (!runningWorkspaceIds.includes(newActiveId)) {
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
    await window.neoAPI.killAllTerminals()
    setRunningWorkspaceIds([])
    const freshState = await window.neoAPI.getStore()
    setAppState(freshState)
    if (freshState.activeWorkspaceId) {
      setRunningWorkspaceIds([freshState.activeWorkspaceId])
    }
  }

  const isCurrentWorkspaceRunning = runningWorkspaceIds.includes(activeWorkspace.id)

  // Calculate count of active terminal processes across ALL running workspaces
  const totalRunningPanelsCount = appState.workspaces
    .filter((w) => runningWorkspaceIds.includes(w.id))
    .reduce((sum, w) => sum + w.panels.length, 0)

  // Main workspace view containing header, idle message and terminal grid
  const mainWorkspaceContent = (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0b0d10] overflow-hidden relative">
      {/* Header for the currently active workspace */}
      <WorkspaceHeader
        workspace={activeWorkspace}
        panelsMetrics={telemetry?.panels || {}}
        isRunning={isCurrentWorkspaceRunning}
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

          return (
            <div
              key={ws.id}
              className={`flex-1 min-h-0 min-w-0 h-full w-full ${
                isSelected ? 'flex flex-col' : 'hidden'
              }`}
            >
              <TerminalGrid
                key={`${ws.id}-${restartKey}`}
                panels={ws.panels}
                panelsMetrics={telemetry?.panels || {}}
                isActive={isSelected}
              />
            </div>
          )
        })}
    </main>
  )

  const launchpadComponent = (
    <Launchpad
      workspaces={appState.workspaces}
      activeWorkspaceId={appState.activeWorkspaceId}
      runningWorkspaceIds={runningWorkspaceIds}
      position={sidebarPosition}
      onSelectWorkspace={handleSelectWorkspace}
      onNewWorkspace={handleNewWorkspace}
      onEditWorkspace={handleEditWorkspace}
      onDeleteWorkspace={handleDeleteWorkspace}
      onStopWorkspace={handleStopWorkspace}
    />
  )

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090a0d] text-zinc-200">
      {/* Top Frameless TitleBar */}
      <TitleBar
        systemMetrics={telemetry?.system}
        activeWorkspaceName={activeWorkspace?.name}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* TOP POSITION */}
      {sidebarPosition === 'top' && launchpadComponent}

      {/* CENTRAL AREA */}
      {sidebarPosition === 'top' || sidebarPosition === 'bottom' ? (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {mainWorkspaceContent}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {sidebarPosition === 'left' && launchpadComponent}
          {mainWorkspaceContent}
          {sidebarPosition === 'right' && launchpadComponent}
        </div>
      )}

      {/* BOTTOM POSITION */}
      {sidebarPosition === 'bottom' && launchpadComponent}

      {/* Footer Status Bar */}
      <StatusBar
        onSave={handleSaveAll}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        activePanelsCount={totalRunningPanelsCount}
      />

      {/* Modals */}
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        workspace={editingWorkspace}
        onClose={() => {
          setIsWorkspaceModalOpen(false)
          setEditingWorkspace(null)
        }}
        onSave={handleSaveWorkspaceModal}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        sidebarPosition={sidebarPosition}
        onClose={() => setIsSettingsModalOpen(false)}
        onPositionChange={handleUpdateSidebarPosition}
        onResetDefaults={handleResetDefaults}
      />
    </div>
  )
}
