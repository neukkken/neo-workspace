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

  // If one panel is maximized, keep all panels mounted but show the maximized one on top
  return (
    <div className="flex-1 relative h-full w-full min-h-0 overflow-hidden">
      {/* Grid container: visible when nothing is maximized */}
      <div
        className={`h-full w-full p-2 gap-2 ${
          maximizedPanelId ? 'hidden' : `grid ${getGridClasses()}`
        }`}
      >
        {panels.map((panel) => (
          <div key={panel.id} className="min-h-0 min-w-0 h-full w-full">
            <TerminalPanel
              panel={panel}
              metrics={panelsMetrics[panel.id]}
              isMaximized={false}
              isActive={isActive && !maximizedPanelId}
              onToggleMaximize={handleToggleMaximize}
            />
          </div>
        ))}
      </div>

      {/* Maximized container: when a panel is maximized, overlay it without unmounting other panels */}
      {maximizedPanelId && (
        <div className="absolute inset-0 z-20 p-2 h-full w-full min-h-0 bg-[#090a0d]">
          {panels.map((panel) => {
            const isThisMaximized = panel.id === maximizedPanelId
            return (
              <div
                key={panel.id}
                className={`h-full w-full min-h-0 ${isThisMaximized ? 'block' : 'hidden'}`}
              >
                <TerminalPanel
                  panel={panel}
                  metrics={panelsMetrics[panel.id]}
                  isMaximized={true}
                  isActive={isActive && isThisMaximized}
                  onToggleMaximize={handleToggleMaximize}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
