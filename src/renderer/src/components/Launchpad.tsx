import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus,
  Edit2,
  Trash2,
  Layers,
  FolderKanban,
  Square,
  Copy,
  AlertTriangle,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react'
import { Workspace, SidebarPosition } from '../types'

interface LaunchpadProps {
  workspaces: Workspace[]
  activeWorkspaceId: string
  runningWorkspaceIds: string[]
  pendingChangesWorkspaceIds?: string[]
  attentionWorkspaceIds?: string[]
  workingWorkspaceIds?: string[]
  position?: SidebarPosition
  railHeight?: number
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

interface TooltipState {
  label: string
  x: number
  y: number
  side: 'left' | 'right'
}

export const Launchpad: React.FC<LaunchpadProps> = ({
  workspaces,
  activeWorkspaceId,
  runningWorkspaceIds,
  pendingChangesWorkspaceIds = [],
  attentionWorkspaceIds = [],
  workingWorkspaceIds = [],
  position = 'top',
  railHeight = 200,
  onSelectWorkspace,
  onNewWorkspace,
  onEditWorkspace,
  onDuplicateWorkspace,
  onDeleteWorkspace,
  onStopWorkspace
}) => {
  const isHorizontal = position === 'top' || position === 'bottom'

  const agentLabel = (id: string): string =>
    attentionWorkspaceIds.includes(id)
      ? ' · un agente terminó o espera tu respuesta'
      : workingWorkspaceIds.includes(id)
      ? ' · trabajando'
      : ''

  // Dropdown context menu state (triggered on right-click only)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Confirmation modal state for workspace deletion
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null)

  // Hover tooltip for the vertical rail (portaled so the scroll container can't clip it)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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

  // Horizontal scroll state & controls for Top/Bottom layout
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    if (!isHorizontal) return
    updateScrollState()
    const el = scrollContainerRef.current
    if (!el) return

