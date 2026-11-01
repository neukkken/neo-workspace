import React, { useCallback, useEffect, useState } from 'react'
import { GitCommitHorizontal, GitCompare, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { CanvasCard, SessionChanges } from '../types'

const REFRESH_MS = 10000
const MAX_DIFF_LINES = 2000

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  M: { label: 'Modificado', className: 'text-signal' },
  A: { label: 'Añadido', className: 'text-emerald-300' },
  U: { label: 'Nuevo', className: 'text-emerald-300' },
  D: { label: 'Borrado', className: 'text-rose-400' }
}

// File headers repeat what the list already shows
const isDiffHeader = (line: string): boolean => /^(diff --git|index |new file|deleted file|--- |\+\+\+ )/.test(line)

const diffLineClass = (line: string): string => {
  if (line.startsWith('@@')) return 'text-zinc-500'
  if (line.startsWith('+')) return 'text-emerald-300 bg-emerald-500/10'
  if (line.startsWith('-')) return 'text-rose-300 bg-rose-500/10'
  return 'text-zinc-300'
}

const DiffView: React.FC<{ text: string }> = ({ text }) => {
  // Content lines start with +, - or a space, so this can't match a file that mentions it
  if (/^Binary files /m.test(text)) {
    return <p className="p-3 text-zinc-500">Archivo binario.</p>
  }
  const lines = text.split('\n').filter((line) => !isDiffHeader(line))
  return (
    <pre className="min-w-max p-2 font-mono text-[11px] leading-relaxed">
      {lines.slice(0, MAX_DIFF_LINES).map((line, idx) => (
        <div key={idx} className={`px-1 ${diffLineClass(line)}`}>
          {line || ' '}
        </div>
      ))}
      {lines.length > MAX_DIFF_LINES && (
        <div className="px-1 pt-2 text-zinc-500">Se muestran las primeras {MAX_DIFF_LINES} líneas de {lines.length}.</div>
      )}
    </pre>
  )
}

interface GitCardProps {
  card: CanvasCard
  folders: string[]
  isVisible: boolean
  // Changes when an agent of this workspace finishes, so its work shows up at once
  refreshKey: number
  isFocused: boolean
  onFocus: () => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
}

