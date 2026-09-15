import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback
} from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Copy, Clipboard, CheckSquare, Eraser } from 'lucide-react'

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
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

    const spawnPty = (cols = 80, rows = 24): void => {
      window.neoAPI.spawnTerminal({
        panelId,
        cwd,
        command: autoStart ? command : '',
        cols,
        rows
      })
    }

    useImperativeHandle(ref, () => ({
      clear: () => {
        termRef.current?.clear()
      },
      restart: () => {
        termRef.current?.clear()
        const cols = termRef.current?.cols || 80
        const rows = termRef.current?.rows || 24
        spawnPty(cols, rows)
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
      if (termRef.current && termRef.current.hasSelection()) {
        const selection = termRef.current.getSelection()
        if (selection) {
          await window.neoAPI.writeClipboard(selection)
        }
      }
      closeContextMenu()
    }

    const handlePaste = async (): Promise<void> => {
      const text = await window.neoAPI.readClipboard()
      if (text && termRef.current) {
        termRef.current.paste(text)
      }
      closeContextMenu()
    }

    const handleSelectAll = (): void => {
      termRef.current?.selectAll()
      closeContextMenu()
    }

    const handleClearTerminal = (): void => {
      termRef.current?.clear()
      closeContextMenu()
    }

    const handleContextMenu = (e: React.MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      const hasSelection = termRef.current?.hasSelection() ?? false
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection
      })
    }

    useEffect(() => {
      if (!containerRef.current) return

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, monospace",
        fontSize: 12.5,
        lineHeight: 1.25,
        scrollback: 5000,
        convertEol: true,
        theme: {
          background: '#090a0d',
          foreground: '#e2e8f0',
          cursor: '#10b981',
          cursorAccent: '#090a0d',
          selectionBackground: 'rgba(56, 189, 248, 0.3)',
          black: '#181a1f',
          red: '#f43f5e',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#38bdf8',
          magenta: '#c084fc',
          cyan: '#2dd4bf',
          white: '#f1f5f9',
          brightBlack: '#71717a',
          brightRed: '#fb7185',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#d8b4fe',
          brightCyan: '#5eead4',
          brightWhite: '#ffffff'
        }
      })

      // Attach custom key event handler for smart copy / paste
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.type !== 'keydown') {
          return true
        }

        const isCtrlOrCmd = event.ctrlKey || event.metaKey

        // 1. Copy: Ctrl + Shift + C OR (Ctrl + C when text is selected)
        if (isCtrlOrCmd && (event.key === 'c' || event.key === 'C')) {
          if (event.shiftKey || term.hasSelection()) {
            const selection = term.getSelection()
            if (selection) {
              window.neoAPI.writeClipboard(selection)
              return false // Do NOT send \x03 to shell!
            }
          }
          // No selection and not Shift -> allow default Ctrl+C (SIGINT)
          return true
        }

        // 2. Paste with Ctrl + Shift + V (terminal shortcut)
        if (isCtrlOrCmd && event.shiftKey && (event.key === 'v' || event.key === 'V')) {
          event.preventDefault()
          window.neoAPI.readClipboard().then((text) => {
            if (text && termRef.current) {
              termRef.current.paste(text)
            }
          })
          return false
        }

        // 3. Select All: Ctrl + Shift + A
        if (isCtrlOrCmd && event.shiftKey && (event.key === 'a' || event.key === 'A')) {
          term.selectAll()
          return false
        }

        // Standard Ctrl + V is handled natively by the browser's DOM paste event and xterm
        return true
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current)

      termRef.current = term
      fitAddonRef.current = fitAddon

      // Initial fit & spawn
      const spawnTimer = setTimeout(() => {
        try {
          fitAddon.fit()
          spawnPty(term.cols, term.rows)
        } catch (e) {
          console.error('Initial terminal fit error:', e)
          spawnPty(80, 24)
        }
        if (isActive) {
          term.focus()
        }
      }, 50)

      // Terminal user typing & pasting with de-duplication guard
      let lastPasteData = ''
      let lastPasteTime = 0

      const onDataDisposable = term.onData((data) => {
        if (data.length > 1) {
          const now = Date.now()
          if (data === lastPasteData && now - lastPasteTime < 120) {
            return
          }
          lastPasteData = data
          lastPasteTime = now
        }
        window.neoAPI.writeTerminal(panelId, data)
      })

      // IPC listener for incoming output from PTY
      const unsubscribeData = window.neoAPI.onTerminalData(panelId, (data) => {
        term.write(data)
      })

      // IPC listener for process exit
      const unsubscribeExit = window.neoAPI.onTerminalExit(panelId, ({ code }) => {
        term.write(`\r\n\x1b[90m[Process ended with code ${code}]\x1b[0m\r\n`)
      })

      // Auto resize on container dimension change
      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          try {
            if (
              containerRef.current &&
              containerRef.current.clientWidth > 40 &&
              containerRef.current.clientHeight > 40
            ) {
              fitAddon.fit()
              if (term.cols > 0 && term.rows > 0) {
                window.neoAPI.resizeTerminal(panelId, term.cols, term.rows)
              }
            }
          } catch {
            // Container might be hidden
          }
        })
      })

      resizeObserver.observe(containerRef.current)

      return () => {
        clearTimeout(spawnTimer)
        resizeObserver.disconnect()
        onDataDisposable.dispose()
        unsubscribeData()
        unsubscribeExit()
        window.neoAPI.killTerminal(panelId)
        term.dispose()
      }
    }, [panelId, cwd, command, autoStart])

    // Re-fit terminal when workspace becomes active again
    useEffect(() => {
      if (isActive && termRef.current && fitAddonRef.current && containerRef.current) {
        const timer = setTimeout(() => {
          if (
            containerRef.current &&
            containerRef.current.clientWidth > 40 &&
            containerRef.current.clientHeight > 40
          ) {
            try {
              fitAddonRef.current?.fit()
              if (termRef.current) {
                window.neoAPI.resizeTerminal(
                  panelId,
                  termRef.current.cols,
                  termRef.current.rows
                )
                termRef.current.focus()
              }
            } catch (e) {
              console.error('Error fitting terminal on resume:', e)
            }
          }
        }, 60)
        return () => clearTimeout(timer)
      }
      return undefined
    }, [isActive, panelId])

    return (
      <div
        ref={containerRef}
        onClick={() => termRef.current?.focus()}
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
