import React, { useState, useEffect } from 'react'
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  File,
  ArrowLeft,
  RefreshCw,
  Maximize2,
  Minimize2,
  Trash2,
  Eye,
  Copy,
  Check,
  ExternalLink,
  ChevronRight
} from 'lucide-react'
import { CanvasCard, FileEntry } from '../types'

interface FileExplorerCardProps {
  card: CanvasCard
  isFocused: boolean
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
  onOpenInBrowser?: (url: string) => void
}

export const FileExplorerCard: React.FC<FileExplorerCardProps> = ({
  card,
  isFocused,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart
}) => {
  const [currentDir, setCurrentDir] = useState<string>(card.explorerPath || '')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string; content: string } | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadDirectory = async (dirToLoad?: string): Promise<void> => {
    setLoading(true)
    try {
      const res = await window.neoAPI.listDirectory(dirToLoad)
      setCurrentDir(res.dir)
      setEntries(res.entries || [])
      onUpdate({ explorerPath: res.dir })
    } catch (e) {
      console.error('Failed to load directory:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (card.explorerPath && card.explorerPath !== currentDir) {
      loadDirectory(card.explorerPath)
    } else if (!currentDir) {
      loadDirectory(card.explorerPath)
    }
  }, [card.explorerPath])

  const handleNavigate = (entry: FileEntry): void => {
    if (entry.isDirectory) {
      setHistory((prev) => [...prev, currentDir])
      loadDirectory(entry.path)
      setPreviewFile(null)
    } else {
      handleOpenFile(entry.path)
    }
  }

  const handleGoBack = (): void => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    loadDirectory(prev)
    setPreviewFile(null)
  }

  const handleOpenFile = async (filePath: string): Promise<void> => {
    try {
      const res = await window.neoAPI.readFile(filePath)
      if (res.content !== undefined) {
        setPreviewFile({
          path: filePath,
          name: res.name || 'preview',
          content: res.content
        })
      } else if (res.error) {
        alert(res.error)
      }
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  }

  const handleCopyPreview = async (): Promise<void> => {
    if (previewFile) {
      await window.neoAPI.writeClipboard(previewFile.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const getFileIcon = (entry: FileEntry): React.ReactNode => {
    if (entry.isDirectory) {
      return <Folder size={14} className="text-amber-400 shrink-0" />
    }
    const ext = entry.extension
    if (['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py', '.rs', '.go'].includes(ext || '')) {
      return <FileCode size={14} className="text-cyan-400 shrink-0" />
    }
    if (['.md', '.txt', '.log', '.env'].includes(ext || '')) {
      return <FileText size={14} className="text-emerald-400 shrink-0" />
    }
    return <File size={14} className="text-zinc-400 shrink-0" />
  }

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
      className={`canvas-card pointer-events-auto flex flex-col bg-[#0c0e12] rounded-lg border shadow-2xl overflow-hidden select-none transition-shadow ${
        isFocused
          ? 'border-indigo-500/80 shadow-[0_0_20px_rgba(99,102,241,0.2)] ring-1 ring-indigo-500/40'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      {/* Header Bar */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-[#12151b] border-b border-zinc-800 flex items-center justify-between cursor-move shrink-0"
      >
        <div className="flex items-center space-x-2 truncate">
          <FolderOpen size={14} className="text-indigo-400 shrink-0" />
          <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-100 uppercase truncate">
            {card.title || 'EXPLORER'}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[180px]">
            {currentDir}
          </span>
        </div>

        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => loadDirectory(currentDir)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Recargar carpeta"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={isExpanded ? 'Restaurar' : 'Maximizar'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/20 transition-colors"
            title="Eliminar tarjeta"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Navigation & Breadcrumbs Bar */}
      <div className="h-8 px-2 bg-[#090b0e] border-b border-zinc-800/80 flex items-center space-x-1.5 shrink-0 text-xs font-mono">
        <button
          onClick={handleGoBack}
          disabled={history.length === 0}
          className={`p-1 rounded transition-colors ${
            history.length > 0 ? 'text-zinc-300 hover:bg-zinc-800 cursor-pointer' : 'text-zinc-600 cursor-not-allowed'
          }`}
          title="Atrás"
        >
          <ArrowLeft size={12} />
        </button>

        <div className="flex-1 flex items-center space-x-1 overflow-x-auto text-[11px] text-zinc-400 px-1 scrollbar-none truncate">
          <span className="text-zinc-500 truncate">{currentDir}</span>
        </div>

        <button
          onClick={async () => {
            const selected = await window.neoAPI.selectDirectory(currentDir)
            if (selected) {
              setHistory((prev) => [...prev, currentDir])
              loadDirectory(selected)
            }
          }}
          className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors shrink-0"
        >
          Cambiar
        </button>
      </div>

      {/* Body: File list or Preview */}
      <div className="flex-1 flex min-h-0 bg-[#07090c] overflow-hidden">
        {previewFile ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0c10]">
            {/* Preview Toolbar */}
            <div className="px-3 py-1.5 bg-[#12141a] border-b border-zinc-800 flex items-center justify-between text-xs font-mono shrink-0">
              <div className="flex items-center space-x-2 truncate">
                <FileCode size={13} className="text-indigo-400 shrink-0" />
                <span className="font-semibold text-zinc-200 truncate">{previewFile.name}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleCopyPreview}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                >
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                >
                  Volver a lista
                </button>
              </div>
            </div>
            {/* Preview content */}
            <pre
              style={{ overscrollBehavior: 'contain' }}
              className={`flex-1 p-3 font-mono text-xs text-zinc-300 leading-relaxed select-text whitespace-pre-wrap ${
                isFocused ? 'overflow-auto' : 'overflow-hidden pointer-events-none'
              }`}
            >
              {previewFile.content}
            </pre>
          </div>
        ) : (
          <div
            style={{ overscrollBehavior: 'contain' }}
            className={`flex-1 p-1.5 space-y-0.5 font-mono text-xs select-none ${
              isFocused ? 'overflow-y-auto' : 'overflow-hidden pointer-events-none'
            }`}
          >
            {entries.length === 0 && !loading && (
              <div className="p-6 text-center text-zinc-600 text-xs">
                Carpeta vacía o sin archivos visibles.
              </div>
            )}
            {entries.map((entry) => (
              <div
                key={entry.path}
                onDoubleClick={() => handleNavigate(entry)}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800/60 cursor-pointer group transition-colors text-zinc-300 hover:text-white"
              >
                <div className="flex items-center space-x-2 truncate min-w-0">
                  {getFileIcon(entry)}
                  <span className="truncate text-[11px]">{entry.name}</span>
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-zinc-500 shrink-0">
                  <span>{formatSize(entry.size)}</span>
                  {entry.isDirectory ? (
                    <ChevronRight size={12} className="text-zinc-600 group-hover:text-zinc-400" />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenFile(entry.path)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-indigo-400"
                      title="Previsualizar"
                    >
                      <Eye size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resize Handle */}
      {!isExpanded && (
        <div
          onMouseDown={(e) => onResizeStart(e, card.id)}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-indigo-400"
        >
          <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
            <polygon points="6 0, 6 6, 0 6" />
          </svg>
        </div>
      )}
    </div>
  )
}
