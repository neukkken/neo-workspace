import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

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

export const XTermView = forwardRef<XTermViewHandle, XTermViewProps>(
  ({ panelId, cwd, command, autoStart, isActive = true }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)

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

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current)

      termRef.current = term
      fitAddonRef.current = fitAddon

      // Initial fit & spawn
      setTimeout(() => {
        try {
          fitAddon.fit()
          spawnPty(term.cols, term.rows)
        } catch (e) {
          console.error('Initial terminal fit error:', e)
          spawnPty(80, 24)
        }
      }, 50)

      // Terminal user typing
      const onDataDisposable = term.onData((data) => {
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
        className="w-full h-full overflow-hidden bg-[#090a0d]"
        style={{ padding: '2px 4px' }}
      />
    )
  }
)

XTermView.displayName = 'XTermView'
