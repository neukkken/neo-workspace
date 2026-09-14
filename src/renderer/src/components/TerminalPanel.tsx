import React, { useRef, useState } from 'react'
import { RotateCw, Eraser, Maximize2, Minimize2, Copy, Check, Folder } from 'lucide-react'
import { PanelConfig, ProcessMetrics } from '../types'
import { XTermView, XTermViewHandle } from './XTermView'

interface TerminalPanelProps {
  panel: PanelConfig
  metrics?: ProcessMetrics
  isMaximized: boolean
  isActive?: boolean
  onToggleMaximize: (panelId: string) => void
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  panel,
  metrics,
  isMaximized,
  isActive = true,
  onToggleMaximize
}) => {
  const termRef = useRef<XTermViewHandle>(null)
  const [copied, setCopied] = useState(false)

  const handleCopyPath = (): void => {
    if (panel.cwd) {
      navigator.clipboard.writeText(panel.cwd)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleClear = (): void => {
    termRef.current?.clear()
  }

  const handleRestart = (): void => {
    termRef.current?.restart()
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0c0e12] border border-zinc-800/80 rounded-md overflow-hidden shadow-sm transition-all duration-150">
      {/* Panel Header */}
      <div className="h-9 px-3 bg-[#111317] border-b border-zinc-800/80 flex items-center justify-between select-none">
        {/* Left: Title & Path */}
        <div className="flex items-center space-x-2.5 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-100 uppercase">
            PANEL::{panel.title}
          </span>
          <div
            onClick={handleCopyPath}
            title={`Path: ${panel.cwd} (click to copy)`}
            className="hidden sm:flex items-center space-x-1 font-mono text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-900/90 border border-zinc-800/90 px-1.5 py-0.5 rounded cursor-pointer transition-colors max-w-[260px] truncate"
          >
            <Folder size={10} className="text-zinc-500 shrink-0" />
            <span className="truncate">{panel.cwd}</span>
            {copied ? (
              <Check size={10} className="text-emerald-400 shrink-0 ml-0.5" />
            ) : (
              <Copy size={10} className="text-zinc-500 hover:text-zinc-300 shrink-0 ml-0.5 opacity-60" />
            )}
          </div>
        </div>

        {/* Right: Metrics & Controls */}
        <div className="flex items-center space-x-2">
          {/* Telemetry pill */}
          <div className="font-mono text-[10px] text-zinc-400 bg-zinc-900/90 border border-zinc-800/80 px-2 py-0.5 rounded flex items-center space-x-1.5">
            <span>
              CPU <strong className="text-zinc-200 font-medium">{metrics?.cpu ?? 0}%</strong>
            </span>
            <span className="text-zinc-600">|</span>
            <span>
              RAM <strong className="text-zinc-200 font-medium">{metrics?.memoryMb ?? 0}MB</strong>
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-1 border-l border-zinc-800 pl-1.5">
            <button
              onClick={handleRestart}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
              title="Restart Terminal Process"
            >
              <RotateCw size={12} />
            </button>
            <button
              onClick={handleClear}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
              title="Clear Terminal Output"
            >
              <Eraser size={12} />
            </button>
            <button
              onClick={() => onToggleMaximize(panel.id)}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
              title={isMaximized ? 'Restore Grid' : 'Maximize Panel'}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>
      </div>

      {/* Panel Terminal Body */}
      <div className="flex-1 w-full relative min-h-0 bg-[#090a0d]">
        <XTermView
          ref={termRef}
          panelId={panel.id}
          cwd={panel.cwd}
          command={panel.command}
          autoStart={panel.autoStart}
          isActive={isActive}
        />
      </div>
    </div>
  )
}
