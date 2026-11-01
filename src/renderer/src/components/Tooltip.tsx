import React, { useState } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  label: string
  side?: 'top' | 'bottom'
  children: React.ReactNode
}

// Portaled so overflow containers and drag regions can't clip it
export const Tooltip: React.FC<TooltipProps> = ({ label, side = 'bottom', children }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const show = (e: React.MouseEvent<HTMLSpanElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: side === 'bottom' ? r.bottom + 6 : r.top - 6 })
  }

  return (
    <>
      <span className="inline-flex" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: side === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
              zIndex: 99998
            }}
            className="pointer-events-none whitespace-nowrap rounded-button bg-void border border-zinc-700/80 px-2 py-1 text-[11px] text-zinc-100 select-none"
          >
            {label}
          </div>,
          document.body
        )}
    </>
  )
}
