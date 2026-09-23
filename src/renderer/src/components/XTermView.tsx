import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback
} from 'react'
import { Copy, Clipboard, CheckSquare, Eraser } from 'lucide-react'
import { terminalPool, ManagedTerminal } from '../services/terminal-pool'

export interface XTermViewHandle {
  clear: () => void
  restart: () => void
}

interface XTermViewProps {
  panelId: string
  cwd: string
  command: string
  autoStart: boolean
  isActive?: boolean
}

interface ContextMenuState {
  x: number
  y: number
  hasSelection: boolean
}

export const XTermView = forwardRef<XTermViewHandle, XTermViewProps>(
  ({ panelId, cwd, command, autoStart, isActive = true }, ref) => {
    const slotRef = useRef<HTMLDivElement>(null)
    const managedRef = useRef<ManagedTerminal | null>(null)
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

    useImperativeHandle(ref, () => ({
      clear: () => {
        managedRef.current?.clear()
      },
      restart: () => {
        managedRef.current?.restart()
      }
    }))

    // Close context menu on outside click or escape
    const closeContextMenu = useCallback(() => {
      setContextMenu(null)
    }, [])

    useEffect(() => {
      if (!contextMenu) return

      const handleClickOutside = (): void => {
        closeContextMenu()
      }

      const handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          closeContextMenu()
        }
      }

      window.addEventListener('click', handleClickOutside)
      window.addEventListener('keydown', handleKeyDown)
      return () => {
        window.removeEventListener('click', handleClickOutside)
        window.removeEventListener('keydown', handleKeyDown)
      }
    }, [contextMenu, closeContextMenu])

    const handleCopy = async (): Promise<void> => {
      const term = managedRef.current?.term
      if (term && term.hasSelection()) {
        const selection = term.getSelection()
        if (selection) {
          await window.neoAPI.writeClipboard(selection)
        }
      }
      closeContextMenu()
    }

    const handlePaste = async (): Promise<void> => {
      const text = await window.neoAPI.readClipboard()
      if (text && managedRef.current?.term) {
        managedRef.current.term.paste(text)
      }
      closeContextMenu()
    }

    const handleSelectAll = (): void => {
      managedRef.current?.term.selectAll()
      closeContextMenu()
    }

    const handleClearTerminal = (): void => {
      managedRef.current?.clear()
      closeContextMenu()
    }

    const handleContextMenu = (e: React.MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      const hasSelection = managedRef.current?.term.hasSelection() ?? false
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection
      })
    }

    // Attach persistent terminal container to this slot
    useEffect(() => {
      if (!slotRef.current) return

      const managed = terminalPool.getOrCreateTerminal(panelId, {
        cwd,
        command,
        autoStart
      })
      managedRef.current = managed

      const slot = slotRef.current

      // Append persistent container to current DOM slot
      slot.appendChild(managed.container)

      // Fit terminal to dimensions
      const timer = setTimeout(() => {
        managed.fit()
        if (isActive) {
          managed.term.focus()
        }
      }, 50)

      // ResizeObserver to adapt terminal dimensions when slot resizes
      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (slot && slot.clientWidth > 40 && slot.clientHeight > 40) {
            managed.fit()
          }
        })
      })

      resizeObserver.observe(slot)

      return () => {
        clearTimeout(timer)
        resizeObserver.disconnect()
        // Detach element from this slot when unmounting or switching view
        // Crucial: we do NOT destroy or kill the terminal here!
        if (managed.container.parentNode === slot) {
          slot.removeChild(managed.container)
        }
      }
    }, [panelId, cwd, command, autoStart])

    // Re-fit and focus when active state changes
    useEffect(() => {
      if (isActive && managedRef.current && slotRef.current) {
        const timer = setTimeout(() => {
          managedRef.current?.fit()
          managedRef.current?.term.focus()
        }, 60)
        return () => clearTimeout(timer)
      }
      return undefined
    }, [isActive, panelId])

    return (
      <div
        ref={slotRef}
        onClick={() => managedRef.current?.term.focus()}
        onContextMenu={handleContextMenu}
        className="w-full h-full overflow-hidden bg-[#090a0d] relative select-text cursor-text"
        style={{ padding: '2px 4px' }}
      >
        {/* Floating Context Menu */}
        {contextMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${Math.min(contextMenu.y, window.innerHeight - 180)}px`,
              left: `${Math.min(contextMenu.x, window.innerWidth - 220)}px`,
              zIndex: 9999
            }}
            className="w-52 bg-[#121418] border border-zinc-700/80 rounded-md shadow-2xl py-1 text-xs font-mono text-zinc-300 animate-in fade-in zoom-in-95 duration-100 select-none"
          >
            <button
              onClick={handleCopy}
              disabled={!contextMenu.hasSelection}
              className={`w-full flex items-center justify-between px-3 py-1.5 transition-colors ${
                contextMenu.hasSelection
                  ? 'hover:bg-zinc-800 text-zinc-200 hover:text-white cursor-pointer'
                  : 'text-zinc-600 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Copy size={13} className={contextMenu.hasSelection ? 'text-emerald-400' : 'text-zinc-600'} />
                <span>Copiar</span>
              </div>
              <span className="text-[10px] text-zinc-500">Ctrl+Shift+C</span>
            </button>

            <button
              onClick={handlePaste}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 hover:text-white cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Clipboard size={13} className="text-zinc-400" />
                <span>Pegar</span>
              </div>
              <span className="text-[10px] text-zinc-500">Ctrl+Shift+V</span>
            </button>

            <div className="h-px bg-zinc-800 my-1" />

            <button
              onClick={handleSelectAll}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-2">
                <CheckSquare size={13} className="text-zinc-400" />
                <span>Seleccionar Todo</span>
              </div>
              <span className="text-[10px] text-zinc-500">Ctrl+Shift+A</span>
            </button>

            <button
              onClick={handleClearTerminal}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Eraser size={13} className="text-zinc-400" />
                <span>Limpiar Consola</span>
              </div>
            </button>
          </div>
        )}
      </div>
    )
  }
)

XTermView.displayName = 'XTermView'
