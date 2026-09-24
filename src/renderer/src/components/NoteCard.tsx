import React, { useState } from 'react'
import {
  FileText,
  Trash2,
  Maximize2,
  Minimize2,
  CheckSquare,
  Palette
} from 'lucide-react'
import { CanvasCard, NoteColor } from '../types'

interface NoteCardProps {
  card: CanvasCard
  isFocused: boolean
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
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

export const NoteCard: React.FC<NoteCardProps> = ({
  card,
  isFocused,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleText, setTitleText] = useState(card.title || 'NOTAS DEL PROYECTO')
  const [noteContent, setNoteContent] = useState(
    card.noteContent ||
      '### Sprint Notes & TODOs\n- [x] Configure backend endpoints\n- [ ] Test auth credentials\n- [ ] Verify database migration\n\n**API Ports:**\n- Frontend: 5173\n- Backend: 3000\n- Redis: 6379'
  )
  const currentColor: NoteColor = card.noteColor || 'emerald'
  const styleConfig = COLOR_VARIANTS[currentColor] || COLOR_VARIANTS.emerald

  const handleTitleBlur = (): void => {
    setIsEditingTitle(false)
    const finalTitle = titleText.trim() || 'NOTAS'
    setTitleText(finalTitle)
    onUpdate({ title: finalTitle })
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const val = e.target.value
    setNoteContent(val)
    onUpdate({ noteContent: val })
  }

  const handleAddCheckbox = (): void => {
    const updated = `${noteContent}\n- [ ] `
    setNoteContent(updated)
    onUpdate({ noteContent: updated })
  }

  const handleCycleColor = (): void => {
    const order: NoteColor[] = ['emerald', 'amber', 'cyan', 'purple', 'zinc']
    const nextIdx = (order.indexOf(currentColor) + 1) % order.length
    const nextColor = order[nextIdx]
    onUpdate({ noteColor: nextColor })
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
      style={cardStyle}
      onClick={onFocus}
      className={`flex flex-col bg-[#0d0f13] rounded-lg border shadow-xl overflow-hidden select-none transition-shadow ${
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
          <div className="flex items-center justify-center w-4 h-4 rounded text-zinc-300">
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
              className="bg-zinc-900 border border-zinc-700 rounded px-1 text-xs text-zinc-100 font-mono focus:outline-none"
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditingTitle(true)
              }}
              title="Doble clic para editar título"
              className="font-mono text-xs font-semibold text-zinc-200 truncate cursor-text hover:text-white"
            >
              {card.title || 'NOTAS'}
            </span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={handleCycleColor}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
            title={`Cambiar color (${styleConfig.tag})`}
          >
            <Palette size={12} className={styleConfig.dot.replace('bg-', 'text-')} />
          </button>

          <button
            onClick={handleAddCheckbox}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
            title="Añadir tarea (- [ ])"
          >
            <CheckSquare size={12} />
          </button>

          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
            title={isExpanded ? 'Restaurar tamaño' : 'Maximizar tarjeta'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>

          <button
            onClick={() => onDelete(card.id)}
            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
            title="Eliminar nota"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Note Body: Editable Textarea */}
      <div className="flex-1 w-full p-2.5 bg-[#090a0d] flex flex-col min-h-0 select-text">
        <textarea
          value={noteContent}
          onChange={handleContentChange}
          placeholder="Escribe notas, tareas (- [ ]), comandos o recordatorios aquí..."
          className="w-full h-full bg-transparent text-zinc-200 font-mono text-xs leading-relaxed resize-none focus:outline-none placeholder-zinc-600 no-scrollbar"
          spellCheck={false}
        />
      </div>

      {/* Footer bar with character count */}
      <div className="h-6 px-2.5 bg-[#0e1014] border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-500 select-none">
        <span className="flex items-center space-x-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${styleConfig.dot}`} />
          <span className="uppercase">{currentColor}</span>
        </span>
        <span>{noteContent.length} caracteres</span>
      </div>

      {/* Resize Handle */}
      {!isExpanded && (
        <div
          onMouseDown={(e) => onResizeStart(e, card.id)}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-emerald-400"
          title="Redimensionar tarjeta"
        >
          <svg className="w-2.5 h-2.5" viewBox="0 0 6 6">
            <path d="M6 6H5V5H6V6ZM6 4H5V3H6V4ZM4 6H3V5H4V6ZM6 2H5V1H6V2ZM2 6H1V5H2V6Z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  )
}
