import { RefObject, useEffect } from 'react'
import { AppState } from '../types'

export interface AppHandlers {
  selectWorkspace: (id: string) => void
  openPanel: (workspaceId: string, panelId: string) => void
  newWorkspace: () => void
  saveAll: () => Promise<void>
  restartWorkspace: (id: string) => Promise<void>
  toggleCommandPalette: () => void
  toggleShortcuts: () => void
  toggleSidebar: () => void
  closeModals: () => void
}

// Through refs: the listener is registered once, and the first render returns before the handlers exist
export const useGlobalShortcuts = (
  handlersRef: RefObject<AppHandlers | null>,
  appStateRef: RefObject<AppState | null>
): void => {
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable

      // Help modal with ? (Shift + /)
      if (!isInput && e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        handlersRef.current?.toggleShortcuts()
        return
      }

      // Escape closes open modals
      if (e.key === 'Escape') {
        handlersRef.current?.closeModals()
        return
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey

      // Ctrl + K or Ctrl + P: Command Palette
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        handlersRef.current?.toggleCommandPalette()
        return
      }

      // Ctrl + N: Create new workspace
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        handlersRef.current?.newWorkspace()
        return
      }

      // Ctrl + B: Toggle sidebar visibility
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        handlersRef.current?.toggleSidebar()
        return
      }

      // Ctrl + S: Save all workspaces
      if (isCtrlOrCmd && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        handlersRef.current?.saveAll()
        return
      }

      const current = appStateRef.current
      if (!current) return

      // Ctrl + Shift + R: Restart active workspace
      if (isCtrlOrCmd && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        if (current.activeWorkspaceId) {
          handlersRef.current?.restartWorkspace(current.activeWorkspaceId)
        }
        return
      }

      // Ctrl + 1..9: Quick switch workspaces
      if (isCtrlOrCmd && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1
        if (current.workspaces[index]) {
          e.preventDefault()
          handlersRef.current?.selectWorkspace(current.workspaces[index].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [handlersRef, appStateRef])
}
