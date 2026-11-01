import React, { useState, useEffect } from 'react'
import {
  Activity,
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink
} from 'lucide-react'
import { CanvasCard } from '../types'
import { cleanUrl, openExternalUrl } from '../utils/url'

interface PortMonitorCardProps {
  card: CanvasCard
  isFocused: boolean
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
  onOpenInBrowser?: (url: string) => void
}

export const PortMonitorCard: React.FC<PortMonitorCardProps> = ({
  card,
  isFocused,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart,
  onOpenInBrowser
}) => {
  const [ports, setPorts] = useState<number[]>(
    card.monitoredPorts && card.monitoredPorts.length > 0
      ? card.monitoredPorts
      : [3000, 5173, 8000, 8080]
  )
  const [statuses, setStatuses] = useState<Record<number, boolean>>({})
  const [newPortInput, setNewPortInput] = useState('')
  const [checking, setChecking] = useState(false)

  const checkAllPorts = async (): Promise<void> => {
    setChecking(true)
    const results: Record<number, boolean> = {}
    await Promise.all(
      ports.map(async (p) => {
        try {
          const res = await window.neoAPI.checkPort(p)
          results[p] = res.isOpen
        } catch {
          results[p] = false
        }
      })
    )
    setStatuses(results)
    setChecking(false)
  }

  useEffect(() => {
    checkAllPorts()
    const interval = setInterval(checkAllPorts, 4000)
    return () => clearInterval(interval)
  }, [ports])

  const handleAddPort = (e: React.FormEvent): void => {
    e.preventDefault()
    const p = parseInt(newPortInput.trim(), 10)
    if (!isNaN(p) && p > 0 && p <= 65535 && !ports.includes(p)) {
      const nextPorts = [...ports, p].sort((a, b) => a - b)
      setPorts(nextPorts)
      onUpdate({ monitoredPorts: nextPorts })
      setNewPortInput('')
    }
  }

  const handleRemovePort = (portToRemove: number): void => {
    const nextPorts = ports.filter((p) => p !== portToRemove)
    setPorts(nextPorts)
    onUpdate({ monitoredPorts: nextPorts })
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
        isFocused
          ? 'border-white/40 shadow-[0_0_32px_-6px_rgb(var(--signal-rgb)/0.55)]'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-white/[0.04] border-b border-zinc-800 flex items-center justify-between cursor-move shrink-0"
      >
        <div className="flex items-center space-x-2 truncate">
          <Activity size={14} className="text-zinc-100 shrink-0" />
          <span className="text-[11px] stamp text-zinc-100 truncate">
            {card.title || 'PORT MONITOR'}
          </span>
          <span className="text-[10px] text-zinc-500">({ports.length} puertos)</span>
        </div>

        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              checkAllPorts()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Escanear puertos ahora"
          >
            <RefreshCw size={12} className={`pointer-events-none ${checking ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(card.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded-control text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
            title="Eliminar tarjeta"
          >
            <Trash2 size={13} className="pointer-events-none" />
          </button>
        </div>
      </div>

      {/* Add Port Form */}
      <form
        onSubmit={handleAddPort}
        className="px-2.5 py-1.5 bg-void border-b border-zinc-800/80 flex items-center space-x-1.5 shrink-0"
      >
        <input
          type="number"
          min="1"
          max="65535"
          value={newPortInput}
          onChange={(e) => setNewPortInput(e.target.value)}
          placeholder="Ej: 3000, 5000..."
          className="flex-1 bg-white/[0.04] border border-zinc-800 focus:border-white/40 focus:outline-none rounded-control px-2 py-0.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          className="flex items-center space-x-1 px-2.5 py-1 rounded-control bg-white/10 hover:bg-white/10 text-zinc-100 border border-white/15 text-xs transition-colors cursor-pointer"
        >
          <Plus size={11} />
          <span>Monitorear</span>
        </button>
      </form>

      {/* Ports List */}
      <div
        style={{ overscrollBehavior: 'contain' }}
        className={`flex-1 p-2 space-y-1.5 text-xs ${
          isFocused ? 'overflow-y-auto' : 'overflow-hidden pointer-events-none'
        }`}
      >
        {ports.map((port) => {
          const isOpen = statuses[port]
          const url = `http://localhost:${port}`

          return (
            <div
              key={port}
              className="flex items-center justify-between p-2 rounded-control bg-white/[0.04] border border-zinc-800/80 hover:border-zinc-700/80 transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOpen
                      ? 'bg-signal shadow-[0_0_8px_rgb(var(--signal-rgb)/0.8)] animate-pulse'
                      : 'bg-zinc-700'
                  }`}
                />
                <span className="font-medium text-zinc-200 text-xs">:{port}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-control font-medium ${
                    isOpen
                      ? 'text-zinc-100 bg-white/5 border border-white/15'
                      : 'text-zinc-500 bg-zinc-900 border border-zinc-800'
                  }`}
                >
                  {isOpen ? 'LISTENING / ONLINE' : 'CLOSED'}
                </span>
              </div>

              <div className="flex items-center space-x-1.5">
                {isOpen && (
                  <button
                    onClick={() => {
                      const target = cleanUrl(url)
                      if (onOpenInBrowser) {
                        onOpenInBrowser(target)
                      } else {
                        openExternalUrl(target)
                      }
                    }}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded-control bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/15 text-[10px] transition-colors cursor-pointer"
                    title={`Abrir ${cleanUrl(url)}`}
                  >
                    <Globe size={10} />
                    <span>Abrir</span>
                  </button>
                )}
                <button
                  onClick={() => handleRemovePort(port)}
                  className="p-1 rounded-control text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Dejar de monitorear"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={(e) => onResizeStart(e, card.id)}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-zinc-100"
      >
        <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
          <polygon points="6 0, 6 6, 0 6" />
        </svg>
      </div>
    </div>
  )
}
