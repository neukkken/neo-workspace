import React from 'react'
import { Plus, Edit2, Trash2, Layers, FolderKanban, Square } from 'lucide-react'
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
  onDeleteWorkspace: (id: string) => void
  onStopWorkspace?: (id: string) => void
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
  onDeleteWorkspace,
  onStopWorkspace
}) => {
  const isHorizontal = position === 'top' || position === 'bottom'

  // HORIZONTAL LAYOUT (Top or Bottom bar)
  if (isHorizontal) {
    const borderClass = position === 'top' ? 'border-b' : 'border-t'

    return (
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
                className={`group relative flex items-center space-x-2 px-2.5 py-1 rounded cursor-pointer transition-all duration-150 text-xs font-mono shrink-0 ${
                  isActive
                    ? 'bg-[#15181d] text-zinc-100 border border-zinc-700/80 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                }`}
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

                {/* Hover Actions */}
                <div className="hidden group-hover:flex items-center space-x-1 pl-1">
                  {isRunning && onStopWorkspace && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onStopWorkspace(ws.id)
                      }}
                      className="p-0.5 rounded hover:bg-amber-500/20 text-zinc-500 hover:text-amber-400 transition-colors"
                      title="Detener procesos"
                    >
                      <Square size={9} fill="currentColor" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditWorkspace(ws)
                    }}
                    className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Configurar"
                  >
                    <Edit2 size={10} />
                  </button>
                  {workspaces.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteWorkspace(ws.id)
                      }}
                      className="p-0.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Right: Compact Add Workspace Button */}
        <div className="shrink-0 pl-2">
          <button
            onClick={onNewWorkspace}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded border border-dashed border-zinc-700 hover:border-emerald-500/60 bg-zinc-900/50 hover:bg-emerald-500/10 text-zinc-300 hover:text-emerald-400 text-xs font-mono transition-colors group"
          >
            <Plus size={12} className="text-zinc-400 group-hover:text-emerald-400" />
            <span className="hidden sm:inline">+ WORKSPACE</span>
          </button>
        </div>
      </nav>
    )
  }

  // VERTICAL LAYOUT (Left or Right Sidebar)
  const borderClass = position === 'right' ? 'border-l' : 'border-r'

  return (
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
                className={`group relative flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-all duration-150 text-xs font-mono ${
                  isActive
                    ? 'bg-[#15181d] text-zinc-100 border border-zinc-700/60 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                }`}
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
                        : 'text-zinc-600 group-hover:text-zinc-400'
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

                  {/* Action Icons on hover */}
                  <div className="hidden group-hover:flex items-center space-x-0.5 pl-1">
                    {isRunning && onStopWorkspace && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onStopWorkspace(ws.id)
                        }}
                        className="p-1 rounded hover:bg-amber-500/20 text-zinc-500 hover:text-amber-400 transition-colors"
                        title="Detener procesos"
                      >
                        <Square size={10} fill="currentColor" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditWorkspace(ws)
                      }}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Configurar Workspace"
                    >
                      <Edit2 size={11} />
                    </button>
                    {workspaces.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteWorkspace(ws.id)
                        }}
                        className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Eliminar Workspace"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom: New Workspace Button */}
      <div className="p-3 border-t border-zinc-800/70 bg-[#0a0c0e]">
        <button
          onClick={onNewWorkspace}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded border border-dashed border-zinc-700/80 hover:border-emerald-500/60 bg-zinc-900/40 hover:bg-emerald-500/5 text-zinc-300 hover:text-emerald-400 text-xs font-mono transition-all duration-150 group"
        >
          <Plus
            size={13}
            className="text-zinc-400 group-hover:text-emerald-400 transition-colors"
          />
          <span>+ NEW WORKSPACE</span>
        </button>
      </div>
    </aside>
  )
}
