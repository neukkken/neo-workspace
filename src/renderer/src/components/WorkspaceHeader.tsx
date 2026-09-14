import React from 'react'
import { Edit, RotateCcw, Activity, Play, Square } from 'lucide-react'
import { Workspace, ProcessMetrics } from '../types'

interface WorkspaceHeaderProps {
  workspace: Workspace
  panelsMetrics: Record<string, ProcessMetrics>
  isRunning: boolean
  onEditWorkspace: () => void
  onRestartAll: () => void
  onStartWorkspace: () => void
  onStopWorkspace: () => void
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  workspace,
  panelsMetrics,
  isRunning,
  onEditWorkspace,
  onRestartAll,
  onStartWorkspace,
  onStopWorkspace
}) => {
  // Calculate total CPU & RAM for this workspace's panels
  const totalCpu = isRunning
    ? workspace.panels.reduce((sum, p) => {
        return sum + (panelsMetrics[p.id]?.cpu || 0)
      }, 0)
    : 0

  const totalRam = isRunning
    ? workspace.panels.reduce((sum, p) => {
        return sum + (panelsMetrics[p.id]?.memoryMb || 0)
      }, 0)
    : 0

  return (
    <div className="h-10 px-3 bg-[#0d0f13] border-b border-zinc-800/80 flex items-center justify-between select-none">
      {/* Left: Workspace Title & Info */}
      <div className="flex items-center space-x-2.5">
        <div className="flex items-center space-x-1.5 font-mono text-xs">
          {/* Status LED */}
          <span
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              isRunning
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                : 'bg-zinc-700/80 border border-zinc-600/60'
            }`}
            title={isRunning ? 'Workspace Activo' : 'Workspace No Iniciado'}
          />
          <span className="font-semibold text-zinc-100 uppercase">WORKSPACE::{workspace.name}</span>
          <span className="text-zinc-500 font-normal">[{workspace.code || '01'}]</span>
        </div>

        {isRunning ? (
          <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] font-mono text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
            <span>En segundo plano</span>
            <span className="text-emerald-500/50">·</span>
            <span>{workspace.panels.length} panels</span>
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
            <span>No iniciado</span>
          </span>
        )}
      </div>

      {/* Right: Aggregate metrics & Actions */}
      <div className="flex items-center space-x-2">
        {isRunning && (
          <div className="hidden sm:flex items-center space-x-1.5 font-mono text-[11px] text-zinc-400 bg-zinc-900/90 border border-zinc-800/80 px-2 py-0.5 rounded">
            <Activity size={11} className="text-emerald-400" />
            <span>
              [CPU <strong className="text-zinc-200 font-medium">{Math.round(totalCpu * 10) / 10}%</strong> | RAM{' '}
              <strong className="text-zinc-200 font-medium">{Math.round(totalRam * 10) / 10}MB</strong>]
            </span>
          </div>
        )}

        {/* Start / Stop Toggle */}
        {isRunning ? (
          <button
            onClick={onStopWorkspace}
            className="flex items-center space-x-1 text-xs font-mono text-amber-400/90 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded transition-colors"
            title="Detener todas las terminales de este workspace"
          >
            <Square size={11} fill="currentColor" />
            <span className="hidden md:inline">Detener</span>
          </button>
        ) : (
          <button
            onClick={onStartWorkspace}
            className="flex items-center space-x-1 text-xs font-mono text-emerald-400/90 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded transition-colors"
            title="Iniciar terminales y procesos de este workspace"
          >
            <Play size={11} fill="currentColor" />
            <span>Iniciar</span>
          </button>
        )}

        {isRunning && (
          <button
            onClick={onRestartAll}
            className="flex items-center space-x-1 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 px-2.5 py-1 rounded transition-colors"
            title="Reiniciar todos los procesos de este workspace"
          >
            <RotateCcw size={11} />
            <span className="hidden md:inline">Reiniciar</span>
          </button>
        )}

        <button
          onClick={onEditWorkspace}
          className="flex items-center space-x-1 text-xs font-mono text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 px-2.5 py-1 rounded transition-colors"
        >
          <Edit size={11} />
          <span>Configurar</span>
        </button>
      </div>
    </div>
  )
}
