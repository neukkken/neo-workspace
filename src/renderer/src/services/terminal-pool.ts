import { Terminal, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { TerminalThemeName } from '../types'
import { cleanUrl, openExternalUrl } from '../utils/url'

export interface TerminalSpawnConfig {
  cwd: string
  command?: string
  commands?: string[]
  autoStart?: boolean
  env?: Record<string, string>
}

export interface ManagedTerminal {
  panelId: string
  container: HTMLDivElement
  term: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  config: TerminalSpawnConfig
  cleanup: () => void
  clear: () => void
  restart: (newConfig?: TerminalSpawnConfig) => void
  updateConfig: (newConfig: Partial<TerminalSpawnConfig>) => void
  fit: () => void
  findNext: (query: string) => boolean
  findPrevious: (query: string) => boolean
  clearSearch: () => void
  getBufferText: () => string
  lastDetectedUrl?: string
  onUrlDetected: (cb: (url: string) => void) => () => void
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

export function isAgyTerminal(_panelId: string, term: Terminal): boolean {
  try {
    const buffer = term.buffer.active
    const totalRows = term.rows || buffer.length
    const rowsToCheck = Math.min(8, totalRows)
    for (let r = 0; r < rowsToCheck; r++) {
      const line = buffer.getLine(totalRows - 1 - r)?.translateToString() || ''
      if (
        line.includes('shortcuts') ||
        line.includes('media attached') ||
        line.includes('ctrl+o to expand') ||
        line.includes('Antigravity CLI')
      ) {
        return true
      }
    }
  } catch {}

  return false
}

class TerminalPool {
  private terminals = new Map<string, ManagedTerminal>()
  private currentTheme: TerminalThemeName = 'matrix'
  private currentFontSize = 13

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

  public refreshAllMetrics(): void {
    for (const managed of this.terminals.values()) {
      try {
        const core = (managed.term as any)._core
        if (core && core._charSizeService) {
          core._charSizeService.measure()
        }
        if (core && core._renderService) {
          core._renderService.clear()
        }
        managed.fit()
        managed.term.refresh(0, managed.term.rows - 1)
      } catch {
        // Container might be detached
      }
    }
  }

  public getOrCreateTerminal(panelId: string, initialConfig: TerminalSpawnConfig): ManagedTerminal {
    let config = { ...initialConfig }
    const existing = this.terminals.get(panelId)
    if (existing) {
      existing.updateConfig(initialConfig)
      return existing
    }

    const container = document.createElement('div')
    container.className = 'w-full h-full select-text terminal-container'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.overflow = 'hidden'
    container.style.boxSizing = 'border-box'
    container.addEventListener('scroll', () => {
      if (container.scrollTop !== 0) container.scrollTop = 0
      if (container.scrollLeft !== 0) container.scrollLeft = 0
    }, { passive: true })

    const theme = TERMINAL_THEMES[this.currentTheme] || TERMINAL_THEMES.matrix

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Liberation Mono', 'Noto Sans Mono', 'DejaVu Sans Mono', monospace",
      fontSize: this.currentFontSize,
      lineHeight: 1.0,
      letterSpacing: 0,
      rescaleOverlappingGlyphs: true,
      allowTransparency: true,
      scrollback: 5000,
      // IMPORTANT: When connected to node-pty, convertEol MUST be false.
      // node-pty handles ONLCR (\n -> \r\n) for normal shells. If convertEol is true,
      // raw-mode interactive TUIs (like Bubbletea / Lipgloss / AGY / vim) have their \n
      // forced to column 0, causing text and link overwriting across columns.
      convertEol: false,
      theme
    })

    // Deduplicate paste events to prevent Chromium + Xterm double-paste bugs
    let lastPasteText = ''
    let lastPasteTime = 0
    const originalPaste = term.paste.bind(term)
    term.paste = (text: string): void => {
      const now = Date.now()
      if (text === lastPasteText && now - lastPasteTime < 300) {
        return
      }
      lastPasteText = text
      lastPasteTime = now
      originalPaste(text)
    }

    // Custom key event handler for smart copy / paste
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      // Ctrl + Shift + C (or Ctrl + C when text is selected): Copy selection
      if (isCtrlOrCmd && (event.key === 'c' || event.key === 'C')) {
        if (event.shiftKey || term.hasSelection()) {
          if (event.type === 'keydown') {
            const selection = term.getSelection()
            if (selection) {
              window.neoAPI.writeClipboard(selection)
            }
          }
          event.preventDefault()
          return false
        }
        return true
      }

      // Ctrl + V or Ctrl + Shift + V: Smart paste
      if (isCtrlOrCmd && (event.key === 'v' || event.key === 'V')) {
        event.preventDefault()
        if (event.type === 'keydown') {
          Promise.all([
            window.neoAPI.readSmartClipboard(),
            window.neoAPI.getPtyProcess(panelId).catch(() => '')
          ]).then(([res, proc]) => {
            const isAgy =
              proc === 'agy' ||
              proc.endsWith('/agy') ||
              isAgyTerminal(panelId, term)

            if (res && res.type === 'image' && isAgy) {
              // AGY has native Bubbletea clipboard integration: sending \x16 (Ctrl+V)
              // triggers AGY's native wl-paste/xclip image attachment, exactly like in a normal terminal!
              window.neoAPI.writeTerminal(panelId, '\x16')
              return
            }

            if (res && res.text) {
              const textToPaste = res.path ? (res.path.includes(' ') ? `"${res.path}"` : res.path) : res.text
              term.paste(textToPaste)
            }
          })
        }
        return false
      }

      // Ctrl + Shift + A: Select all
      if (isCtrlOrCmd && event.shiftKey && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault()
        if (event.type === 'keydown') {
          term.selectAll()
        }
        return false
      }

      return true
    })

    // Load Fit Addon
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // Load Web Links Addon (opens URLs on click)
    const webLinksAddon = new WebLinksAddon(
      (_event, uri) => {
        openExternalUrl(uri)
      },
      {
        urlRegex: /(https?:\/\/[^\s"'!*(){}|\\^<>`]+|(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s"'!*(){}|\\^<>`]*)/i
      }
    )
    term.loadAddon(webLinksAddon)

    // Load Search Addon
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)

    term.open(container)

    if (term.element) {
      term.element.style.boxSizing = 'border-box'
      term.element.style.overflow = 'hidden'
      term.element.addEventListener('scroll', () => {
        if (term.element && term.element.scrollTop !== 0) term.element.scrollTop = 0
        if (term.element && term.element.scrollLeft !== 0) term.element.scrollLeft = 0
      }, { passive: true })
    }

    // Fix Canvas Zoom / Scale mouse selection bug:
    // When inside a CSS transform (such as Canvas mode scale(zoom)), xterm calculates
    // mouse coordinates by comparing screen clientX/clientY against getBoundingClientRect(),
    // but divides by unscaled cell dimensions. We dynamically adjust the coordinates
    // by the element's actual CSS scale factor so mouse selection is 100% pixel-accurate!
    const core = (term as any)._core
    if (core && core._mouseService) {
      const origGetCoords = core._mouseService.getCoords.bind(core._mouseService)
      core._mouseService.getCoords = (
        event: { clientX: number; clientY: number },
        element: HTMLElement,
        colCount: number,
        rowCount: number,
        isSelection?: boolean
      ) => {
        if (!element) return origGetCoords(event, element, colCount, rowCount, isSelection)
        const rect = element.getBoundingClientRect()
        const offsetW = element.offsetWidth || rect.width || 1
        const offsetH = element.offsetHeight || rect.height || 1
        const scaleX = rect.width / offsetW
        const scaleY = rect.height / offsetH

        if (Math.abs(scaleX - 1) > 0.002 || Math.abs(scaleY - 1) > 0.002) {
          const adjustedEvent = {
            clientX: rect.left + (event.clientX - rect.left) / scaleX,
            clientY: rect.top + (event.clientY - rect.top) / scaleY
          }
          return origGetCoords(adjustedEvent, element, colCount, rowCount, isSelection)
        }

        return origGetCoords(event, element, colCount, rowCount, isSelection)
      }

      if (core._mouseService.getMouseReportCoords) {
        const origReportCoords = core._mouseService.getMouseReportCoords.bind(core._mouseService)
        core._mouseService.getMouseReportCoords = (event: MouseEvent, element: HTMLElement) => {
          if (!element) return origReportCoords(event, element)
          const rect = element.getBoundingClientRect()
          const offsetW = element.offsetWidth || rect.width || 1
          const offsetH = element.offsetHeight || rect.height || 1
          const scaleX = rect.width / offsetW
          const scaleY = rect.height / offsetH

          if (Math.abs(scaleX - 1) > 0.002 || Math.abs(scaleY - 1) > 0.002) {
            const adjustedEvent = new MouseEvent(event.type, {
              clientX: rect.left + (event.clientX - rect.left) / scaleX,
              clientY: rect.top + (event.clientY - rect.top) / scaleY,
              button: event.button,
              buttons: event.buttons,
              ctrlKey: event.ctrlKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              metaKey: event.metaKey
            })
            return origReportCoords(adjustedEvent, element)
          }

          return origReportCoords(event, element)
        }
      }
    }

    let ptySpawned = false
    let lastCols = 0
    let lastRows = 0

    const notifyPtyResize = (cols: number, rows: number): void => {
      if (!ptySpawned || cols <= 0 || rows <= 0) return
      if (cols === lastCols && rows === lastRows) return
      lastCols = cols
      lastRows = rows
      window.neoAPI.resizeTerminal(panelId, cols, rows)
    }

    const ensurePtySpawned = (): void => {
      if (ptySpawned) return
      ptySpawned = true
      const c = term.cols || 80
      const r = term.rows || 24
      lastCols = c
      lastRows = r
      spawnPty(c, r)
    }

    const fit = (): void => {
      try {
        if (container.clientWidth > 40 && container.clientHeight > 40) {
          fitAddon.fit()
          if (!ptySpawned) {
            ensurePtySpawned()
          } else if (term.cols > 0 && term.rows > 0) {
            notifyPtyResize(term.cols, term.rows)
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
        commands: config.autoStart ? config.commands : undefined,
        env: config.env,
        cols,
        rows
      })
    }

    // Directly subscribe to term.onResize to guarantee node-pty is always kept in sync
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      notifyPtyResize(cols, rows)
    })

    // Subscribe to IPC data and exit
    const onDataDisposable = term.onData((data) => {
      window.neoAPI.writeTerminal(panelId, data)
    })

    const urlRegex = /((?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(?::\d+)(?:\/[^\s\x1b\x07"'`<>()[\]{}]*)?)/i
    let lastUrl: string | undefined
    const urlListeners = new Set<(url: string) => void>()

    const onUrlDetected = (cb: (url: string) => void): (() => void) => {
      urlListeners.add(cb)
      if (lastUrl) cb(lastUrl)
      return () => {
        urlListeners.delete(cb)
      }
    }

    const unsubscribeData = window.neoAPI.onTerminalData(panelId, (data) => {
      term.write(data)
      const match = data.match(urlRegex)
      if (match) {
        const cleaned = cleanUrl(match[1])
        if (cleaned && cleaned !== lastUrl) {
          lastUrl = cleaned
          if (managed) {
            managed.lastDetectedUrl = lastUrl
          }
          urlListeners.forEach((cb) => cb(lastUrl!))
        }
      }
    })

    const unsubscribeExit = window.neoAPI.onTerminalExit(panelId, ({ code }) => {
      term.writeln(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m\r\n`)
    })

    // Spawn process after small tick for sizing if fit() has not already spawned it
    setTimeout(() => {
      ensurePtySpawned()
    }, 25)

    const clear = (): void => {
      term.clear()
    }

    const updateConfig = (newConfig: Partial<TerminalSpawnConfig>): void => {
      config = { ...config, ...newConfig }
      if (managed) {
        managed.config = config
      }
    }

    const restart = (newConfig?: TerminalSpawnConfig): void => {
      if (newConfig) {
        config = { ...config, ...newConfig }
        if (managed) {
          managed.config = config
        }
      }
      term.clear()
      const c = term.cols || 80
      const r = term.rows || 24
      spawnPty(c, r)
    }

    const getBufferText = (): string => {
      let bufferText = ''
      const buffer = term.buffer.active
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
          bufferText += line.translateToString(true) + '\n'
        }
      }
      return bufferText.trimEnd()
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
      onResizeDisposable.dispose()
      unsubscribeData()
      unsubscribeExit()
      urlListeners.clear()
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
      config,
      cleanup,
      clear,
      restart,
      updateConfig,
      fit,
      findNext,
      findPrevious,
      clearSearch,
      getBufferText,
      lastDetectedUrl: lastUrl,
      onUrlDetected
    }

    this.terminals.set(panelId, managed)
    return managed
  }

  public exportLog(panelId: string): string {
    const existing = this.terminals.get(panelId)
    return existing ? existing.getBufferText() : ''
  }

  public reconfigureAndRestart(panelId: string, newConfig: TerminalSpawnConfig): boolean {
    const existing = this.terminals.get(panelId)
    if (existing) {
      existing.restart(newConfig)
      return true
    }
    return false
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

// Listen to web fonts ready/loadingdone to fix font metrics desync bugs
if (typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts.ready.then(() => {
    terminalPool.refreshAllMetrics()
  })
  document.fonts.addEventListener('loadingdone', () => {
    terminalPool.refreshAllMetrics()
  })
}

// Listen to display resolution / DPI scale changes to fix blurry / misaligned terminal characters
if (typeof window !== 'undefined') {
  const setupDprMonitor = (): void => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    const handleDprChange = (): void => {
      terminalPool.refreshAllMetrics()
      setupDprMonitor()
    }
    mq.addEventListener('change', handleDprChange, { once: true })
  }
  setupDprMonitor()

  window.addEventListener('resize', () => {
    terminalPool.refreshAllMetrics()
  })
}

