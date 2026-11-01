import React, { useEffect } from 'react'
import { BellRing, X } from 'lucide-react'
import { AgentStatus } from '../types'

const VISIBLE_MS = 12000

interface AgentToastProps {
  status: AgentStatus
  onOpen: (status: AgentStatus) => void
  onDismiss: (panelId: string) => void
}

const AgentToast: React.FC<AgentToastProps> = ({ status, onOpen, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(status.panelId), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [status.at, status.panelId, onDismiss])

  return (
    <div className="island flex items-start gap-2.5 p-3 text-xs select-none animate-in slide-in-from-bottom-5 duration-200">
      <BellRing size={14} className="text-signal shrink-0 mt-0.5" />
      <button onClick={() => onOpen(status)} className="flex-1 min-w-0 text-left cursor-pointer">
        <span className="block font-medium text-zinc-100 truncate">
          {status.title} · {status.workspaceName}
        </span>
        <span className="block text-[11px] text-zinc-400">
          {status.state === 'exited'
            ? `Se cerró con código ${status.exitCode}`
            : 'Terminó o espera tu respuesta'}
        </span>
      </button>
      <button
        onClick={() => onDismiss(status.panelId)}
        title="Descartar aviso"
        className="p-0.5 rounded-control text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
      >
        <X size={13} />
      </button>
    </div>
  )
}

interface AgentToastsProps {
  toasts: AgentStatus[]
  onOpen: (status: AgentStatus) => void
  onDismiss: (panelId: string) => void
}

export const AgentToasts: React.FC<AgentToastsProps> = ({ toasts, onOpen, onDismiss }) => {
  if (toasts.length === 0) return null
  return (
    <div role="status" className="fixed top-24 right-4 z-50 w-72 flex flex-col gap-1.5">
      {toasts.map((status) => (
        <AgentToast key={status.panelId} status={status} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
