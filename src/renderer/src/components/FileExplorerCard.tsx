import React, { useState, useEffect } from 'react'
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileSpreadsheet,
  File,
  Image as ImageIcon,
  Archive,
  ArrowLeft,
  RefreshCw,
  Maximize2,
  Minimize2,
  Trash2,
  Eye,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Search,
  X,
  Table
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

interface PreviewState {
  type: 'text' | 'spreadsheet' | 'binary'
  path: string
  name: string
  content?: string
  sheets?: Array<{ name: string; rows: any[][] }>
  activeSheetIndex?: number
  size?: number
  error?: string
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
  const [previewFile, setPreviewFile] = useState<PreviewState | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')

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
      setLoading(true)
      const res = await window.neoAPI.readFile(filePath)
      if (res.type === 'spreadsheet' && res.sheets && res.sheets.length > 0) {
        setPreviewFile({
          type: 'spreadsheet',
          path: filePath,
          name: res.name || 'Hoja de Cálculo',
          sheets: res.sheets,
          activeSheetIndex: 0,
          size: res.size
        })
      } else if (res.type === 'binary' || res.isBinary) {
        setPreviewFile({
          type: 'binary',
          path: filePath,
          name: res.name || 'archivo',
          error: res.error,
          size: res.size
        })
      } else if (res.content !== undefined) {
        setPreviewFile({
          type: 'text',
          path: filePath,
          name: res.name || 'preview',
          content: res.content,
          size: res.size
        })
      } else {
        alert(res.error || 'No se pudo leer el archivo')
      }
    } catch (e) {
      console.error('Failed to open file:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenInSystem = async (filePath: string): Promise<void> => {
    try {
      const err = await window.neoAPI.openPath(filePath)
      if (err) {
        console.error('Failed to open path in system:', err)
      }
    } catch (e) {
      console.error('Error opening with system:', e)
    }
  }

  const handleShowInFolder = async (filePath: string): Promise<void> => {
    try {
      await window.neoAPI.showItemInFolder(filePath)
    } catch (e) {
      console.error('Error showing in folder:', e)
    }
  }

  const handleCopyPreview = async (): Promise<void> => {
    if (previewFile?.content) {
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
    if (['.xlsx', '.xls', '.csv', '.tsv', '.ods'].includes(ext || '')) {
      return <FileSpreadsheet size={14} className="text-emerald-400 shrink-0" />
    }
    if (['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py', '.rs', '.go', '.sh', '.bash'].includes(ext || '')) {
      return <FileCode size={14} className="text-cyan-400 shrink-0" />
    }
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext || '')) {
      return <ImageIcon size={14} className="text-purple-400 shrink-0" />
    }
    if (['.zip', '.tar', '.gz', '.7z', '.rar'].includes(ext || '')) {
      return <Archive size={14} className="text-amber-500 shrink-0" />
    }
    if (['.md', '.txt', '.log', '.env', '.pdf', '.docx', '.doc'].includes(ext || '')) {
      return <FileText size={14} className="text-zinc-300 shrink-0" />
    }
    return <File size={14} className="text-zinc-400 shrink-0" />
  }

  const formatSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const filteredEntries = filterQuery.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(filterQuery.toLowerCase()))
    : entries

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

      {/* Search Filter Bar */}
      {!previewFile && (
        <div className="flex items-center px-2.5 py-1 bg-[#0a0c10] border-b border-zinc-800/60 space-x-1.5 text-xs shrink-0">
          <Search size={11} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="Filtrar archivos (.xlsx, test, etc.)..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-zinc-200 placeholder-zinc-600 text-[10.5px] font-mono flex-1 min-w-0"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
              title="Limpiar filtro"
            >
              <X size={11} />
            </button>
          )}
          <span className="text-[10px] text-zinc-600 font-mono shrink-0">
            {filteredEntries.length} {filteredEntries.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      )}

      {/* Body: File list or Preview */}
      <div className="flex-1 flex min-h-0 bg-[#07090c] overflow-hidden">
        {previewFile ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0c10]">
            {/* Preview Toolbar */}
            <div className="px-3 py-1.5 bg-[#12141a] border-b border-zinc-800 flex items-center justify-between text-xs font-mono shrink-0">
              <div className="flex items-center space-x-2 truncate min-w-0">
                {previewFile.type === 'spreadsheet' ? (
                  <FileSpreadsheet size={13} className="text-emerald-400 shrink-0" />
                ) : (
                  <FileCode size={13} className="text-indigo-400 shrink-0" />
                )}
                <span className="font-semibold text-zinc-200 truncate">{previewFile.name}</span>
                {previewFile.size && (
                  <span className="text-[10px] text-zinc-500 shrink-0">({formatSize(previewFile.size)})</span>
                )}
              </div>
              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => handleOpenInSystem(previewFile.path)}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] transition-colors"
                  title="Abrir con la aplicación predeterminada del sistema (ej. Excel / Editor)"
                >
                  <ExternalLink size={10} />
                  <span>Abrir en sistema</span>
                </button>
                <button
                  onClick={() => handleShowInFolder(previewFile.path)}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                  title="Mostrar en explorador de archivos"
                >
                  <Folder size={10} />
                </button>
                {previewFile.content && (
                  <button
                    onClick={handleCopyPreview}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                  >
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                )}
                <button
                  onClick={() => setPreviewFile(null)}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                >
                  Volver a lista
                </button>
              </div>
            </div>

            {/* Preview content */}
            {previewFile.type === 'spreadsheet' && previewFile.sheets ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#07090c]">
                {/* Sheet Tabs */}
                {previewFile.sheets.length > 1 && (
                  <div className="flex items-center space-x-1 border-b border-zinc-800 bg-[#0d0f14] px-2 py-1 overflow-x-auto shrink-0 scrollbar-none">
                    {previewFile.sheets.map((sheet, idx) => (
                      <button
                        key={sheet.name}
                        onClick={() => setPreviewFile((prev) => (prev ? { ...prev, activeSheetIndex: idx } : null))}
                        className={`px-2.5 py-0.5 rounded text-[10.5px] font-mono transition-colors shrink-0 ${
                          (previewFile.activeSheetIndex || 0) === idx
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                        }`}
                      >
                        <span className="flex items-center space-x-1">
                          <Table size={10} className="shrink-0" />
                          <span>{sheet.name}</span>
                          <span className="text-[9px] text-zinc-500">({sheet.rows.length})</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Spreadsheet Table View */}
                <div className="flex-1 overflow-auto p-2 scrollbar-thin">
                  {(() => {
                    const currentSheet = previewFile.sheets[previewFile.activeSheetIndex || 0]
                    const rows = currentSheet?.rows || []
                    if (rows.length === 0) {
                      return (
                        <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                          Hoja de cálculo vacía.
                        </div>
                      )
                    }
                    const maxCols = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)), 1)
                    return (
                      <table className="w-full border-collapse text-[11px] font-mono text-zinc-300 select-text">
                        <tbody>
                          {rows.map((row, rIdx) => {
                            const isHeader = rIdx === 0
                            return (
                              <tr
                                key={rIdx}
                                className={`border-b border-zinc-800/60 transition-colors ${
                                  isHeader
                                    ? 'bg-zinc-900/90 font-semibold text-emerald-400'
                                    : 'hover:bg-zinc-800/40'
                                }`}
                              >
                                <td className="px-2 py-1 bg-zinc-950/80 border-r border-zinc-800 text-[10px] text-zinc-600 text-right select-none w-8 shrink-0">
                                  {rIdx + 1}
                                </td>
                                {Array.from({ length: maxCols }).map((_, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="px-2.5 py-1 border-r border-zinc-800/40 truncate max-w-[240px]"
                                    title={String(row[cIdx] ?? '')}
                                  >
                                    {String(row[cIdx] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>
              </div>
            ) : previewFile.type === 'binary' ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400 space-y-3 font-mono">
                <div className="p-3 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-indigo-400">
                  <File size={32} />
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-200 font-semibold text-sm">{previewFile.name}</p>
                  <p className="text-[11px] text-zinc-500">{formatSize(previewFile.size)}</p>
                  <p className="text-[11px] text-zinc-400 max-w-sm">
                    {previewFile.error || 'Archivo sin previsualización de texto directa.'}
                  </p>
                </div>
                <button
                  onClick={() => handleOpenInSystem(previewFile.path)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>Abrir en el sistema</span>
                </button>
              </div>
            ) : (
              <pre
                style={{ overscrollBehavior: 'contain' }}
                className="flex-1 p-3 font-mono text-xs text-zinc-300 leading-relaxed select-text whitespace-pre-wrap overflow-auto"
              >
                {previewFile.content}
              </pre>
            )}
          </div>
        ) : (
          <div
            style={{ overscrollBehavior: 'contain' }}
            className="flex-1 p-1.5 space-y-0.5 font-mono text-xs select-none overflow-y-auto"
          >
            {filteredEntries.length === 0 && !loading && (
              <div className="p-6 text-center text-zinc-600 text-xs">
                {filterQuery
                  ? `No se encontraron archivos que coincidan con "${filterQuery}".`
                  : 'Carpeta vacía o sin archivos visibles.'}
              </div>
            )}
            {filteredEntries.map((entry) => (
              <div
                key={entry.path}
                onDoubleClick={() => handleNavigate(entry)}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800/60 cursor-pointer group transition-colors text-zinc-300 hover:text-white"
              >
                <div className="flex items-center space-x-2 truncate min-w-0">
                  {getFileIcon(entry)}
                  <span className="truncate text-[11px]">{entry.name}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500 shrink-0">
                  <span>{formatSize(entry.size)}</span>
                  {entry.isDirectory ? (
                    <ChevronRight size={12} className="text-zinc-600 group-hover:text-zinc-400" />
                  ) : (
                    <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenFile(entry.path)
                        }}
                        className="p-1 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-indigo-400"
                        title="Previsualizar"
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenInSystem(entry.path)
                        }}
                        className="p-1 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-emerald-400"
                        title="Abrir con aplicación predeterminada del sistema"
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
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
