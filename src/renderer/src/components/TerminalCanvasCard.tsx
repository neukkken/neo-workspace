import React, { useRef, useState, useEffect } from 'react'
import {
  Terminal,
  Move,
  Trash2,
  Maximize2,
  Minimize2,
  RotateCw,
  Eraser,
  Folder,
  Search,
  Globe,
  Download,
  Settings,
  FolderOpen,
  X
} from 'lucide-react'
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

  // Quick config modal state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [configTitle, setConfigTitle] = useState(card.title || '')
  const [configCwd, setConfigCwd] = useState(card.cwd || '')
  const [configCommand, setConfigCommand] = useState(card.command || '')

  useEffect(() => {
    setConfigTitle(card.title || '')
    setConfigCwd(card.cwd || '')
    setConfigCommand(card.command || '')
  }, [card.title, card.cwd, card.command])

  const handleOpenConfig = (): void => {
    setConfigTitle(card.title || '')
    setConfigCwd(card.cwd || '')
    setConfigCommand(card.command || '')
    setIsConfigOpen(true)
  }

  const handleBrowseFolder = async (): Promise<void> => {
    const selected = await window.neoAPI.selectDirectory(configCwd)
    if (selected) {
      setConfigCwd(selected)
    }
  }

  const handleSaveConfig = (andRestart = false): void => {
    const trimmedTitle = configTitle.trim() || 'TERMINAL'
    const trimmedCwd = configCwd.trim()
    const trimmedCmd = configCommand.trim()

    onUpdate({
      title: trimmedTitle,
      cwd: trimmedCwd,
      command: trimmedCmd
    })

    const existing = terminalPool.getTerminal(card.id)
    if (existing) {
      existing.updateConfig({
        cwd: trimmedCwd,
        command: trimmedCmd
      })
      if (andRestart) {
        existing.restart({
          cwd: trimmedCwd,
          command: trimmedCmd,
          env: card.env,
          autoStart: card.autoStart ?? true
        })
      }
    }

    setIsConfigOpen(false)
  }

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
        left: `${Math.round(card.x)}px`,
        top: `${Math.round(card.y)}px`,
        width: `${Math.round(card.width)}px`,
        height: `${Math.round(card.height)}px`,
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
        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {metrics && (
            <div className="hidden sm:flex items-center space-x-1 text-[10px] font-mono text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-1.5 py-0.5 rounded">
              <span>{metrics.cpu}%</span>
              <span className="text-zinc-600">|</span>
              <span>{metrics.memoryMb}MB</span>
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenConfig()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Configurar comando y ruta de esta terminal"
          >
            <Settings size={11} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              termRef.current?.toggleSearch()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Buscar en buffer (Ctrl+F)"
          >
            <Search size={11} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleExportLog()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Exportar logs a archivo (.log)"
          >
            <Download size={11} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRestart()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Restart Terminal Process"
          >
            <RotateCw size={11} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleClear()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Clear Console"
          >
            <Eraser size={11} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded((prev) => !prev)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title={isExpanded ? 'Restore Size' : 'Expand Card'}
          >
            {isExpanded ? <Minimize2 size={12} className="pointer-events-none" /> : <Maximize2 size={12} className="pointer-events-none" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(card.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
            title="Eliminar consola"
          >
            <Trash2 size={13} className="pointer-events-none" />
          </button>
        </div>
      </div>

      {/* Terminal View Body */}
      <div className="flex-1 w-full relative min-h-0 bg-[#090a0d] overflow-hidden">
        <XTermView
          ref={termRef}
          panelId={card.id}
          cwd={card.cwd || ''}
          command={card.command || ''}
          env={card.env}
          autoStart={card.autoStart ?? true}
          isActive={isFocused}
        />

        {/* Quick Config Modal Overlay */}
        {isConfigOpen && (
          <div
            className="absolute inset-0 z-50 bg-[#0c0e12]/95 backdrop-blur-xs flex flex-col p-4 animate-in fade-in duration-100 font-mono text-xs select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="font-semibold text-zinc-200 text-xs flex items-center space-x-1.5">
                <Settings size={13} className="text-emerald-400" />
                <span>CONFIGURAR TERMINAL</span>
              </span>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                  TÍTULO
                </label>
                <input
                  type="text"
                  value={configTitle}
                  onChange={(e) => setConfigTitle(e.target.value)}
                  placeholder="TERMINAL"
                  className="w-full bg-[#12151b] border border-zinc-700/80 rounded px-2.5 py-1.5 text-zinc-200 text-xs font-mono focus:border-emerald-500/80 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                  DIRECTORIO DE TRABAJO (PATH)
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    value={configCwd}
                    onChange={(e) => setConfigCwd(e.target.value)}
                    placeholder="/home/usuario/proyecto"
                    className="flex-1 bg-[#12151b] border border-zinc-700/80 rounded px-2.5 py-1.5 text-zinc-200 text-xs font-mono focus:border-emerald-500/80 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono flex items-center space-x-1 transition-colors shrink-0 cursor-pointer"
                  >
                    <FolderOpen size={12} className="text-amber-400" />
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                  COMANDO DE INICIO (AUTO-RUN)
                </label>
                <input
                  type="text"
                  value={configCommand}
                  onChange={(e) => setConfigCommand(e.target.value)}
                  placeholder="e.g. npm run dev"
                  className="w-full bg-[#12151b] border border-zinc-700/80 rounded px-2.5 py-1.5 text-emerald-400 text-xs font-mono focus:border-emerald-500/80 focus:outline-none placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig(false)}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors cursor-pointer"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig(true)}
                className="px-3.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs transition-colors cursor-pointer"
              >
                Guardar y Reiniciar
              </button>
            </div>
          </div>
        )}
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
