import React, { useRef, useState, useEffect } from 'react'
import {
  Bell,
  BellOff,
  Terminal,
  Move,
  Trash2,
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
import { AgentStatus, CanvasCard, ProcessMetrics } from '../types'
import { XTermView, XTermViewHandle } from './XTermView'
import { terminalPool } from '../services/terminal-pool'
import { cleanUrl, openExternalUrl } from '../utils/url'
import { formatElapsed, useNow } from '../utils/time'

interface TerminalCanvasCardProps {
  card: CanvasCard
  metrics?: ProcessMetrics
  agentStatus?: AgentStatus
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
  agentStatus,
  isFocused,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart,
  onOpenInBrowser
}) => {
  const termRef = useRef<XTermViewHandle>(null)
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null)

  const isWorking = agentStatus?.state === 'working'
  const isDone = agentStatus?.state === 'done'
  const now = useNow(isWorking)
  const elapsed = agentStatus?.startedAt ? (isWorking ? now : agentStatus.at) - agentStatus.startedAt : null

  const getInitialCmd = (): string => {
    if (card.command) return card.command
    if (Array.isArray(card.commands) && card.commands.length > 0) return card.commands.join('\n')
    return ''
  }

  // Quick config modal state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [configTitle, setConfigTitle] = useState(card.title || '')
  const [configCwd, setConfigCwd] = useState(card.cwd || '')
  const [configCommand, setConfigCommand] = useState(getInitialCmd())
  const [configShell, setConfigShell] = useState(card.shell || '')
  const [shells, setShells] = useState<{ id: string; label: string }[]>([])

  useEffect(() => {
    setConfigTitle(card.title || '')
    setConfigCwd(card.cwd || '')
    setConfigCommand(getInitialCmd())
    setConfigShell(card.shell || '')
  }, [card.title, card.cwd, card.command, card.commands, card.shell])

  const handleOpenConfig = (): void => {
    setConfigTitle(card.title || '')
    setConfigCwd(card.cwd || '')
    setConfigCommand(getInitialCmd())
    setConfigShell(card.shell || '')
    window.neoAPI.getShells().then(setShells).catch(() => setShells([]))
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
    const cmdList = trimmedCmd
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'))
    const shell = configShell || undefined

    onUpdate({
      title: trimmedTitle,
      cwd: trimmedCwd,
      shell,
      command: trimmedCmd,
      commands: cmdList.length > 1 ? cmdList : undefined
    })

    const existing = terminalPool.getTerminal(card.id)
    if (existing) {
      existing.updateConfig({
        cwd: trimmedCwd,
        shell,
        command: trimmedCmd,
        commands: cmdList.length > 1 ? cmdList : undefined
      })
      if (andRestart) {
        existing.restart({
          cwd: trimmedCwd,
          shell,
          command: trimmedCmd,
          commands: cmdList.length > 1 ? cmdList : undefined,
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

  const cardStyle: React.CSSProperties = {
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
      className={`canvas-card pointer-events-auto flex flex-col island overflow-hidden select-none transition-shadow ${
        isFocused
          ? 'border-white/40 shadow-[0_0_32px_-6px_rgb(var(--signal-rgb)/0.55)]'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      {/* Header Bar */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-white/[0.04] border-b border-zinc-800 flex items-center justify-between cursor-move select-none shrink-0"
      >
        {/* Left: Indicator & Title */}
        <div className="flex items-center space-x-2 truncate">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isWorking ? 'bg-signal animate-pulse' : isDone || isFocused ? 'bg-signal' : 'bg-zinc-600'
            }`}
          ></span>
          <span className="text-[11px] stamp text-zinc-100 truncate">
            {card.title || 'Terminal'}
          </span>

          {(isWorking || isDone) && elapsed !== null && (
            <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">
              {isWorking ? 'trabajando' : 'lista'} {formatElapsed(elapsed)}
            </span>
          )}

          {detectedUrl && (
            <button
              onClick={() => {
                const target = cleanUrl(detectedUrl)
                if (onOpenInBrowser) {
                  onOpenInBrowser(target)
                } else {
                  openExternalUrl(target)
                }
              }}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-control bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/15 text-[10px] transition-colors cursor-pointer animate-in fade-in"
              title={`Abrir ${cleanUrl(detectedUrl)}`}
            >
              <Globe size={10} className="text-zinc-300 shrink-0" />
              <span className="truncate max-w-[120px]">{cleanUrl(detectedUrl).replace(/^https?:\/\//, '')}</span>
            </button>
          )}
        </div>

        {/* Right: Metrics & Controls */}
        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {metrics && (
            <div className="hidden sm:flex items-center space-x-1 text-[10px] text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-1.5 py-0.5 rounded-control">
              <span>{metrics.cpu}%</span>
              <span className="text-zinc-600">|</span>
              <span>{metrics.memoryMb}MB</span>
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onUpdate({ notifyMuted: !card.notifyMuted })
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            title={card.notifyMuted ? 'Activar avisos de esta terminal' : 'Silenciar avisos de esta terminal'}
          >
            {card.notifyMuted ? <BellOff size={11} className="pointer-events-none" /> : <Bell size={11} className="pointer-events-none" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenConfig()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
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
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
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
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
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
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
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
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Clear Console"
          >
            <Eraser size={11} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(card.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded-control text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
            title="Eliminar consola"
          >
            <Trash2 size={13} className="pointer-events-none" />
          </button>
        </div>
      </div>

      {/* Terminal View Body */}
      <div className="flex-1 w-full relative min-h-0 bg-void/70 overflow-hidden">
        <XTermView
          ref={termRef}
          panelId={card.id}
          cwd={card.cwd || ''}
          shell={card.shell}
          command={card.command || ''}
          commands={card.commands}
          env={card.env}
          autoStart={card.autoStart ?? true}
          isActive={isFocused}
        />

        {/* Quick Config Modal Overlay */}
        {isConfigOpen && (
          <div
            className="absolute inset-0 z-50 bg-void/95 backdrop-blur-xs flex flex-col p-4 animate-in fade-in duration-100 text-xs select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="font-medium text-zinc-200 text-xs flex items-center space-x-1.5">
                <Settings size={13} className="text-zinc-100" />
                <span className="stamp text-[10px]">CONFIGURAR TERMINAL</span>
              </span>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 stamp block mb-1">
                  TÍTULO
                </label>
                <input
                  type="text"
                  value={configTitle}
                  onChange={(e) => setConfigTitle(e.target.value)}
                  placeholder="TERMINAL"
                  className="w-full bg-white/[0.04] border border-zinc-700/80 rounded-control px-2.5 py-1.5 text-zinc-200 text-xs font-mono focus:border-white/40 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 stamp block mb-1">
                  DIRECTORIO DE TRABAJO (PATH)
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    value={configCwd}
                    onChange={(e) => setConfigCwd(e.target.value)}
                    placeholder="/home/usuario/proyecto"
                    className="flex-1 bg-white/[0.04] border border-zinc-700/80 rounded-control px-2.5 py-1.5 text-zinc-200 text-xs font-mono focus:border-white/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="px-2.5 py-1.5 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center space-x-1 transition-colors shrink-0 cursor-pointer"
                  >
                    <FolderOpen size={12} className="text-zinc-400" />
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 stamp block mb-1">
                  MOTOR DE TERMINAL
                </label>
                <select
                  value={configShell}
                  onChange={(e) => setConfigShell(e.target.value)}
                  className="w-full bg-void border border-zinc-700/80 rounded-control px-2.5 py-1.5 text-zinc-200 text-xs focus:border-white/40 focus:outline-none cursor-pointer"
                >
                  <option value="">Predeterminado (Ajustes)</option>
                  {shells.map((shell) => (
                    <option key={shell.id} value={shell.id}>
                      {shell.label}
                    </option>
                  ))}
                </select>
                <span className="text-[9px] text-zinc-500 block mt-0.5">
                  Se aplica al reiniciar la terminal
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-zinc-500 stamp block">
                    SECUENCIA DE COMANDOS (AUTO-RUN)
                  </label>
                  {(() => {
                    const steps = (configCommand || '')
                      .split('\n')
                      .map((l) => l.trim())
                      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'))
                    if (steps.length > 1) {
                      return (
                        <span className="px-1.5 py-0.2 rounded-control bg-white/5 text-zinc-300 border border-white/15 text-[9px] font-medium">
                          {steps.length} pasos en secuencia
                        </span>
                      )
                    }
                    return null
                  })()}
                </div>
                <textarea
                  value={configCommand}
                  onChange={(e) => setConfigCommand(e.target.value)}
                  placeholder={`# Secuencia de comandos:\nsource .venv/bin/activate\nnpm run dev`}
                  rows={3}
                  className="w-full bg-white/[0.04] border border-zinc-700/80 rounded-control px-2.5 py-1.5 text-zinc-100 text-xs font-mono focus:border-white/40 focus:outline-none placeholder:text-zinc-600 leading-relaxed resize-y min-h-[64px]"
                  spellCheck={false}
                />
                <span className="text-[9px] text-zinc-500 block mt-0.5">
                  1 comando por línea (# para comentarios)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="px-3 py-1.5 rounded-control border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig(false)}
                className="px-3 py-1.5 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors cursor-pointer"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig(true)}
                className="px-3.5 py-1.5 rounded-control bg-signal hover:bg-signal/85 text-zinc-950 font-medium text-xs transition-colors cursor-pointer"
              >
                Guardar y Reiniciar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle (Bottom Right) */}
      <div
        onMouseDown={(e) => onResizeStart(e, card.id)}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-zinc-100"
        title="Resize Node"
      >
        <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
          <polygon points="6 0, 6 6, 0 6" />
        </svg>
      </div>
    </div>
  )
}
