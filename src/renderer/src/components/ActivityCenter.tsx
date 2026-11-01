import React, { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { AgentStatus } from '../types'
import { Tooltip } from './Tooltip'

interface ActivityCenterProps {
  events: AgentStatus[]
  onOpen: (status: AgentStatus) => void
}

const describe = (status: AgentStatus): string =>
  status.state === 'exited' ? `Se cerró con código ${status.exitCode}` : 'Terminó o espera tu respuesta'

export const ActivityCenter: React.FC<ActivityCenterProps> = ({ events, onOpen }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const unread = events.filter((e) => e.at > seenAt).length

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    window.addEventListener('mousedown', closeOutside)
    return () => window.removeEventListener('mousedown', closeOutside)
  }, [isOpen])

  return (
    <div ref={rootRef} className="relative">
      <Tooltip label="Actividad de los agentes">
        <button
          onClick={() => {
            setIsOpen((prev) => !prev)
            setSeenAt(Date.now())
          }}
          aria-label={unread > 0 ? `Actividad: ${unread} sin leer` : 'Actividad'}
          className="relative p-1.5 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
        >
          <Bell size={13} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-signal text-zinc-950 text-[9px] font-semibold leading-[14px] text-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Tooltip>

      {isOpen && (
        <div className="island absolute right-0 top-full mt-2.5 w-80 max-h-96 overflow-y-auto p-1.5 z-50 select-none">
          {events.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-400 text-center">Aún no hay actividad en esta sesión.</p>
          ) : (
            events.map((status) => (
              <button
                key={`${status.panelId}-${status.at}`}
                onClick={() => {
                  setIsOpen(false)
                  onOpen(status)
                }}
                className="w-full flex items-start justify-between gap-2 px-2 py-1.5 rounded-control text-left hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-100 truncate">
                    {status.title} · {status.workspaceName}
                  </span>
                  <span className="block text-[11px] text-zinc-400">{describe(status)}</span>
                </span>
                <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                  {new Date(status.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
