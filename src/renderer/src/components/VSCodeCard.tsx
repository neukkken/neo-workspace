import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Code2,
  RotateCw,
  ExternalLink,
  Trash2,
  Maximize2,
  Minimize2,
  FolderOpen,
  Play,
  Square,
  Globe,
  Terminal,
  Cpu,
  Monitor,
  Check,
  AlertCircle
} from 'lucide-react'
import { CanvasCard } from '../types'

interface VSCodeCardProps {
  card: CanvasCard
  isFocused: boolean
  workspacePath?: string
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
}

const CHROME_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'

export const VSCodeCard: React.FC<VSCodeCardProps> = ({
  card,
  isFocused,
  workspacePath,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart
}) => {
  const currentPath = card.vscodePath || workspacePath || ''
  const [mode, setMode] = useState<'local' | 'web' | 'custom'>(card.vscodeMode || 'local')
  const [serverUrl, setServerUrl] = useState<string | null>(card.vscodeUrl || null)
  const [serverPort, setServerPort] = useState<number | null>(card.vscodePort || null)
  const [customUrl, setCustomUrl] = useState<string>(card.vscodeUrl || 'http://localhost:8080')
  const [isStarting, setIsStarting] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCodeInstalled, setIsCodeInstalled] = useState<boolean | null>(null)
  const [key, setKey] = useState(0)

  const webviewRef = useRef<any>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Check if code is installed on mount
  useEffect(() => {
    let isMounted = true
    window.neoAPI
      ?.vscodeCheckInstalled()
      .then((installed) => {
        if (isMounted) setIsCodeInstalled(installed)
      })
      .catch(() => {
        if (isMounted) setIsCodeInstalled(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  // Start local server if mode is 'local' and url not set yet
  const handleStartLocalServer = useCallback(async () => {
    setIsStarting(true)
    setErrorMessage(null)
    try {
      const res = await window.neoAPI.vscodeStartServer(currentPath)
      if (res.success && res.url) {
        setServerUrl(res.url)
        setServerPort(res.port || null)
        onUpdate({
          vscodeMode: 'local',
          vscodeUrl: res.url,
          vscodePort: res.port
        })
      } else {
        setErrorMessage(res.error || 'No se pudo iniciar el servidor local de VS Code.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con VS Code')
    } finally {
      setIsStarting(false)
    }
  }, [currentPath, onUpdate])

  // Stop local server
  const handleStopLocalServer = async (): Promise<void> => {
    if (serverPort) {
      await window.neoAPI.vscodeStopServer(serverPort)
      setServerUrl(null)
      setServerPort(null)
      onUpdate({ vscodeUrl: undefined, vscodePort: undefined })
    }
  }

  // Open in Desktop VS Code
  const handleOpenDesktop = async (): Promise<void> => {
    await window.neoAPI.vscodeOpenDesktop(currentPath)
  }

  // Reload webview
  const handleReload = (): void => {
    setKey((prev) => prev + 1)
    if (webviewRef.current && typeof webviewRef.current.reload === 'function') {
      webviewRef.current.reload()
    } else if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }

  const handleOpenDevTools = (): void => {
    if (webviewRef.current && typeof webviewRef.current.openDevTools === 'function') {
      webviewRef.current.openDevTools()
    }
  }

  // Compute active target URL
  const getActiveUrl = (): string => {
    if (mode === 'local') {
      return serverUrl || ''
    }
    if (mode === 'web') {
      return 'https://vscode.dev'
    }
    return customUrl
  }

  const activeUrl = getActiveUrl()

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
      className={`canvas-card pointer-events-auto flex flex-col bg-[#111318] rounded-lg border shadow-2xl overflow-hidden select-none transition-shadow ${
        isFocused
          ? 'border-blue-500/90 shadow-[0_0_25px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      {/* Header Bar */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-[#181a20] border-b border-zinc-800 flex items-center justify-between cursor-move select-none shrink-0"
      >
        {/* Left: VS Code Badge & Title */}
        <div className="flex items-center space-x-2 truncate">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-blue-500/20 text-blue-400 shrink-0">
            <Code2 size={13} className="text-blue-400" />
          </div>
          <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-100 uppercase truncate">
            {card.title || 'VSCODE'}
          </span>
          {serverPort && mode === 'local' && (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded">
              :{serverPort}
            </span>
          )}
        </div>

        {/* Center: Mode Selector Pills */}
        <div
          className="flex items-center space-x-1 bg-zinc-900/90 border border-zinc-800/80 p-0.5 rounded text-[10px] font-mono"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setMode('local')
              onUpdate({ vscodeMode: 'local' })
            }}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              mode === 'local'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="VS Code Local (code serve-web con tus archivos)"
          >
            Local
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('web')
              onUpdate({ vscodeMode: 'web' })
            }}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              mode === 'web'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="VS Code Web oficial (vscode.dev)"
          >
            Web (vscode.dev)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('custom')
              onUpdate({ vscodeMode: 'custom' })
            }}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              mode === 'custom'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Servidor Personalizado / code-server"
          >
            URL
          </button>
        </div>

        {/* Right: Actions */}
        <div
          className="flex items-center space-x-1"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {isCodeInstalled && (
            <button
              type="button"
              onClick={handleOpenDesktop}
              className="hidden sm:flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono transition-colors cursor-pointer"
              title="Abrir en VS Code de escritorio (code .)"
            >
              <ExternalLink size={10} />
              <span>Desktop</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleReload}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Recargar VS Code"
          >
            <RotateCw size={11} />
          </button>

          <button
            type="button"
            onClick={handleOpenDevTools}
            className="p-1 rounded text-zinc-400 hover:text-blue-400 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Abrir DevTools de la instancia"
          >
            <Terminal size={11} />
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title={isExpanded ? 'Restaurar tamaño' : 'Maximizar tarjeta'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>

          <button
            type="button"
            onClick={() => {
              handleStopLocalServer()
              onDelete(card.id)
            }}
            className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
            title="Eliminar instancia de VS Code"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Subheader / Status Bar */}
      {mode === 'custom' && (
        <div
          className="h-8 px-2 bg-[#0d0e12] border-b border-zinc-800 flex items-center space-x-2 shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">SERVER URL:</span>
          <input
            type="text"
            value={customUrl}
            onChange={(e) => {
              setCustomUrl(e.target.value)
              onUpdate({ vscodeUrl: e.target.value })
            }}
            placeholder="http://localhost:8080"
            className="flex-1 bg-[#14161d] border border-zinc-800 focus:border-blue-500 rounded px-2 py-0.5 text-xs font-mono text-zinc-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleReload}
            className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs cursor-pointer"
          >
            Conectar
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 w-full relative min-h-0 bg-[#1e1e1e] overflow-hidden flex flex-col">
        {mode === 'local' && !serverUrl ? (
          // Local Server Setup Prompt
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-[#111317]">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4 shadow-xl">
              <Code2 size={32} className="text-blue-400" />
            </div>

            <h3 className="font-mono text-sm font-semibold text-zinc-100 uppercase tracking-wider mb-1">
              INSTANCIA DE VS CODE
            </h3>

            <p className="font-mono text-xs text-zinc-400 max-w-md mb-2 leading-relaxed">
              Ejecuta el editor oficial de Visual Studio Code directamente dentro de Neowork con tus
              archivos, extensiones y terminal integrados.
            </p>

            {currentPath && (
              <div className="flex items-center space-x-1.5 font-mono text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded max-w-lg truncate mb-5">
                <FolderOpen size={12} className="text-amber-400 shrink-0" />
                <span className="truncate">{currentPath}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs flex items-center space-x-2 max-w-md text-left">
                <AlertCircle size={14} className="shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleStartLocalServer}
                disabled={isStarting}
                className="flex items-center space-x-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-mono font-semibold text-xs transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                {isStarting ? (
                  <>
                    <RotateCw size={13} className="animate-spin" />
                    <span>Iniciando Servidor de VS Code...</span>
                  </>
                ) : (
                  <>
                    <Play size={13} fill="currentColor" />
                    <span>Iniciar VS Code Local</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('web')
                  onUpdate({ vscodeMode: 'web' })
                }}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs transition-colors cursor-pointer"
              >
                <Globe size={13} className="text-cyan-400" />
                <span>Usar VS Code Web (vscode.dev)</span>
              </button>

              {isCodeInstalled && (
                <button
                  type="button"
                  onClick={handleOpenDesktop}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 font-mono text-xs transition-colors cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>Abrir en Escritorio</span>
                </button>
              )}
            </div>

            {isCodeInstalled === false && (
              <p className="font-mono text-[11px] text-amber-400/90 mt-4 max-w-sm leading-normal">
                Nota: No se detectó el comando <code>code</code> en la terminal. Puedes usar la versión
                web oficial de <strong>vscode.dev</strong> con un solo clic arriba.
              </p>
            )}
          </div>
        ) : (
          // Active Webview / Iframe Area
          <div className="w-full h-full relative flex-1 min-h-0 bg-[#1e1e1e]">
            <webview
              ref={webviewRef}
              key={`${key}-${activeUrl}`}
              src={activeUrl}
              allowpopups={true}
              partition="persist:neowork-vscode"
              useragent={CHROME_USER_AGENT}
              className="w-full h-full border-0 select-auto"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        )}
      </div>

      {/* Resize Handle (Bottom Right) */}
      {!isExpanded && (
        <div
          onMouseDown={(e) => onResizeStart(e, card.id)}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-blue-400"
          title="Redimensionar nodo"
        >
          <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
            <polygon points="6 0, 6 6, 0 6" />
          </svg>
        </div>
      )}
    </div>
  )
}
