import React, { useEffect, useState } from 'react'
import { Edit, RotateCcw, Play, Square, Code2, Timer } from 'lucide-react'
import { Workspace, WorkspaceTime } from '../types'
import { formatElapsed, formatHours } from '../utils/time'
import { Tooltip } from './Tooltip'

interface WorkspaceHeaderProps {
  workspace: Workspace
  activePanels?: import('../types').PanelConfig[]
  isRunning: boolean
  hasPendingChanges?: boolean
  onEditWorkspace: () => void
  onRestartAll: () => void
  onStartWorkspace: () => void
  onStopWorkspace: () => void
}

const iconButton =
  'p-1.5 rounded-control transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70'

const WorkspaceStopwatch: React.FC<{ workspaceId: string; isRunning: boolean }> = ({ workspaceId, isRunning }) => {
  const [time, setTime] = useState<WorkspaceTime | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      window.neoAPI.readWorkspaceClock(workspaceId).then((next) => !cancelled && setTime(next))
    }
    load()
    const timer = setInterval(load, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [workspaceId, isRunning])

  const isCounting = isRunning && !time?.paused
  const totals = `Total: ${formatHours(time?.totalMs ?? 0)} · Esta semana: ${formatHours(time?.weekMs ?? 0)}`

  return (
    <Tooltip label={time?.paused ? `En pausa por inactividad · ${totals}` : totals}>
      <span
        role="timer"
        className={`flex items-center space-x-1 px-1.5 py-1 text-[11px] tabular-nums ${
          isCounting ? 'text-zinc-200' : 'text-zinc-500'
        }`}
      >
        <Timer size={13} className={isCounting ? 'text-signal' : undefined} />
        <span>{formatElapsed(time?.elapsedMs ?? 0)}</span>
      </span>
    </Tooltip>
  )
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  workspace,
  activePanels,
  isRunning,
  hasPendingChanges = false,
  onEditWorkspace,
  onRestartAll,
  onStartWorkspace,
  onStopWorkspace
}) => {
  const currentPanels = activePanels || workspace.panels

  const handleOpenVSCode = async (): Promise<void> => {
    const targetFolder = currentPanels[0]?.cwd || ''
    if (window.neoAPI?.vscodeOpenDesktop) {
      await window.neoAPI.vscodeOpenDesktop(targetFolder)
    }
  }

  return (
    <div className="flex items-center space-x-1">
      <WorkspaceStopwatch workspaceId={workspace.id} isRunning={isRunning} />

      {/* Start / Stop Toggle */}
      <Tooltip label={isRunning ? 'Detener workspace' : 'Iniciar workspace'}>
        {isRunning ? (
          <button
            onClick={onStopWorkspace}
            className={iconButton}
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onStartWorkspace}
            className={iconButton}
          >
            <Play size={13} fill="currentColor" />
          </button>
        )}
      </Tooltip>

      {isRunning && (
        <Tooltip label={hasPendingChanges ? 'Aplicar cambios (reinicia)' : 'Reiniciar procesos'}>
          <button
            onClick={onRestartAll}
            className={`p-1.5 rounded-control transition-colors ${
              hasPendingChanges
                ? 'text-signal-soft bg-white/10'
                : iconButton
            }`}
          >
            <RotateCcw size={13} />
          </button>
        </Tooltip>
      )}

      <Tooltip label="Abrir carpeta en VS Code">
        <button onClick={handleOpenVSCode} className={iconButton}>
          <Code2 size={13} />
        </button>
      </Tooltip>

      <Tooltip label="Configurar workspace">
        <button onClick={onEditWorkspace} className={iconButton}>
          <Edit size={13} />
        </button>
      </Tooltip>
    </div>
  )
}
