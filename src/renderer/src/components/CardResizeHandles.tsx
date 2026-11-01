import React from 'react'
import { Edges } from '../utils/canvasGrid'

export type ResizeStart = (e: React.MouseEvent, id: string, edges: Edges) => void

const HANDLES: { edges: Edges; className: string }[] = [
  { edges: { top: true }, className: 'top-0 left-4 right-4 h-1.5 cursor-ns-resize' },
  { edges: { bottom: true }, className: 'bottom-0 left-4 right-4 h-1.5 cursor-ns-resize' },
  { edges: { left: true }, className: 'left-0 top-4 bottom-4 w-1.5 cursor-ew-resize' },
  { edges: { right: true }, className: 'right-0 top-4 bottom-4 w-1.5 cursor-ew-resize' },
  { edges: { top: true, left: true }, className: 'top-0 left-0 w-4 h-4 cursor-nwse-resize' },
  { edges: { top: true, right: true }, className: 'top-0 right-0 w-4 h-4 cursor-nesw-resize' },
  { edges: { bottom: true, left: true }, className: 'bottom-0 left-0 w-4 h-4 cursor-nesw-resize' },
  {
    edges: { bottom: true, right: true },
    className: 'bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-1 text-zinc-600 hover:text-zinc-100'
  }
]

export const CardResizeHandles: React.FC<{ cardId: string; onResizeStart: ResizeStart }> = ({ cardId, onResizeStart }) => (
  <>
    {HANDLES.map(({ edges, className }) => (
      <div
        key={className}
        onMouseDown={(e) => onResizeStart(e, cardId, edges)}
        className={`absolute z-20 ${className}`}
      >
        {edges.bottom && edges.right && (
          <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
            <polygon points="6 0, 6 6, 0 6" />
          </svg>
        )}
      </div>
    ))}
  </>
)
