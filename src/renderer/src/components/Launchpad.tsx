import React from 'react'
import { Plus, Edit2, Trash2, Layers, FolderKanban, Square } from 'lucide-react'
import { Workspace } from '../types'

interface LaunchpadProps {
  workspaces: Workspace[]
  activeWorkspaceId: string
  runningWorkspaceIds: string[]
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
  onSelectWorkspace,
  onNewWorkspace,
  onEditWorkspace,
  onDeleteWorkspace,
  onStopWorkspace
}) => {
  return (
    <aside className="w-64 bg-[#0a0c0e] border-r border-zinc-800/80 flex flex-col justify-between select-none">
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
            const codeFormatted = ws.code ? ws.code.padStart(2, '0') : (idx + 1).toString().padStart(2, '0')

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
                {/* Active Indicator Accent on left border */}
                {isActive && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-400 rounded-r" />
                )}

                <div className="flex items-center space-x-2.5 truncate pl-1">
                  {/* Status LED */}
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

                  <span className={`truncate font-medium ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
                    {ws.name}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
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
                        title="Detener procesos de este workspace"
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
          <Plus size={13} className="text-zinc-400 group-hover:text-emerald-400 transition-colors" />
          <span>+ NEW WORKSPACE</span>
        </button>
      </div>
    </aside>
  )
}
