import { Terminal, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { TerminalThemeName } from '../types'

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
  searchAddon: SearchAddon
  cleanup: () => void
  clear: () => void
  restart: () => void
  fit: () => void
  findNext: (query: string) => boolean
  findPrevious: (query: string) => boolean
  clearSearch: () => void
}

export const TERMINAL_THEMES: Record<TerminalThemeName, ITheme> = {
  matrix: {
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
  },
  dracula: {
    background: '#1e1f29',
    foreground: '#f8f8f2',
    cursor: '#50fa7b',
    cursorAccent: '#1e1f29',
    selectionBackground: 'rgba(189, 147, 249, 0.35)',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  },
  tokyo: {
    background: '#16161e',
    foreground: '#c0caf5',
    cursor: '#7aa2f7',
    cursorAccent: '#16161e',
    selectionBackground: 'rgba(122, 162, 247, 0.3)',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5'
  },
  monokai: {
    background: '#222328',
    foreground: '#fcfcfa',
    cursor: '#ffd866',
    cursorAccent: '#222328',
    selectionBackground: 'rgba(255, 216, 102, 0.25)',
    black: '#2d2a2e',
    red: '#ff6188',
    green: '#a9dc76',
    yellow: '#ffd866',
    blue: '#fc9867',
    magenta: '#ab9df2',
    cyan: '#78dce8',
    white: '#fcfcfa',
    brightBlack: '#727072',
    brightRed: '#ff6188',
    brightGreen: '#a9dc76',
    brightYellow: '#ffd866',
    brightBlue: '#fc9867',
    brightMagenta: '#ab9df2',
    brightCyan: '#78dce8',
    brightWhite: '#ffffff'
  },
  nord: {
    background: '#242933',
    foreground: '#eceff4',
    cursor: '#88c0d0',
    cursorAccent: '#242933',
    selectionBackground: 'rgba(136, 192, 208, 0.3)',
    black: '#2e3440',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4'
  }
}

class TerminalPool {
  private terminals = new Map<string, ManagedTerminal>()
  private currentTheme: TerminalThemeName = 'matrix'
  private currentFontSize = 12.5

  public setTheme(themeName: TerminalThemeName): void {
    this.currentTheme = themeName
    const theme = TERMINAL_THEMES[themeName] || TERMINAL_THEMES.matrix
    for (const managed of this.terminals.values()) {
      managed.term.options.theme = theme
    }
  }

  public setFontSize(fontSize: number): void {
    if (fontSize < 9 || fontSize > 24) return
    this.currentFontSize = fontSize
    for (const managed of this.terminals.values()) {
      managed.term.options.fontSize = fontSize
      managed.fit()
    }
  }

  public getOrCreateTerminal(panelId: string, config: TerminalSpawnConfig): ManagedTerminal {
    const existing = this.terminals.get(panelId)
    if (existing) {
      return existing
    }

    const container = document.createElement('div')
    container.className = 'w-full h-full select-text'
    container.style.width = '100%'
    container.style.height = '100%'

    const theme = TERMINAL_THEMES[this.currentTheme] || TERMINAL_THEMES.matrix

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, monospace",
      fontSize: this.currentFontSize,
      lineHeight: 1.25,
      scrollback: 5000,
      convertEol: true,
      theme
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

    // Load Fit Addon
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // Load Web Links Addon (opens URLs on click)
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank')
    })
    term.loadAddon(webLinksAddon)

    // Load Search Addon
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)

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

    const findNext = (query: string): boolean => {
      if (!query) return false
      return searchAddon.findNext(query, { caseSensitive: false, incremental: true })
    }

    const findPrevious = (query: string): boolean => {
      if (!query) return false
      return searchAddon.findPrevious(query, { caseSensitive: false })
    }

    const clearSearch = (): void => {
      searchAddon.clearDecorations()
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
      searchAddon,
      cleanup,
      clear,
      restart,
      fit,
      findNext,
      findPrevious,
      clearSearch
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
