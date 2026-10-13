import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  Layers,
  FolderKanban,
  Square,
  Copy,
  AlertTriangle,
  X
} from 'lucide-react'
import { Workspace, SidebarPosition } from '../types'

interface LaunchpadProps {
  workspaces: Workspace[]
  activeWorkspaceId: string
  runningWorkspaceIds: string[]
  pendingChangesWorkspaceIds?: string[]
  position?: SidebarPosition
  onSelectWorkspace: (id: string) => void
  onNewWorkspace: () => void
  onEditWorkspace: (workspace: Workspace) => void
  onDuplicateWorkspace?: (workspace: Workspace) => void
  onDeleteWorkspace: (id: string) => void
  onStopWorkspace?: (id: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  workspace: Workspace
}

export const Launchpad: React.FC<LaunchpadProps> = ({
  workspaces,
  activeWorkspaceId,
  runningWorkspaceIds,
  pendingChangesWorkspaceIds = [],
  position = 'left',
  onSelectWorkspace,
  onNewWorkspace,
  onEditWorkspace,
  onDuplicateWorkspace,
  onDeleteWorkspace,
  onStopWorkspace
}) => {
  const isHorizontal = position === 'top' || position === 'bottom'

  // Dropdown context menu state (triggered on right-click only)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Confirmation modal state for workspace deletion
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null)

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (): void => {
      closeContextMenu()
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu, closeContextMenu])

  const handleTabContextMenu = (e: React.MouseEvent, ws: Workspace): void => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      workspace: ws
    })
  }

  const handleConfirmDelete = (): void => {
    if (workspaceToDelete) {
      onDeleteWorkspace(workspaceToDelete.id)
      setWorkspaceToDelete(null)
    }
  }

  // HORIZONTAL LAYOUT (Top or Bottom bar)
  if (isHorizontal) {
    const borderClass = position === 'top' ? 'border-b' : 'border-t'

    return (
      <>
        <nav
          className={`h-11 w-full bg-[#0a0c0e] ${borderClass} border-zinc-800/80 flex items-center justify-between px-3 select-none shrink-0 z-10`}
        >
          {/* Left: Branding & Counts */}
          <div className="flex items-center space-x-2.5 shrink-0 mr-2 border-r border-zinc-800/80 pr-3">
            <div className="flex items-center space-x-1.5 text-xs font-mono font-semibold tracking-wider text-zinc-300">
              <Layers size={13} className="text-emerald-400" />
              <span className="hidden sm:inline">LAUNCHPAD</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              {runningWorkspaceIds.length} running
            </span>
          </div>

          {/* Center: Workspaces Horizontal Scroll */}
          <div className="flex-1 flex items-center space-x-1.5 overflow-x-auto py-1 no-scrollbar">
            {workspaces.map((ws, idx) => {
              const isActive = ws.id === activeWorkspaceId
              const isRunning = runningWorkspaceIds.includes(ws.id)
              const codeFormatted = ws.code
                ? ws.code.padStart(2, '0')
                : (idx + 1).toString().padStart(2, '0')

              return (
                <div
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  onContextMenu={(e) => handleTabContextMenu(e, ws)}
                  className={`relative flex items-center space-x-2 px-2.5 py-1 rounded cursor-pointer transition-all duration-150 text-xs font-mono shrink-0 ${
                    isActive
                      ? 'bg-[#15181d] text-zinc-100 border border-zinc-700/80 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                  }`}
                  title={`${ws.name} (Clic derecho para opciones)`}
                >
                  {/* Active Indicator Accent on bottom */}
                  {isActive && (
                    <div className="absolute left-2 right-2 bottom-0 h-0.5 bg-emerald-400 rounded-full" />
                  )}

                  {/* Status LED */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 transition-all duration-300 ${
                        isRunning
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                          : 'bg-zinc-700/80 border border-zinc-600/50'
                      }`}
                      title={isRunning ? 'Activo en segundo plano' : 'No iniciado'}
                    />
                    {pendingChangesWorkspaceIds?.includes(ws.id) && (
                      <span
                        title="Cambios guardados pendientes de aplicar al reiniciar"
                        className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"
                      />
                    )}
                  </div>

                  <span
                    className={`truncate max-w-[120px] font-medium ${
                      isActive ? 'text-zinc-100' : 'text-zinc-300'
                    }`}
                  >
                    {ws.name}
                  </span>

                  {pendingChangesWorkspaceIds?.includes(ws.id) && (
                    <span
                      title="Cambios guardados pendientes de aplicar al reiniciar"
                      className="text-[9px] font-mono text-amber-400/90 bg-amber-500/10 border border-amber-500/30 px-1 py-0.2 rounded"
                    >
                      ⚙
                    </span>
                  )}

                  <span
                    className={`text-[10px] font-mono ${
                      isActive
                        ? 'text-emerald-400 font-semibold'
                        : isRunning
                        ? 'text-emerald-400/70'
                        : 'text-zinc-500'
                    }`}
                  >
                    [{codeFormatted}]
                  </span>
                </div>
              )
            })}
            {workspaces.length === 0 && (
              <span className="text-[11px] font-mono text-zinc-500 italic px-2">
                No hay workspaces creados
              </span>
            )}
          </div>

          {/* Right: Compact Add Workspace Button */}
          <div className="shrink-0 pl-2">
            <button
              onClick={onNewWorkspace}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded border border-dashed border-zinc-700 hover:border-emerald-500/60 bg-zinc-900/50 hover:bg-emerald-500/10 text-zinc-300 hover:text-emerald-400 text-xs font-mono transition-colors group cursor-pointer"
            >
              <Plus size={12} className="text-zinc-400 group-hover:text-emerald-400" />
              <span className="hidden sm:inline">+ WORKSPACE</span>
            </button>
          </div>
        </nav>

        {/* Dropdown Menu & Confirmation Modal */}
        {renderContextMenu()}
        {renderDeleteConfirmationModal()}
      </>
    )
  }

  // VERTICAL LAYOUT (Left or Right Sidebar)
  const borderClass = position === 'right' ? 'border-l' : 'border-r'

  return (
    <>
      <aside
        className={`w-64 bg-[#0a0c0e] ${borderClass} border-zinc-800/80 flex flex-col justify-between select-none shrink-0 h-full`}
      >
        {/* Sidebar Header */}
        <div>
          <div className="px-4 py-3.5 border-b border-zinc-800/70 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-mono font-semibold tracking-wider text-zinc-400">
              <Layers size={13} className="text-emerald-400" />
              <span>LAUNCHPAD</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                {runningWorkspaceIds.length} running
              </span>
              <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                {workspaces.length.toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Workspace List */}
          <div className="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
            {workspaces.map((ws, idx) => {
              const isActive = ws.id === activeWorkspaceId
              const isRunning = runningWorkspaceIds.includes(ws.id)
              const codeFormatted = ws.code
                ? ws.code.padStart(2, '0')
                : (idx + 1).toString().padStart(2, '0')

              return (
                <div
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  onContextMenu={(e) => handleTabContextMenu(e, ws)}
                  className={`relative flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-all duration-150 text-xs font-mono ${
                    isActive
                      ? 'bg-[#15181d] text-zinc-100 border border-zinc-700/60 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                  }`}
                  title={`${ws.name} (Clic derecho para opciones)`}
                >
                  {/* Active Indicator Accent on border */}
                  {isActive && (
                    <div
                      className={`absolute ${
                        position === 'right' ? 'right-0 rounded-l' : 'left-0 rounded-r'
                      } top-1.5 bottom-1.5 w-1 bg-emerald-400`}
                    />
                  )}

                  <div className="flex items-center space-x-2.5 truncate pl-1">
                    {/* Status LED */}
                    <div className="relative flex items-center justify-center shrink-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 transition-all duration-300 ${
                          isRunning
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                            : 'bg-zinc-700/80 border border-zinc-600/50'
                        }`}
                        title={
                          isRunning
                            ? 'Activo y corriendo en segundo plano'
                            : 'Aún no iniciado'
                        }
                      />
                      {pendingChangesWorkspaceIds?.includes(ws.id) && (
                        <span
                          title="Cambios guardados pendientes de aplicar al reiniciar"
                          className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"
                        />
                      )}
                    </div>

                    <FolderKanban
                      size={13}
                      className={
                        isActive
                          ? 'text-emerald-400'
                          : isRunning
                          ? 'text-zinc-300'
                          : 'text-zinc-600'
                      }
                    />

                    <span
                      className={`truncate font-medium ${
                        isActive ? 'text-zinc-100' : 'text-zinc-300'
                      }`}
                    >
                      {ws.name}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {pendingChangesWorkspaceIds?.includes(ws.id) && (
                      <span
                        title="Cambios guardados pendientes de aplicar al reiniciar"
                        className="text-[9px] font-mono text-amber-400/90 bg-amber-500/10 border border-amber-500/30 px-1 py-0.2 rounded"
                      >
                        ⚙
                      </span>
                    )}

                    <span
                      className={`text-[11px] font-mono ${
                        isActive
                          ? 'text-emerald-400 font-semibold'
                          : isRunning
                          ? 'text-emerald-400/70'
                          : 'text-zinc-500'
                      }`}
                    >
                      [{codeFormatted}]
                    </span>
                  </div>
                </div>
              )
            })}
            {workspaces.length === 0 && (
              <div className="p-4 text-center">
                <p className="text-xs font-mono text-zinc-500 mb-2">No hay workspaces</p>
                <p className="text-[10px] font-mono text-zinc-600 leading-relaxed">
                  Crea tu primer workspace para comenzar
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: New Workspace Button */}
        <div className="p-3 border-t border-zinc-800/70 bg-[#0a0c0e]">
          <button
            onClick={onNewWorkspace}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded border border-dashed border-zinc-700/80 hover:border-emerald-500/60 bg-zinc-900/40 hover:bg-emerald-500/5 text-zinc-300 hover:text-emerald-400 text-xs font-mono transition-all duration-150 group cursor-pointer"
          >
            <Plus
              size={13}
              className="text-zinc-400 group-hover:text-emerald-400 transition-colors"
            />
            <span>+ NEW WORKSPACE</span>
          </button>
        </div>
      </aside>

      {/* Dropdown Menu & Confirmation Modal */}
      {renderContextMenu()}
      {renderDeleteConfirmationModal()}
    </>
  )

  // Context Menu Renderer
  function renderContextMenu(): React.ReactNode {
    if (!contextMenu) return null

    const ws = contextMenu.workspace
    const isRunning = runningWorkspaceIds.includes(ws.id)

    // Ensure menu stays within window boundaries
    const top = Math.min(contextMenu.y, window.innerHeight - 180)
    const left = Math.min(contextMenu.x, window.innerWidth - 200)

    return (
      <div
        style={{
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          zIndex: 9999
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-48 bg-[#12151c] border border-zinc-700/80 rounded-md shadow-2xl py-1 text-xs font-mono text-zinc-300 animate-in fade-in zoom-in-95 duration-100 select-none"
      >
        <div className="px-3 py-1.5 border-b border-zinc-800 text-[10px] text-zinc-500 font-semibold truncate uppercase">
          WORKSPACE: {ws.name}
        </div>

        <button
          type="button"
          onClick={() => {
            closeContextMenu()
            onEditWorkspace(ws)
          }}
          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 hover:text-white transition-colors cursor-pointer text-left"
        >
          <Edit2 size={12} className="text-emerald-400" />
          <span>Configurar / Editar</span>
        </button>

        {isRunning && onStopWorkspace && (
          <button
            type="button"
            onClick={() => {
              closeContextMenu()
              onStopWorkspace(ws.id)
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-amber-500/20 text-zinc-200 hover:text-amber-300 transition-colors cursor-pointer text-left"
          >
            <Square size={12} className="text-amber-400" fill="currentColor" />
            <span>Detener procesos</span>
          </button>
        )}

        {onDuplicateWorkspace && (
          <button
            type="button"
            onClick={() => {
              closeContextMenu()
              onDuplicateWorkspace(ws)
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 hover:text-white transition-colors cursor-pointer text-left"
          >
            <Copy size={12} className="text-zinc-400" />
            <span>Duplicar Workspace</span>
          </button>
        )}

        <div className="h-px bg-zinc-800 my-1" />

        <button
          type="button"
          onClick={() => {
            closeContextMenu()
            setWorkspaceToDelete(ws)
          }}
          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer text-left"
        >
          <Trash2 size={12} className="text-rose-400" />
          <span>Eliminar Workspace...</span>
        </button>
      </div>
    )
  }

  // Delete Confirmation Modal Renderer
  function renderDeleteConfirmationModal(): React.ReactNode {
    if (!workspaceToDelete) return null

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs select-none"
        onClick={() => setWorkspaceToDelete(null)}
      >
        <div
          className="bg-[#111318] border border-rose-500/40 rounded-lg w-full max-w-md p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-mono text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center space-x-2.5 text-rose-400 font-semibold text-sm pb-3 border-b border-zinc-800">
            <AlertTriangle size={18} className="shrink-0" />
            <span>CONFIRMAR ELIMINACIÓN</span>
          </div>

          <div className="py-4 space-y-2 text-zinc-300 text-xs leading-relaxed">
            <p>
              ¿Estás seguro de que deseas eliminar permanentemente el workspace{' '}
              <strong className="text-zinc-100 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                {workspaceToDelete.name}
              </strong>
              ?
            </p>
            <p className="text-[11px] text-zinc-500">
              Esta acción detendrá y cerrará todas las terminales y tarjetas asociadas a este workspace y no se puede deshacer.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setWorkspaceToDelete(null)}
              className="px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-rose-600/20"
            >
              <Trash2 size={13} />
              <span>Eliminar Workspace</span>
            </button>
          </div>
        </div>
      </div>
    )
  }
}
