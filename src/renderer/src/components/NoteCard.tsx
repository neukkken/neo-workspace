import React, { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Copy, FileText, Palette, Send, Trash2, X } from 'lucide-react'
import { AgentStatus, CanvasCard, NoteColor } from '../types'
import { CardResizeHandles, ResizeStart } from './CardResizeHandles'
import { terminalPool } from '../services/terminal-pool'
import { openExternalUrl } from '../utils/url'
import {
  addCodeBlock,
  addTask,
  nextTask,
  NoteBlock,
  parseInline,
  parseNote,
  removeLine,
  taskProgress,
  toggleTask
} from '../utils/noteMarkup'

const SAVE_DELAY_MS = 400
const CAPTURE_LINES = 40

export interface NoteTerminal {
  id: string
  title: string
  state?: AgentStatus['state']
  linked: boolean
}

interface NoteCardProps {
  card: CanvasCard
  terminals: NoteTerminal[]
  isFocused: boolean
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onLinkTerminal: (terminalId: string) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: ResizeStart
}

const COLOR_VARIANTS: Record<
  NoteColor,
  {
    border: string
    glow: string
    dot: string
    bgHeader: string
    badge: string
    tag: string
  }
> = {
  emerald: {
    border: 'border-emerald-500/70',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30',
    dot: 'bg-emerald-400',
    bgHeader: 'bg-emerald-950/20',
    badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    tag: 'Emerald'
  },
  amber: {
    border: 'border-amber-500/70',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30',
    dot: 'bg-amber-400',
    bgHeader: 'bg-amber-950/20',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    tag: 'Amber'
  },
  cyan: {
    border: 'border-cyan-500/70',
    glow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30',
    dot: 'bg-cyan-400',
    bgHeader: 'bg-cyan-950/20',
    badge: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    tag: 'Cyan'
  },
  purple: {
    border: 'border-purple-500/70',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30',
    dot: 'bg-purple-400',
    bgHeader: 'bg-purple-950/20',
    badge: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    tag: 'Purple'
  },
  zinc: {
    border: 'border-zinc-600/70',
    glow: 'shadow-[0_0_20px_rgba(113,113,122,0.15)] ring-1 ring-zinc-500/30',
    dot: 'bg-zinc-400',
    bgHeader: 'bg-zinc-900/40',
    badge: 'text-zinc-400 bg-zinc-800 border-zinc-700',
    tag: 'Slate'
  }
}

const renderInline = (text: string): React.ReactNode =>
  parseInline(text).map((part, idx) => {
    if (part.kind === 'bold') {
      return <strong key={idx} className="font-medium text-zinc-100">{part.text}</strong>
    }
    if (part.kind === 'code') {
      return <code key={idx} className="font-mono text-[11px] bg-white/10 rounded-control px-1 text-zinc-100">{part.text}</code>
    }
    if (part.kind === 'link') {
      return (
        <button
          key={idx}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openExternalUrl(part.href)
          }}
          className="underline text-zinc-100 hover:text-signal transition-colors cursor-pointer"
        >
          {part.text}
        </button>
      )
    }
    return <React.Fragment key={idx}>{part.text}</React.Fragment>
  })

const hoverAction =
  'p-1 rounded-control text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:hidden'

