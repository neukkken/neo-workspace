import React, { useState, useEffect } from 'react'
import {
  Activity,
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Maximize2,
  Minimize2,
  CheckCircle2,
  XCircle,
  ExternalLink
} from 'lucide-react'
import { CanvasCard } from '../types'

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
  const [isExpanded, setIsExpanded] = useState(false)

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
          ? 'border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/40'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-[#12151b] border-b border-zinc-800 flex items-center justify-between cursor-move shrink-0"
      >
        <div className="flex items-center space-x-2 truncate">
          <Activity size={14} className="text-emerald-400 shrink-0" />
          <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-100 uppercase truncate">
            {card.title || 'PORT MONITOR'}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">({ports.length} puertos)</span>
        </div>

        <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={checkAllPorts}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Escanear puertos ahora"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
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

      {/* Add Port Form */}
      <form
        onSubmit={handleAddPort}
        className="px-2.5 py-1.5 bg-[#090b0e] border-b border-zinc-800/80 flex items-center space-x-1.5 shrink-0"
      >
        <input
          type="number"
          min="1"
          max="65535"
          value={newPortInput}
          onChange={(e) => setNewPortInput(e.target.value)}
          placeholder="Ej: 3000, 5000..."
          className="flex-1 bg-[#14171e] border border-zinc-800 focus:border-emerald-500 focus:outline-none rounded px-2 py-0.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-mono transition-colors cursor-pointer"
        >
          <Plus size={11} />
          <span>Monitorear</span>
        </button>
      </form>

      {/* Ports List */}
      <div
        style={{ overscrollBehavior: 'contain' }}
        className={`flex-1 p-2 space-y-1.5 font-mono text-xs ${
          isFocused ? 'overflow-y-auto' : 'overflow-hidden pointer-events-none'
        }`}
      >
        {ports.map((port) => {
          const isOpen = statuses[port]
          const url = `http://localhost:${port}`

          return (
            <div
              key={port}
              className="flex items-center justify-between p-2 rounded bg-[#0e1117] border border-zinc-800/80 hover:border-zinc-700/80 transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOpen
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                      : 'bg-zinc-700'
                  }`}
                />
                <span className="font-semibold text-zinc-200 text-xs">:{port}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                    isOpen
                      ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20'
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
                      if (onOpenInBrowser) {
                        onOpenInBrowser(url)
                      } else {
                        window.open(url, '_blank')
                      }
                    }}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] transition-colors cursor-pointer"
                    title={`Abrir ${url}`}
                  >
                    <Globe size={10} />
                    <span>Abrir</span>
                  </button>
                )}
                <button
                  onClick={() => handleRemovePort(port)}
                  className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
      {!isExpanded && (
        <div
          onMouseDown={(e) => onResizeStart(e, card.id)}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-emerald-400"
        >
          <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
            <polygon points="6 0, 6 6, 0 6" />
          </svg>
        </div>
      )}
    </div>
  )
}
