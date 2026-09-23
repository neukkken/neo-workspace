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

  // Single mount map: each panel mounted exactly once.
  // When maximizedPanelId is active, the maximized panel expands to absolute inset-0 and others hide,
  // preventing double-mounting and keeping the DOM tree clean.
  return (
    <div className="flex-1 relative h-full w-full min-h-0 overflow-hidden p-2">
      <div
        className={`h-full w-full gap-2 ${
          maximizedPanelId ? 'relative' : `grid ${getGridClasses()}`
        }`}
      >
        {panels.map((panel) => {
          const isMax = panel.id === maximizedPanelId
          const isHidden = maximizedPanelId !== null && !isMax

          return (
            <div
              key={panel.id}
              className={
                maximizedPanelId
                  ? isMax
                    ? 'absolute inset-0 z-20 h-full w-full'
                    : 'hidden'
                  : 'min-h-0 min-w-0 h-full w-full'
              }
            >
              <TerminalPanel
                panel={panel}
                metrics={panelsMetrics[panel.id]}
                isMaximized={isMax}
                isActive={isActive && !isHidden}
                onToggleMaximize={handleToggleMaximize}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
