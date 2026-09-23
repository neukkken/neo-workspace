import React, { useState, useRef } from 'react'
import {
  Globe,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Move,
  Trash2,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { CanvasCard } from '../types'

interface BrowserCardProps {
  card: CanvasCard
  isFocused: boolean
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
}

export const BrowserCard: React.FC<BrowserCardProps> = ({
  card,
  isFocused,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart
}) => {
  const [inputUrl, setInputUrl] = useState(card.url || 'http://localhost:5173')
  const [currentUrl, setCurrentUrl] = useState(card.url || 'http://localhost:5173')
  const [key, setKey] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleNavigate = (e: React.FormEvent): void => {
    e.preventDefault()
    let formatted = inputUrl.trim()
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      if (formatted.startsWith('localhost:') || formatted.startsWith('127.0.0.1:')) {
        formatted = `http://${formatted}`
      } else {
        formatted = `https://${formatted}`
      }
    }
    setInputUrl(formatted)
    setCurrentUrl(formatted)
    onUpdate({ url: formatted })
  }

  const handleReload = (): void => {
    setKey((prev) => prev + 1)
  }

  const handleOpenExternal = (): void => {
    if (currentUrl) {
      window.open(currentUrl, '_blank')
    }
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
      className={`flex flex-col bg-[#0d0f14] rounded-lg border shadow-xl overflow-hidden select-none transition-shadow ${
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
          <Globe size={13} className="text-cyan-400 shrink-0" />
          <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-200 uppercase truncate">
            {card.title || 'WEB-BROWSER'}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={isExpanded ? 'Restore Size' : 'Expand Card'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Open in System Browser"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/20 transition-colors"
            title="Remove Browser Node"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Navigation Toolbar */}
      <div
        className="h-8 px-2 bg-[#090b0e] border-b border-zinc-800/80 flex items-center space-x-1.5 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleReload}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Reload Page"
        >
          <RotateCw size={11} />
        </button>

        <form onSubmit={handleNavigate} className="flex-1 min-w-0">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="http://localhost:5173"
            className="w-full bg-[#12151b] border border-zinc-800 focus:border-cyan-500/60 focus:outline-none rounded px-2 py-0.5 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 truncate"
          />
        </form>
      </div>

      {/* Web Content Iframe */}
      <div className="flex-1 w-full h-full relative min-h-0 bg-[#060709] overflow-hidden">
        <iframe
          ref={iframeRef}
          key={key}
          src={currentUrl}
          title={card.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          className="w-full h-full border-0 select-auto"
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
