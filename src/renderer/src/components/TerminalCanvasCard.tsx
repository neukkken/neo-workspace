import React, { useRef, useState, useEffect } from 'react'
import { Terminal, Move, Trash2, Maximize2, Minimize2, RotateCw, Eraser, Folder, Search, Globe, Download } from 'lucide-react'
import { CanvasCard, ProcessMetrics } from '../types'
import { XTermView, XTermViewHandle } from './XTermView'
import { terminalPool } from '../services/terminal-pool'

interface TerminalCanvasCardProps {
  card: CanvasCard
  metrics?: ProcessMetrics
  isFocused: boolean
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
  onOpenInBrowser?: (url: string) => void
}

export const TerminalCanvasCard: React.FC<TerminalCanvasCardProps> = ({
  card,
  metrics,
  isFocused,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart,
  onOpenInBrowser
}) => {
  const termRef = useRef<XTermViewHandle>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null)

  useEffect(() => {
    const managed = terminalPool.getTerminal(card.id)
    if (managed) {
      if (managed.lastDetectedUrl) setDetectedUrl(managed.lastDetectedUrl)
      return managed.onUrlDetected((url) => setDetectedUrl(url))
    }
    return undefined
  }, [card.id])

  const handleRestart = (): void => {
    termRef.current?.restart()
  }

  const handleClear = (): void => {
    termRef.current?.clear()
  }

  const handleExportLog = (): void => {
    const text = terminalPool.exportLog(card.id)
    if (!text) {
      alert('La terminal no contiene registros para exportar.')
      return
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${card.title || 'terminal'}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const cardStyle: React.CSSProperties = isExpanded
    ? {
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        bottom: 10,
        width: 'calc(100% - 20px)',
        height: 'calc(100% - 20px)',
        zIndex: 999
      }
    : {
        position: 'absolute',
        left: `${card.x}px`,
        top: `${card.y}px`,
        width: `${card.width}px`,
        height: `${card.height}px`,
        zIndex: isFocused ? 50 : card.zIndex || 10
      }

  return (
    <div
      style={{ ...cardStyle, overscrollBehavior: 'contain' }}
      onClick={onFocus}
      onWheel={(e) => {
        e.stopPropagation()
        if (!isFocused) {
          e.preventDefault()
        }
      }}
      className={`canvas-card pointer-events-auto flex flex-col bg-[#0c0e12] rounded-lg border shadow-xl overflow-hidden select-none transition-shadow ${
        isFocused
          ? 'border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/40'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      {/* Header Bar */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-[#12151b] border-b border-zinc-800 flex items-center justify-between cursor-move select-none shrink-0"
      >
        {/* Left: Indicator & Title */}
        <div className="flex items-center space-x-2 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
          <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-100 uppercase truncate">
            PANEL::{card.title || 'TERMINAL'}
          </span>

          {detectedUrl && (
            <button
              onClick={() => {
                if (onOpenInBrowser) {
                  onOpenInBrowser(detectedUrl)
                } else {
                  window.open(detectedUrl, '_blank')
                }
              }}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono transition-colors cursor-pointer animate-in fade-in"
              title={`Abrir ${detectedUrl}`}
            >
              <Globe size={10} className="text-cyan-400 shrink-0" />
              <span className="truncate max-w-[120px]">{detectedUrl.replace('http://', '')}</span>
            </button>
          )}
        </div>

        {/* Right: Metrics & Controls */}
        <div className="flex items-center space-x-1.5" onMouseDown={(e) => e.stopPropagation()}>
          {metrics && (
            <div className="hidden sm:flex items-center space-x-1 text-[10px] font-mono text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-1.5 py-0.5 rounded">
              <span>{metrics.cpu}%</span>
              <span className="text-zinc-600">|</span>
              <span>{metrics.memoryMb}MB</span>
            </div>
          )}

          <button
            onClick={() => termRef.current?.toggleSearch()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Buscar en buffer (Ctrl+F)"
          >
            <Search size={11} />
          </button>
          <button
            onClick={handleExportLog}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Exportar logs a archivo (.log)"
          >
            <Download size={11} />
          </button>
          <button
            onClick={handleRestart}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Restart Terminal Process"
          >
            <RotateCw size={11} />
          </button>
          <button
            onClick={handleClear}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Clear Console"
          >
            <Eraser size={11} />
          </button>
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={isExpanded ? 'Restore Size' : 'Expand Card'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/20 transition-colors"
            title="Remove Console Node"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Terminal View Body */}
      <div className="flex-1 w-full relative min-h-0 bg-[#090a0d]">
        <XTermView
          ref={termRef}
          panelId={card.id}
          cwd={card.cwd || ''}
          command={card.command || ''}
          env={card.env}
          autoStart={card.autoStart ?? true}
          isActive={isFocused}
        />
      </div>

      {/* Resize Handle (Bottom Right) */}
      {!isExpanded && (
        <div
          onMouseDown={(e) => onResizeStart(e, card.id)}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-emerald-400"
          title="Resize Node"
        >
          <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
            <polygon points="6 0, 6 6, 0 6" />
          </svg>
        </div>
      )}
    </div>
  )
}
