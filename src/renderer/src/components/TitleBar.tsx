import React, { useEffect, useState } from 'react'
import { Terminal, Minus, Square, X, SlidersHorizontal, Activity } from 'lucide-react'
import { SystemMetrics } from '../types'

interface TitleBarProps {
  systemMetrics?: SystemMetrics
  activeWorkspaceName?: string
  onOpenSettings?: () => void
}

export const TitleBar: React.FC<TitleBarProps> = ({
  systemMetrics,
  activeWorkspaceName,
  onOpenSettings
}) => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.neoAPI.isWindowMaximized().then(setIsMaximized)
  }, [])

  const handleMinimize = (): void => {
    window.neoAPI.minimizeWindow()
  }

  const handleMaximize = async (): Promise<void> => {
    window.neoAPI.maximizeWindow()
    const max = await window.neoAPI.isWindowMaximized()
    setIsMaximized(max)
  }

  const handleClose = (): void => {
    window.neoAPI.closeWindow()
  }

  return (
    <header className="h-10 bg-[#0d0f12] border-b border-zinc-800/80 flex items-center justify-between px-3 text-xs text-zinc-300 drag-region select-none">
      {/* Left: App Title & Branding */}
      <div className="flex items-center space-x-2.5 no-drag">
        <div className="flex items-center justify-center w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <Terminal size={12} strokeWidth={2.5} />
        </div>
        <div className="flex items-center space-x-1.5 font-mono text-[11px] tracking-wide">
          <span className="font-semibold text-zinc-100">NEO-WORKSPACE</span>
          <span className="text-zinc-500">::</span>
          <span className="text-emerald-400">CORE_ORCHESTRATOR</span>
          <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded font-mono ml-1">
            v1.0.1
          </span>
        </div>
      </div>

      {/* Center: Active Workspace Indicator */}
      {activeWorkspaceName && (
        <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800/70 text-zinc-400 font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>WORKSPACE:</span>
          <span className="text-zinc-100 font-medium">{activeWorkspaceName}</span>
        </div>
      )}

      {/* Right: Telemetry & Window Controls */}
      <div className="flex items-center space-x-3 no-drag">
        {systemMetrics && (
          <div className="hidden sm:flex items-center space-x-2 font-mono text-[11px] text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-2 py-0.5 rounded">
            <Activity size={12} className="text-emerald-400" />
            <span>
              CPU <strong className="text-zinc-200">{systemMetrics.cpuPercent}%</strong>
            </span>
            <span className="text-zinc-600">|</span>
            <span>
              RAM <strong className="text-zinc-200">{systemMetrics.usedMemMb}MB</strong>
            </span>
          </div>
        )}

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
            title="Settings"
          >
            <SlidersHorizontal size={13} />
          </button>
        )}

        <div className="flex items-center space-x-1 ml-1 border-l border-zinc-800 pl-2">
          <button
            onClick={handleMinimize}
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
            title="Minimize"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={handleMaximize}
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={11} />
          </button>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  )
}