export const NoteCard: React.FC<NoteCardProps> = ({
  card,
  terminals,
  isFocused,
  onFocus,
  onUpdate,
  onLinkTerminal,
  onDelete,
  onDragStart,
  onResizeStart
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleText, setTitleText] = useState(card.title || 'NOTAS DEL PROYECTO')
  const [noteContent, setNoteContent] = useState(card.noteContent ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [targetId, setTargetId] = useState('')
  const [sentTasks, setSentTasks] = useState<Record<string, 'running' | 'review'>>({})

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const currentColor: NoteColor = card.noteColor || 'zinc'
  const styleConfig = COLOR_VARIANTS[currentColor] || COLOR_VARIANTS.emerald

  const linked = terminals.filter((t) => t.linked)
  const unlinked = terminals.filter((t) => !t.linked)
  const target = linked.find((t) => t.id === targetId) ?? linked[0]
  const isWorking = target?.state === 'working'
  // Never while it's busy: a message can land on top of a prompt the agent is showing
  const canSend = !!target && !isWorking
  const progress = taskProgress(noteContent)

  // Typing saves after a pause, not with every key: each save rewrites the whole config
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; value: string } | null>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const flushSave = (): void => {
    if (!pendingRef.current) return
    clearTimeout(pendingRef.current.timer)
    onUpdateRef.current({ noteContent: pendingRef.current.value })
    pendingRef.current = null
  }

  useEffect(() => flushSave, [])

  const handleTyping = (value: string): void => {
    setNoteContent(value)
    if (pendingRef.current) clearTimeout(pendingRef.current.timer)
    pendingRef.current = { value, timer: setTimeout(flushSave, SAVE_DELAY_MS) }
  }

  const commitContent = (value: string): void => {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer)
    pendingRef.current = null
    setNoteContent(value)
    onUpdate({ noteContent: value })
  }

  // A task sent to the agent is up for review once the agent stops working
  const wasWorkingRef = useRef(false)
  useEffect(() => {
    if (wasWorkingRef.current && !isWorking) {
      setSentTasks((prev) => Object.fromEntries(Object.keys(prev).map((text) => [text, 'review'])))
    }
    wasWorkingRef.current = isWorking
  }, [isWorking])

  const forgetSent = (text: string): void => {
    setSentTasks(({ [text]: _sent, ...rest }) => rest)
  }

  const sendText = (text: string): boolean => {
    if (!target) return false
    if (
      text.includes('\n') &&
      !terminalPool.pastesAsOneBlock(target.id) &&
      !confirm(`En "${target.title}" cada línea se ejecutará por separado. ¿Enviar de todas formas?`)
    ) {
      return false
    }
    return terminalPool.submitText(target.id, text)
  }

  const handleSendTask = (text: string): void => {
    if (sendText(text)) setSentTasks((prev) => ({ ...prev, [text]: 'running' }))
  }

  const readSelection = (): string => {
    const area = textareaRef.current
    if (area) return area.value.slice(area.selectionStart, area.selectionEnd)
    const selection = window.getSelection()
    return selection && bodyRef.current?.contains(selection.anchorNode) ? selection.toString() : ''
  }

  const handleSend = (): void => {
    const selected = readSelection()
    if (selected) {
      sendText(selected)
      return
    }
    const task = nextTask(noteContent, Object.keys(sentTasks))
    if (task) handleSendTask(task)
  }

  const handleCapture = (): void => {
    if (!target) return
    const output = terminalPool.readOutput(target.id, CAPTURE_LINES)
    if (output) commitContent(addCodeBlock(noteContent, output))
  }

  const handleTargetChange = (id: string): void => {
    setTargetId(id)
    if (unlinked.some((t) => t.id === id)) onLinkTerminal(id)
  }

  const handleTitleBlur = (): void => {
    setIsEditingTitle(false)
    const finalTitle = titleText.trim() || 'NOTAS'
    setTitleText(finalTitle)
    onUpdate({ title: finalTitle })
  }

  const handleCopyContent = async (): Promise<void> => {
    await window.neoAPI.writeClipboard(noteContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleCycleColor = (): void => {
    const order: NoteColor[] = ['emerald', 'amber', 'cyan', 'purple', 'zinc']
    const nextIdx = (order.indexOf(currentColor) + 1) % order.length
    onUpdate({ noteColor: order[nextIdx] })
  }

  const handleAddTask = (): void => {
    const text = newTask.trim()
    if (!text) return
    commitContent(addTask(noteContent, text))
    setNewTask('')
  }

  const renderBlock = (block: NoteBlock): React.ReactNode => {
    switch (block.kind) {
      case 'heading':
        return (
          <p key={block.line} className={`font-medium mt-2 mb-1 ${block.level === 1 ? 'text-white text-base' : 'text-zinc-100 text-sm'}`}>
            {renderInline(block.text)}
          </p>
        )
      case 'task': {
        const sent = sentTasks[block.text]
        return (
          <div key={block.line} className="group flex items-center gap-2 py-0.5 px-1 rounded-control hover:bg-zinc-900/60 transition-colors">
            <input
              type="checkbox"
              checked={block.checked}
              aria-label={block.text}
              onChange={() => {
                commitContent(toggleTask(noteContent, block.line))
                forgetSent(block.text)
              }}
              className="shrink-0 rounded-control border-zinc-700 bg-zinc-800 focus:ring-0 cursor-pointer"
            />
            <span className={`flex-1 min-w-0 break-words ${block.checked ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
              {renderInline(block.text)}
            </span>
            {sent && !block.checked && (
              <span className={`shrink-0 text-[10px] ${sent === 'running' ? 'text-signal animate-pulse' : 'text-zinc-100'}`}>
                {sent === 'running' ? 'en curso' : 'revisar'}
              </span>
            )}
            {!block.checked && (
              <button
                type="button"
                disabled={!canSend}
                onClick={() => handleSendTask(block.text)}
                title={target ? `Enviar a ${target.title}` : ''}
                className={hoverAction}
              >
                <Send size={11} className="pointer-events-none" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                commitContent(removeLine(noteContent, block.line))
                forgetSent(block.text)
              }}
              title="Borrar tarea"
              className={hoverAction}
            >
              <X size={11} className="pointer-events-none" />
            </button>
          </div>
        )
      }
      case 'bullet':
        return (
          <div key={block.line} className="flex gap-2 px-1 text-zinc-300">
            <span className="text-zinc-600">•</span>
            <span className="flex-1 min-w-0 break-words">{renderInline(block.text)}</span>
          </div>
        )
      case 'code':
        return (
          <div key={block.line} className="group relative my-1">
            <pre className="font-mono text-[11px] leading-relaxed text-zinc-200 bg-white/[0.04] border border-zinc-800 rounded-control p-2 overflow-x-auto">
              {block.text}
            </pre>
            <div className="absolute top-1 right-1 flex items-center gap-0.5">
              <button type="button" onClick={() => window.neoAPI.writeClipboard(block.text)} title="Copiar bloque" className={hoverAction}>
                <Copy size={11} className="pointer-events-none" />
              </button>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => sendText(block.text)}
                title={target ? `Enviar a ${target.title}` : ''}
                className={hoverAction}
              >
                <Send size={11} className="pointer-events-none" />
              </button>
            </div>
          </div>
        )
      case 'text':
        return <p key={block.line} className="text-zinc-400 px-1 break-words">{renderInline(block.text)}</p>
      case 'blank':
        return <div key={block.line} className="h-2" />
    }
  }

  const cardStyle: React.CSSProperties = {
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
      className={`canvas-card pointer-events-auto flex flex-col island overflow-hidden select-none transition-shadow ${
        isFocused ? `${styleConfig.border} ${styleConfig.glow}` : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      {/* Header Bar */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className={`h-9 px-2.5 ${styleConfig.bgHeader} border-b border-zinc-800 flex items-center justify-between cursor-move select-none shrink-0`}
      >
        {/* Left: Icon & Title */}
        <div className="flex items-center space-x-2 truncate">
          <div className="flex items-center justify-center w-4 h-4 rounded-control text-zinc-300">
            <FileText size={12} className={styleConfig.dot.replace('bg-', 'text-')} />
          </div>

          {isEditingTitle ? (
            <input
              type="text"
              value={titleText}
              autoFocus
              onChange={(e) => setTitleText(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
              className="bg-zinc-900 border border-zinc-700 rounded-control px-1 text-xs text-zinc-100 font-mono focus:outline-none"
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onMouseDown={(e) => {
                // The second click belongs to editing the title, not to the header
                if (e.detail > 1) e.stopPropagation()
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditingTitle(true)
              }}
              title="Doble clic para editar título"
              className="text-xs font-medium text-zinc-200 truncate cursor-text hover:text-white"
            >
              {card.title || 'NOTAS'}
            </span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              flushSave()
              setIsEditing((prev) => !prev)
            }}
            className={`px-1.5 py-0.5 rounded-control text-[10px] transition-colors cursor-pointer ${
              isEditing ? 'bg-white/10 text-zinc-100 border border-white/15' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80'
            }`}
            title={isEditing ? 'Ver la nota' : 'Editar el texto'}
          >
            {isEditing ? 'Vista' : 'Editar'}
          </button>

          <button
            type="button"
            onClick={handleCopyContent}
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            title="Copiar texto de la nota"
          >
            <span className="text-[10px]">{copied ? '✓' : '⧉'}</span>
          </button>

          <button
            type="button"
            onClick={handleCycleColor}
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            title={`Cambiar color (${styleConfig.tag})`}
          >
            <Palette size={12} className={`pointer-events-none ${styleConfig.dot.replace('bg-', 'text-')}`} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(card.id)}
            className="p-1.5 rounded-control text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
            title="Eliminar nota"
          >
            <Trash2 size={13} className="pointer-events-none" />
          </button>
        </div>
      </div>

      {progress.total > 0 && (
        <div className="h-0.5 bg-zinc-800/80 shrink-0" title={`${progress.done} de ${progress.total} tareas`}>
          <div className="h-full bg-signal transition-all duration-200" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}

      {/* Note Body */}
      <div
        ref={bodyRef}
        style={{ overscrollBehavior: 'contain' }}
        className={`flex-1 w-full p-2.5 bg-void flex flex-col min-h-0 select-text ${isFocused ? 'overflow-auto' : 'overflow-hidden'}`}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={noteContent}
            onChange={(e) => handleTyping(e.target.value)}
            onBlur={flushSave}
            placeholder="Escribe notas, tareas (- [ ]), comandos o recordatorios aquí..."
            className="w-full h-full bg-transparent text-zinc-200 font-mono text-xs leading-relaxed resize-none focus:outline-none placeholder-zinc-600 no-scrollbar"
            spellCheck={false}
          />
        ) : (
          <>
            <div className="flex-1 space-y-1 text-xs text-zinc-300 leading-relaxed">
              {noteContent.trim() ? (
                parseNote(noteContent).map(renderBlock)
              ) : (
                <p className="px-1 text-zinc-500">Añade tu primera tarea abajo, o pulsa Editar para escribir libremente.</p>
              )}
            </div>
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
              placeholder="Añadir tarea…"
              aria-label="Añadir tarea"
              className="mt-2 shrink-0 w-full bg-white/[0.04] border border-zinc-800 rounded-control px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:border-white/25 focus:outline-none"
            />
          </>
        )}
      </div>

      {/* Footer: the console this note talks to */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="h-7 pl-2.5 pr-4 bg-white/[0.04] border-t border-zinc-800/80 flex items-center gap-1.5 text-[10px] text-zinc-500 select-none shrink-0"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${target ? `bg-signal ${isWorking ? 'animate-pulse' : ''}` : styleConfig.dot}`} />
        <select
          value={target?.id ?? ''}
          disabled={terminals.length === 0}
          onChange={(e) => handleTargetChange(e.target.value)}
          aria-label="Consola conectada a esta nota"
          className="min-w-0 max-w-[45%] bg-void text-zinc-300 rounded-control text-[10px] focus:outline-none cursor-pointer disabled:cursor-default"
        >
          {!target && <option value="">{terminals.length ? 'Conectar a consola…' : 'Sin consolas'}</option>}
          {linked.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
          {target && unlinked.length > 0 && (
            <optgroup label="Conectar también">
              {unlinked.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </optgroup>
          )}
          {!target && unlinked.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        {target && <span className="shrink-0">{isWorking ? 'trabajando' : 'libre'}</span>}

        <span className="flex-1" />

        {target && (
          <>
            <button
              type="button"
              onClick={handleCapture}
              title="Traer aquí lo seleccionado en la consola, o sus últimas líneas"
              className="p-0.5 rounded-control text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ArrowDownToLine size={11} className="pointer-events-none" />
            </button>
            <button
              type="button"
              disabled={!canSend}
              // Keeps the text selection alive so the click can read it
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSend}
              title={isWorking ? 'Espera a que la consola quede libre' : 'Enviar lo seleccionado o, si no hay selección, la siguiente tarea'}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-control bg-signal hover:bg-signal/85 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 transition-colors cursor-pointer disabled:cursor-default"
            >
              <Send size={10} className="pointer-events-none" />
              <span>Enviar</span>
            </button>
          </>
        )}

        {progress.total > 0 && <span className="shrink-0 tabular-nums">{progress.done}/{progress.total}</span>}
      </div>

      <CardResizeHandles cardId={card.id} onResizeStart={onResizeStart} />
    </div>
  )
}