    const handleScroll = (): void => updateScrollState()
    el.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updateScrollState)

    const raf = requestAnimationFrame(updateScrollState)

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [isHorizontal, workspaces.length, updateScrollState])

  // Auto-scroll active workspace tab into view when active workspace changes
  useEffect(() => {
    if (!isHorizontal || !scrollContainerRef.current) return
    const activeEl = scrollContainerRef.current.querySelector(
      `[data-workspace-id="${activeWorkspaceId}"]`
    ) as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    }
  }, [activeWorkspaceId, isHorizontal])

  const handleScrollBy = (offset: number): void => {
    scrollContainerRef.current?.scrollBy({ left: offset, behavior: 'smooth' })
  }

  const handleHorizontalWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY
      updateScrollState()
    }
  }

  // Shows the tooltip next to a rail button, on the side facing the screen centre
  const showTooltip = (e: React.MouseEvent<HTMLElement>, label: string): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const side = position === 'right' ? 'left' : 'right'
    setTooltip({
      label,
      side,
      x: side === 'left' ? rect.left - 8 : rect.right + 8,
      y: rect.top + rect.height / 2
    })
  }

  // HORIZONTAL LAYOUT (Top or Bottom bar)
  if (isHorizontal) {
    return (
      <>
        <div className="shrink-0 z-10 w-full">
          <nav
            style={{ zoom: 'var(--island-scale)' } as React.CSSProperties}
            className="island rounded-full h-9 w-full flex items-center justify-between px-3 select-none"
          >
            {/* Left: Branding & Counts */}
            <div className="flex items-center space-x-2.5 shrink-0 mr-2 border-r border-zinc-800/80 pr-3">
              <div className="flex items-center space-x-1.5 text-xs stamp text-zinc-300">
                <Layers size={13} className="text-zinc-400" />
                <span className="hidden sm:inline">LAUNCHPAD</span>
              </div>
              <span className="text-[10px] whitespace-nowrap text-zinc-100 bg-white/5 border border-white/15 px-1.5 py-0.5 rounded-control">
                {runningWorkspaceIds.length} running
              </span>
            </div>

            {/* Center: Workspaces Horizontal Scroll Container */}
            <div className="flex-1 min-w-0 flex items-center relative overflow-hidden py-0.5">
              {/* Scroll Left Button */}
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => handleScrollBy(-180)}
                  className="absolute left-0 z-20 h-7 w-6 bg-void/95 hover:bg-zinc-800 border-r border-zinc-800/80 rounded-r flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                  title="Desplazar a la izquierda"
                >
                  <ChevronLeft size={13} />
                </button>
              )}

              {/* Scrollable Tabs */}
              <div
                ref={scrollContainerRef}
                onWheel={handleHorizontalWheel}
                className={`flex-1 min-w-0 flex items-center space-x-1.5 overflow-x-auto py-1 launchpad-scrollbar ${
                  canScrollLeft ? 'pl-6' : ''
                } ${canScrollRight ? 'pr-6' : ''}`}
              >
                {workspaces.map((ws, idx) => {
                  const isActive = ws.id === activeWorkspaceId
                  const isRunning = runningWorkspaceIds.includes(ws.id)
                  const codeFormatted = ws.code
                    ? ws.code.padStart(2, '0')
                    : (idx + 1).toString().padStart(2, '0')

                  return (
                    <div
                      key={ws.id}
                      data-workspace-id={ws.id}
                      onClick={() => onSelectWorkspace(ws.id)}
                      onContextMenu={(e) => handleTabContextMenu(e, ws)}
                      className={`relative flex items-center space-x-2 px-2.5 py-1 rounded-control cursor-pointer transition-all duration-150 text-xs shrink-0 ${
                        isActive
                          ? 'bg-white/[0.04] text-zinc-100 border border-zinc-700/80 '
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                      }`}
                      title={`${ws.name}${agentLabel(ws.id)} (Clic derecho para opciones)`}
                    >
                      {/* Active Indicator Accent on bottom */}
                      {isActive && (
                        <div className="absolute left-2 right-2 bottom-0 h-0.5 bg-signal rounded-full" />
                      )}

                      {/* Status LED */}
                      <div className="relative flex items-center justify-center shrink-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 transition-all duration-300 ${
                            isRunning
                              ? 'bg-signal shadow-[0_0_8px_rgb(var(--signal-rgb)/0.9)] animate-pulse'
                              : 'bg-zinc-700/80 border border-zinc-600/50'
                          }`}
                          title={isRunning ? 'Activo en segundo plano' : 'No iniciado'}
                        />
                        {pendingChangesWorkspaceIds?.includes(ws.id) && (
                          <span
                            title="Cambios guardados pendientes de aplicar al reiniciar"
                            className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-signal-soft animate-ping"
                          />
                        )}
                      </div>

                      {attentionWorkspaceIds.includes(ws.id) && <BellRing size={11} className="text-signal shrink-0" />}
                      {!attentionWorkspaceIds.includes(ws.id) && workingWorkspaceIds.includes(ws.id) && (
                        <Loader2 size={11} className="text-zinc-300 shrink-0 animate-spin" />
                      )}

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
                          className="text-[9px] text-signal-soft bg-white/5 border border-white/15 px-1 py-0.2 rounded-control"
                        >
                          ⚙
                        </span>
                      )}

                      <span
                        className={`text-[10px] ${
                          isActive
                            ? 'text-zinc-100 font-medium'
                            : isRunning
                            ? 'text-zinc-100'
                            : 'text-zinc-500'
                        }`}
                      >
                        [{codeFormatted}]
                      </span>
                    </div>
                  )
                })}
                {workspaces.length === 0 && (
                  <span className="text-[11px] text-zinc-500 italic px-2">
                    No hay workspaces creados
                  </span>
                )}
              </div>

              {/* Scroll Right Button */}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => handleScrollBy(180)}
                  className="absolute right-0 z-20 h-7 w-6 bg-void/95 hover:bg-zinc-800 border-l border-zinc-800/80 rounded-l flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                  title="Desplazar a la derecha"
                >
                  <ChevronRight size={13} />
                </button>
              )}
            </div>

            {/* Right: Compact Add Workspace Button */}
            <div className="shrink-0 pl-2">
              <button
                onClick={onNewWorkspace}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-control border border-dashed border-zinc-700 hover:border-white/25 bg-zinc-900/50 hover:bg-white/10 text-zinc-300 hover:text-zinc-100 text-xs transition-colors group cursor-pointer"
              >
                <Plus size={12} className="text-zinc-400 group-hover:text-zinc-100" />
                <span className="hidden sm:inline">Workspace</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Dropdown Menu & Confirmation Modal */}
        {renderContextMenu()}
        {renderDeleteConfirmationModal()}
      </>
    )
  }

  // VERTICAL RAIL (Left or Right): a 40px island of icons, one per workspace
  const railButton = (
    isActive: boolean,
    isRunning: boolean
  ): string =>
    `group relative w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer ${
      isActive
        ? 'bg-white/10 text-zinc-100 border border-white/15'
        : isRunning
        ? 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 border border-transparent'
        : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 border border-transparent'
    }`

  return (
    <>
      <div className="shrink-0 self-center z-10">
        <aside
          style={{ height: `${railHeight}px`, zoom: 'var(--island-scale)' } as React.CSSProperties}
          className="island rounded-full w-10 py-2 flex flex-col items-center gap-1.5 select-none"
        >
          <div className="flex-1 min-h-0 w-full flex flex-col items-center gap-1.5 overflow-y-auto no-scrollbar">
            {workspaces.map((ws, idx) => {
              const isActive = ws.id === activeWorkspaceId
              const isRunning = runningWorkspaceIds.includes(ws.id)
              const codeFormatted = ws.code
                ? ws.code.padStart(2, '0')
                : (idx + 1).toString().padStart(2, '0')

              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => onSelectWorkspace(ws.id)}
                  onContextMenu={(e) => handleTabContextMenu(e, ws)}
                  onMouseEnter={(e) => showTooltip(e, `${ws.name} [${codeFormatted}]${agentLabel(ws.id)}`)}
                  onMouseLeave={() => setTooltip(null)}
                  className={railButton(isActive, isRunning)}
                >
                  {attentionWorkspaceIds.includes(ws.id) ? (
                    <BellRing size={14} className="text-signal" />
                  ) : workingWorkspaceIds.includes(ws.id) ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FolderKanban size={14} />
                  )}
                  {isRunning && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-signal shadow-[0_0_6px_rgb(var(--signal-rgb)/0.9)]" />
                  )}
                  {pendingChangesWorkspaceIds?.includes(ws.id) && (
                    <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-signal-soft" />
                  )}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={onNewWorkspace}
            onMouseEnter={(e) => showTooltip(e, 'Nuevo workspace')}
            onMouseLeave={() => setTooltip(null)}
            className="group w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </aside>
      </div>

      {tooltip &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${tooltip.y}px`,
              left: `${tooltip.x}px`,
              transform: tooltip.side === 'left' ? 'translate(-100%, -50%)' : 'translateY(-50%)',
              zIndex: 99998
            }}
            className="pointer-events-none whitespace-nowrap rounded-button bg-void border border-zinc-700/80 px-2 py-1 text-[11px] text-zinc-100 select-none"
          >
            {tooltip.label}
          </div>,
          document.body
        )}

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
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 190))
    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 200))

    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          zIndex: 99999
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        className="w-48 bg-void border border-zinc-700/80 rounded-button py-1 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-100 select-none"
      >
        <div className="px-3 py-1.5 border-b border-zinc-800 text-[10px] text-zinc-500 font-medium truncate uppercase">
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
          <Edit2 size={12} className="text-zinc-100" />
          <span>Configurar / Editar</span>
        </button>

        {isRunning && onStopWorkspace && (
          <button
            type="button"
            onClick={() => {
              closeContextMenu()
              onStopWorkspace(ws.id)
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-white/10 text-zinc-200 hover:text-zinc-100 transition-colors cursor-pointer text-left"
          >
            <Square size={12} className="text-zinc-400" fill="currentColor" />
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
      </div>,
      document.body
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
          className="bg-void border border-rose-500/40 rounded-button w-full max-w-md p-5 animate-in fade-in zoom-in-95 duration-150 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center space-x-2.5 text-rose-400 font-medium text-sm pb-3 border-b border-zinc-800">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="stamp text-[10px]">CONFIRMAR ELIMINACIÓN</span>
          </div>

          <div className="py-4 space-y-2 text-zinc-300 text-xs leading-relaxed">
            <p>
              ¿Estás seguro de que deseas eliminar permanentemente el workspace{' '}
              <strong className="text-zinc-100 bg-zinc-900 px-1.5 py-0.5 rounded-control border border-zinc-800">
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
              className="px-3 py-1.5 rounded-control border border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-3.5 py-1.5 rounded-control bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors flex items-center space-x-1.5 cursor-pointer"
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
