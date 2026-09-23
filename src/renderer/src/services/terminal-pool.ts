import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

export interface TerminalSpawnConfig {
  cwd: string
  command?: string
  autoStart?: boolean
}

export interface ManagedTerminal {
  panelId: string
  container: HTMLDivElement
  term: Terminal
  fitAddon: FitAddon
  cleanup: () => void
  clear: () => void
  restart: () => void
  fit: () => void
}

class TerminalPool {
  private terminals = new Map<string, ManagedTerminal>()

  public getOrCreateTerminal(panelId: string, config: TerminalSpawnConfig): ManagedTerminal {
    const existing = this.terminals.get(panelId)
    if (existing) {
      return existing
    }

    const container = document.createElement('div')
    container.className = 'w-full h-full select-text'
    container.style.width = '100%'
    container.style.height = '100%'

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

    // Custom key event handler for smart copy / paste
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== 'keydown') {
        return true
      }

      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      // Ctrl + Shift + C: Copy selection
      if (isCtrlOrCmd && event.shiftKey && (event.key === 'c' || event.key === 'C')) {
        if (term.hasSelection()) {
          const selection = term.getSelection()
          if (selection) {
            window.neoAPI.writeClipboard(selection)
          }
        }
        return false
      }

      // Ctrl + Shift + V: Paste from native clipboard
      if (isCtrlOrCmd && event.shiftKey && (event.key === 'v' || event.key === 'V')) {
        window.neoAPI.readClipboard().then((text) => {
          if (text) {
            term.paste(text)
          }
        })
        return false
      }

      // Ctrl + Shift + A: Select all
      if (isCtrlOrCmd && event.shiftKey && (event.key === 'a' || event.key === 'A')) {
        term.selectAll()
        return false
      }

      return true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    const fit = (): void => {
      try {
        if (container.clientWidth > 40 && container.clientHeight > 40) {
          fitAddon.fit()
          if (term.cols > 0 && term.rows > 0) {
            window.neoAPI.resizeTerminal(panelId, term.cols, term.rows)
          }
        }
      } catch {
        // Container might be detached or hidden
      }
    }

    const spawnPty = (cols = 80, rows = 24): void => {
      window.neoAPI.spawnTerminal({
        panelId,
        cwd: config.cwd,
        command: config.autoStart ? (config.command || '') : '',
        cols,
        rows
      })
    }

    // Subscribe to IPC data and exit
    const onDataDisposable = term.onData((data) => {
      window.neoAPI.writeTerminal(panelId, data)
    })

    const unsubscribeData = window.neoAPI.onTerminalData(panelId, (data) => {
      term.write(data)
    })

    const unsubscribeExit = window.neoAPI.onTerminalExit(panelId, ({ code }) => {
      term.writeln(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m\r\n`)
    })

    // Spawn process after small tick for sizing
    const cols = term.cols || 80
    const rows = term.rows || 24
    spawnPty(cols, rows)

    const clear = (): void => {
      term.clear()
    }

    const restart = (): void => {
      term.clear()
      const c = term.cols || 80
      const r = term.rows || 24
      spawnPty(c, r)
    }

    const cleanup = (): void => {
      onDataDisposable.dispose()
      unsubscribeData()
      unsubscribeExit()
      window.neoAPI.killTerminal(panelId)
      term.dispose()
      if (container.parentNode) {
        container.parentNode.removeChild(container)
      }
    }

    const managed: ManagedTerminal = {
      panelId,
      container,
      term,
      fitAddon,
      cleanup,
      clear,
      restart,
      fit
    }

    this.terminals.set(panelId, managed)
    return managed
  }

  public getTerminal(panelId: string): ManagedTerminal | undefined {
    return this.terminals.get(panelId)
  }

  public destroyTerminal(panelId: string): void {
    const existing = this.terminals.get(panelId)
    if (existing) {
      existing.cleanup()
      this.terminals.delete(panelId)
    }
  }

  public destroyAll(): void {
    for (const managed of this.terminals.values()) {
      managed.cleanup()
    }
    this.terminals.clear()
  }
}

export const terminalPool = new TerminalPool()
