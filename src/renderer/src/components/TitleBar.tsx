import React, { useEffect, useState } from 'react'
import { Minus, Square, X, SlidersHorizontal, Activity, HelpCircle, Search, Save, Check, GitBranch } from 'lucide-react'
import { SystemMetrics } from '../types'
import { Tooltip } from './Tooltip'
import logo from '../assets/logo.svg'

interface TitleBarProps {
  systemMetrics?: SystemMetrics
  workspaceActions?: React.ReactNode
  workspaceFolders: string[]
  updateAvailable?: boolean
  onSave: () => Promise<void>
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onOpenCommandPalette: () => void
}

interface RepoBranch {
  name: string
  branch: string
}

const BRANCH_REFRESH_MS = 15000

export const TitleBar: React.FC<TitleBarProps> = ({
  systemMetrics,
  workspaceActions,
  workspaceFolders,
  updateAvailable,
  onSave,
  onOpenSettings,
  onOpenShortcuts,
  onOpenCommandPalette
}) => {
  const [isMaximized, setIsMaximized] = useState(false)
  const [appVersion, setAppVersion] = useState('1.6.2')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [branches, setBranches] = useState<RepoBranch[]>([])

  const foldersKey = workspaceFolders.join('|')

  useEffect(() => {
    window.neoAPI.isWindowMaximized().then(setIsMaximized)
    if (window.neoAPI.getAppVersion) {
      window.neoAPI.getAppVersion().then((ver) => {
        if (ver) setAppVersion(ver)
      }).catch(() => {})
    }
  }, [])

  // Branches of the active workspace's projects, refreshed so switched branches show up
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      window.neoAPI
        .gitBranches(foldersKey ? foldersKey.split('|') : [])
        .then((list) => !cancelled && setBranches(list))
        .catch(() => !cancelled && setBranches([]))
    }
    load()
    const timer = setInterval(load, BRANCH_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [foldersKey])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    await onSave()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleMaximize = async (): Promise<void> => {
    window.neoAPI.maximizeWindow()
    const max = await window.neoAPI.isWindowMaximized()
    setIsMaximized(max)
  }

  return (
    <div
      style={{ zoom: 'var(--island-scale)' } as React.CSSProperties}
      className="shrink-0 z-10 pointer-events-none flex items-center justify-between gap-1.5 select-none"
    >
      {/* Left island: logo, name, version and the active projects' branches */}
      <div className="island pointer-events-auto rounded-full h-9 flex items-center space-x-2.5 pl-2.5 pr-3 text-xs text-zinc-300 drag-region min-w-0">
        <img src={logo} alt="" className="w-5 h-5 shrink-0" draggable={false} />
        <span className="text-[11px] stamp text-zinc-100 shrink-0">NWS</span>
        <span className="text-[10px] text-zinc-400 shrink-0">
          v{appVersion}
        </span>

        {branches.length > 0 && <span className="w-px h-4 bg-zinc-800 shrink-0" />}

        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {branches.map((repo) => (
            <span
              key={repo.name}
              title={`${repo.name} · ${repo.branch}`}
              className="flex items-center space-x-1 text-[10px] shrink-0 max-w-[180px]"
            >
              <GitBranch size={10} className="text-zinc-400 shrink-0" />
              <span className="text-zinc-400 truncate">{repo.name}</span>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-100 truncate">{repo.branch}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Right island: icon-only actions with tooltips */}
      <div className="island pointer-events-auto rounded-full h-9 flex items-center space-x-1 px-2.5 text-xs text-zinc-300 no-drag">
        {workspaceActions}

        {systemMetrics && (
          <Tooltip label={`CPU ${systemMetrics.cpuPercent}% · RAM ${systemMetrics.usedMemMb}MB`}>
            <span className="p-1.5 rounded-control text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors">
              <Activity size={13} />
            </span>
          </Tooltip>
        )}

        <Tooltip label="Comandos (Ctrl+K)">
          <button
            onClick={onOpenCommandPalette}
            className="p-1.5 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
          >
            <Search size={13} />
          </button>
        </Tooltip>

        <Tooltip label={saved ? 'Guardado' : 'Guardar configuración'}>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`p-1.5 rounded-control transition-colors ${
              saved ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
            }`}
          >
            {saved ? <Check size={13} /> : <Save size={13} />}
          </button>
        </Tooltip>

        <Tooltip label="Atajos de teclado (?)">
          <button
            onClick={onOpenShortcuts}
            className="p-1.5 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
          >
            <HelpCircle size={13} />
          </button>
        </Tooltip>

        <Tooltip label={updateAvailable ? 'Nueva versión disponible · Ajustes' : 'Ajustes'}>
          <button
            onClick={onOpenSettings}
            className={`p-1.5 rounded-control transition-colors ${
              updateAvailable
                ? 'text-zinc-100 bg-white/5 hover:bg-white/10'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
            }`}
          >
            <SlidersHorizontal size={13} />
          </button>
        </Tooltip>

        <div className="flex items-center space-x-0.5 border-l border-zinc-800 pl-1.5 ml-0.5">
          <Tooltip label="Minimizar">
            <button
              onClick={() => window.neoAPI.minimizeWindow()}
              className="w-6 h-6 flex items-center justify-center rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
            >
              <Minus size={13} />
            </button>
          </Tooltip>
          <Tooltip label={isMaximized ? 'Restaurar' : 'Maximizar'}>
            <button
              onClick={handleMaximize}
              className="w-6 h-6 flex items-center justify-center rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
            >
              <Square size={11} />
            </button>
          </Tooltip>
          <Tooltip label="Cerrar">
            <button
              onClick={() => window.neoAPI.closeWindow()}
              className="w-6 h-6 flex items-center justify-center rounded-control text-zinc-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
            >
              <X size={13} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
