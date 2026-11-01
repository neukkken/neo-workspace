import { useCallback, useEffect, useState } from 'react'
import { AgentStatus } from '../types'

const ACTIVITY_LIMIT = 30

interface AgentActivityState {
  agentStatuses: Record<string, AgentStatus>
  attentionWorkspaceIds: string[]
  agentToasts: AgentStatus[]
  activityLog: AgentStatus[]
  dismissAgentToast: (panelId: string) => void
  clearAttention: (workspaceId: string) => void
}

// Agent runs across every workspace; finished ones elsewhere ask for attention.
// `onOpenPanel` is kept from the first render, so it must not close over state
export const useAgentActivity = (onOpenPanel: (workspaceId: string, panelId: string) => void): AgentActivityState => {
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({})
  const [attentionWorkspaceIds, setAttentionWorkspaceIds] = useState<string[]>([])
  const [agentToasts, setAgentToasts] = useState<AgentStatus[]>([])
  const [activityLog, setActivityLog] = useState<AgentStatus[]>([])

  useEffect(() => {
    const unsubscribeStatus = window.neoAPI.onAgentStatus((status) => {
      setAgentStatuses((prev) => {
        const { [status.panelId]: _previous, ...rest } = prev
        return status.state === 'stopped' ? rest : { ...rest, [status.panelId]: status }
      })
      setAgentToasts((prev) => {
        const others = prev.filter((t) => t.panelId !== status.panelId)
        return status.notify ? [...others, status].slice(-4) : others
      })
      if (status.log) setActivityLog((prev) => [status, ...prev].slice(0, ACTIVITY_LIMIT))
      if (status.notify) {
        setAttentionWorkspaceIds((prev) =>
          prev.includes(status.workspaceId) ? prev : [...prev, status.workspaceId]
        )
      }
    })
    const unsubscribeOpen = window.neoAPI.onAgentOpen(({ workspaceId, panelId }) => {
      onOpenPanel(workspaceId, panelId)
    })
    return () => {
      unsubscribeStatus()
      unsubscribeOpen()
    }
  }, [])

  const dismissAgentToast = useCallback((panelId: string): void => {
    setAgentToasts((prev) => prev.filter((t) => t.panelId !== panelId))
  }, [])

  const clearAttention = useCallback((workspaceId: string): void => {
    setAttentionWorkspaceIds((prev) => prev.filter((id) => id !== workspaceId))
    setAgentToasts((prev) => prev.filter((t) => t.workspaceId !== workspaceId))
  }, [])

  return { agentStatuses, attentionWorkspaceIds, agentToasts, activityLog, dismissAgentToast, clearAttention }
}
