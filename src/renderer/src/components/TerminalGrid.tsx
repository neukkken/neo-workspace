import React, { useState } from 'react'
import { PanelConfig, ProcessMetrics } from '../types'
import { TerminalPanel } from './TerminalPanel'

interface TerminalGridProps {
  panels: PanelConfig[]
  panelsMetrics: Record<string, ProcessMetrics>
  isActive?: boolean
}

export const TerminalGrid: React.FC<TerminalGridProps> = ({
  panels,
  panelsMetrics,
  isActive = true
}) => {
  const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null)

  const handleToggleMaximize = (panelId: string): void => {
    setMaximizedPanelId((prev) => (prev === panelId ? null : panelId))
  }

  if (panels.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 font-mono text-xs">
        <span>NO ACTIVE PANELS IN THIS WORKSPACE</span>
        <span className="text-[11px] text-zinc-600 mt-1">
          Click "Edit Workspace" to add terminal panels.
        </span>
      </div>
    )
  }

  // If one panel is maximized, show only that one
  if (maximizedPanelId) {
    const activePanel = panels.find((p) => p.id === maximizedPanelId)
    if (activePanel) {
      return (
        <div className="flex-1 p-2 h-full w-full min-h-0">
          <TerminalPanel
            panel={activePanel}
            metrics={panelsMetrics[activePanel.id]}
            isMaximized={true}
            isActive={isActive}
            onToggleMaximize={handleToggleMaximize}
          />
        </div>
      )
    }
  }

  // Layout classes depending on panel count
  const getGridClasses = (): string => {
    switch (panels.length) {
      case 1:
        return 'grid-cols-1 grid-rows-1'
      case 2:
        return 'grid-cols-1 md:grid-cols-2 grid-rows-1'
      case 3:
      case 4:
        return 'grid-cols-1 md:grid-cols-2 grid-rows-2'
      default:
        return 'grid-cols-1 md:grid-cols-3 grid-rows-2'
    }
  }

  return (
    <div className={`flex-1 grid gap-2 p-2 h-full w-full min-h-0 overflow-hidden ${getGridClasses()}`}>
      {panels.map((panel) => (
        <div key={panel.id} className="min-h-0 min-w-0 h-full w-full">
          <TerminalPanel
            panel={panel}
            metrics={panelsMetrics[panel.id]}
            isMaximized={false}
            isActive={isActive}
            onToggleMaximize={handleToggleMaximize}
          />
        </div>
      ))}
    </div>
  )
}