export const GitCard: React.FC<GitCardProps> = ({
  card,
  folders,
  isVisible,
  refreshKey,
  isFocused,
  onFocus,
  onDelete,
  onDragStart,
  onResizeStart
}) => {
  const [repos, setRepos] = useState<string[]>([])
  const [repo, setRepo] = useState<string | null>(null)
  const [changes, setChanges] = useState<SessionChanges | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const foldersKey = folders.join('|')

  useEffect(() => {
    let cancelled = false
    window.neoAPI
      .gitRepos(foldersKey ? foldersKey.split('|') : [])
      .then((list) => {
        if (cancelled) return
        setRepos(list)
        setRepo((current) => (current && list.includes(current) ? current : list[0] ?? null))
      })
      .catch(() => !cancelled && setRepos([]))
    return () => {
      cancelled = true
    }
  }, [foldersKey])

  const load = useCallback(async (): Promise<void> => {
    if (!repo) return
    try {
      setChanges(await window.neoAPI.gitSessionChanges(repo))
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [repo])

  useEffect(() => {
    setChanges(null)
    setSelected(null)
  }, [repo])

  useEffect(() => {
    if (!repo || !isVisible) return
    load()
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [repo, isVisible, refreshKey, load])

  // Reloads with every listing: the open file may be what just changed
  useEffect(() => {
    if (!repo || !selected) {
      setDiff(null)
      return
    }
    let cancelled = false
    window.neoAPI
      .gitSessionDiff(repo, selected)
      .then((text) => !cancelled && setDiff(text))
      .catch(() => !cancelled && setDiff(null))
    return () => {
      cancelled = true
    }
  }, [repo, selected, changes])

  const handleNewSession = async (): Promise<void> => {
    if (!repo) return
    await window.neoAPI.gitSessionReset(repo)
    setSelected(null)
    await load()
  }

  const files = changes?.files ?? []
  const totalAdded = files.reduce((sum, f) => sum + (f.added ?? 0), 0)
  const totalRemoved = files.reduce((sum, f) => sum + (f.removed ?? 0), 0)

  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${card.x}px`,
    top: `${card.y}px`,
    width: `${card.width}px`,
    height: `${card.height}px`,
    zIndex: isFocused ? 50 : card.zIndex || 10
  }

  const emptyMessage = !changes
    ? repos.length === 0
      ? 'Este workspace no tiene repositorios git.'
      : loadFailed
      ? 'No se pudieron leer los cambios.'
      : 'Leyendo cambios…'
    : !changes.hasBaseline
    ? 'Este repositorio aún no tiene commits, así que no hay punto de partida.'
    : 'Sin cambios en esta sesión.'

  return (
    <div
      style={{ ...cardStyle, overscrollBehavior: 'contain' }}
      onClick={onFocus}
      onWheel={(e) => e.stopPropagation()}
      className={`canvas-card pointer-events-auto flex flex-col island overflow-hidden select-none transition-shadow ${
        isFocused
          ? 'border-white/40 shadow-[0_0_32px_-6px_rgb(var(--signal-rgb)/0.55)]'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-white/[0.04] border-b border-zinc-800 flex items-center justify-between cursor-move shrink-0"
      >
        <div className="flex items-center space-x-2 min-w-0">
          <GitCompare size={12} className="text-zinc-400 shrink-0" />
          <span className="text-[11px] stamp text-zinc-100 truncate">{card.title || 'Cambios'}</span>
          {repos.length > 1 ? (
            <select
              value={repo ?? ''}
              onChange={(e) => setRepo(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              className="min-w-0 bg-void border border-zinc-700/80 rounded-control px-1.5 py-0.5 text-zinc-200 text-[10px] focus:outline-none cursor-pointer"
            >
              {repos.map((r) => (
                <option key={r} value={r}>
                  {r.split(/[\\/]/).pop()}
                </option>
              ))}
            </select>
          ) : (
            changes && <span className="text-[10px] text-zinc-400 truncate">{changes.name}</span>
          )}
          {changes?.branch && <span className="text-[10px] text-zinc-100 truncate">{changes.branch}</span>}
        </div>

        <div className="flex items-center space-x-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={load} title="Actualizar" className="p-1 rounded-control text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer">
            <RefreshCw size={11} className="pointer-events-none" />
          </button>
          <button type="button" onClick={handleNewSession} title="Nueva sesión: contar desde ahora" className="p-1 rounded-control text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer">
            <RotateCcw size={11} className="pointer-events-none" />
          </button>
          <button type="button" onClick={() => onDelete(card.id)} title="Eliminar tarjeta" className="p-1.5 rounded-control text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer">
            <Trash2 size={13} className="pointer-events-none" />
          </button>
        </div>
      </div>

      {files.length === 0 && !changes?.commits.length ? (
        <div className="flex-1 flex items-center justify-center p-6 text-xs text-zinc-500 text-center bg-void/70">{emptyMessage}</div>
      ) : (
        <div className="flex-1 min-h-0 flex text-xs bg-void/70">
          <div className="w-2/5 min-w-0 border-r border-zinc-800 flex flex-col">
            <div className="h-7 px-2.5 border-b border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400 shrink-0">
              <span>{changes?.truncated ? `Primeros ${files.length} archivos` : `${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}`}</span>
              <span className="tabular-nums">
                <span className="text-emerald-300">+{totalAdded}</span> <span className="text-rose-300">−{totalRemoved}</span>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {files.map((file) => {
                const style = STATUS_STYLE[file.status] ?? { label: file.status, className: 'text-zinc-400' }
                const slash = file.path.lastIndexOf('/')
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelected(file.path)}
                    title={`${style.label}: ${file.path}`}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 text-left text-[11px] transition-colors cursor-pointer ${
                      selected === file.path ? 'bg-white/10 text-zinc-100' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span className={`w-2.5 shrink-0 font-mono ${style.className}`}>{file.status}</span>
                    <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      <span className="truncate shrink-0 max-w-full">{file.path.slice(slash + 1)}</span>
                      {slash >= 0 && <span className="truncate text-[10px] text-zinc-500">{file.path.slice(0, slash)}</span>}
                    </span>
                    {file.added !== null && (
                      <span className="shrink-0 tabular-nums text-[10px] text-zinc-500">+{file.added} −{file.removed}</span>
                    )}
                  </button>
                )
              })}
            </div>
            {changes && changes.commits.length > 0 && (
              <div className="max-h-[30%] overflow-y-auto no-scrollbar border-t border-zinc-800 py-1 shrink-0">
                {changes.commits.map((commit) => (
                  <div key={commit.hash} title={commit.subject} className="flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] text-zinc-400">
                    <GitCommitHorizontal size={11} className="shrink-0 text-zinc-500" />
                    <span className="font-mono shrink-0">{commit.hash}</span>
                    <span className="truncate">{commit.subject}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 overflow-auto select-text">
            {diff !== null ? (
              <DiffView text={diff} />
            ) : (
              <p className="p-3 text-zinc-500">{selected ? 'No se pudo leer este archivo.' : 'Elige un archivo para ver sus cambios.'}</p>
            )}
          </div>
        </div>
      )}

      <div
        onMouseDown={(e) => onResizeStart(e, card.id)}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-zinc-100"
        title="Redimensionar tarjeta"
      >
        <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
          <polygon points="6 0, 6 6, 0 6" />
        </svg>
      </div>
    </div>
  )
}
