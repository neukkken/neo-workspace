import React, { useState, useRef } from 'react'
import {
  Globe,
  RotateCw,
  ExternalLink,
  Trash2,
  Maximize2,
  Minimize2,
  Smartphone,
  Tablet,
  Monitor
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

type ViewportMode = 'full' | 'tablet' | 'mobile'

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
  const [viewport, setViewport] = useState<ViewportMode>('full')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleNavigate = (e?: React.FormEvent): void => {
    if (e) e.preventDefault()
    let formatted = inputUrl.trim()
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      if (
        formatted.startsWith('localhost:') ||
        formatted.startsWith('127.0.0.1:') ||
        formatted.startsWith(':')
      ) {
        if (formatted.startsWith(':')) formatted = `localhost${formatted}`
        formatted = `http://${formatted}`
      } else {
        formatted = `https://${formatted}`
      }
    }
    setInputUrl(formatted)
    setCurrentUrl(formatted)
    onUpdate({ url: formatted })
  }

  const handleQuickPort = (port: number): void => {
    const url = `http://localhost:${port}`
    setInputUrl(url)
    setCurrentUrl(url)
    onUpdate({ url })
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

  const getViewportWidth = (): string => {
    switch (viewport) {
      case 'mobile':
        return '375px'
      case 'tablet':
        return '768px'
      default:
        return '100%'
    }
  }

  return (
    <div
      style={cardStyle}
      onClick={onFocus}
      className={`flex flex-col bg-[#0d0f14] rounded-lg border shadow-xl overflow-hidden select-none transition-shadow ${
        isFocused
          ? 'border-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/40'
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
          {/* Responsive viewport controls */}
          <div className="flex items-center space-x-0.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded mr-1">
            <button
              onClick={() => setViewport('full')}
              className={`p-1 rounded transition-colors ${
                viewport === 'full' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Resolución Completa (100%)"
            >
              <Monitor size={11} />
            </button>
            <button
              onClick={() => setViewport('tablet')}
              className={`p-1 rounded transition-colors ${
                viewport === 'tablet' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Vista Tablet (768px)"
            >
              <Tablet size={11} />
            </button>
            <button
              onClick={() => setViewport('mobile')}
              className={`p-1 rounded transition-colors ${
                viewport === 'mobile' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Vista Móvil (375px)"
            >
              <Smartphone size={11} />
            </button>
          </div>

          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={isExpanded ? 'Restaurar tamaño' : 'Maximizar tarjeta'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Abrir en navegador externo"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
            title="Eliminar nodo de navegador"
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
          title="Recargar página"
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

        {/* Quick Ports */}
        <div className="hidden sm:flex items-center space-x-1 text-[10px] font-mono text-zinc-500">
          {[5173, 3000, 8080, 8000].map((port) => (
            <button
              key={port}
              onClick={() => handleQuickPort(port)}
              className="px-1 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 hover:text-cyan-400 text-zinc-400 border border-zinc-800/80 transition-colors"
            >
              :{port}
            </button>
          ))}
        </div>
      </div>

      {/* Web Content Iframe Container */}
      <div className="flex-1 w-full h-full relative min-h-0 bg-[#060709] overflow-auto flex justify-center">
        <div
          style={{ width: getViewportWidth(), height: '100%' }}
          className={`h-full transition-all duration-200 ${
            viewport !== 'full' ? 'border-x border-zinc-800/60 shadow-2xl' : ''
          }`}
        >
          <iframe
            ref={iframeRef}
            key={key}
            src={currentUrl}
            title={card.title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            className="w-full h-full border-0 select-auto"
          />
        </div>
      </div>

      {/* Resize Handle (Bottom Right) */}
      {!isExpanded && (
        <div
          onMouseDown={(e) => onResizeStart(e, card.id)}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-cyan-400"
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
