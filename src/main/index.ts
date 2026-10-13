import { app, shell, BrowserWindow, ipcMain, dialog, clipboard, session } from 'electron'
import { join, extname, basename } from 'path'
import * as fs from 'fs'
import * as net from 'net'
import * as XLSX from 'xlsx'
import { StoreManager, AppState } from './store'
import { PtyManager, SpawnOptions } from './pty-manager'
import { TelemetryMonitor, TelemetryPayload } from './telemetry'
import { AppUpdater } from './updater'
import { RemoteGateway } from './remote-gateway'
import { VSCodeManager } from './vscode-manager'

let mainWindow: BrowserWindow | null = null
const store = new StoreManager()
const ptyManager = new PtyManager()
const remoteGateway = new RemoteGateway(ptyManager, store)
const vscodeManager = new VSCodeManager()
let telemetryMonitor: TelemetryMonitor | null = null
let appUpdater: AppUpdater | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#090a0c',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('console-message', (event: any, level?: any, message?: any) => {
    const lvl = typeof level === 'number' ? level : (event?.level ?? 0)
    const msg = typeof message === 'string' ? message : (event?.message ?? '')
    if (lvl >= 2 || (msg && /error|uncaught|warning|fail/i.test(msg))) {
      console.warn(`[RENDERER console] [level:${lvl}] ${msg}`)
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[LOAD FAIL] ${errorCode}: ${errorDescription} at ${validatedURL}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[RENDERER CRASHED]`, details)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Start telemetry
  telemetryMonitor = new TelemetryMonitor(ptyManager, (data: TelemetryPayload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('telemetry:update', data)
    }
  })
  telemetryMonitor.start(1800)

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Connect updater to main window and check in background
  if (mainWindow) {
    appUpdater?.setMainWindow(mainWindow)
    appUpdater?.checkOnStartup()
  }

  mainWindow.on('closed', () => {
    telemetryMonitor?.stop()
    ptyManager.killAll()
    vscodeManager.cleanupAll()
    mainWindow = null
  })
}

function setupSessionInterceptors(targetSession: Electron.Session): void {
  // 1. Strip X-Frame-Options and Content-Security-Policy frame-ancestors to allow embedding preview pages
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.responseHeaders) {
      return callback({ cancel: false })
    }
    const responseHeaders = { ...details.responseHeaders }
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase()
      if (lower === 'x-frame-options') {
        delete responseHeaders[key]
      } else if (lower === 'content-security-policy') {
        responseHeaders[key] = responseHeaders[key].map((csp) =>
          csp.replace(/frame-ancestors[^;]+;?/gi, '')
        )
      }
    }
    callback({ cancel: false, responseHeaders })
  })

  // 2. Clean User-Agent for modern websites requiring standard Chrome identification
  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders }
    const ua = requestHeaders['User-Agent'] || requestHeaders['user-agent']
    if (ua && ua.includes('Electron')) {
      const cleanUA = ua.replace(/\s*Electron\/[0-9.]+/g, '')
      requestHeaders['User-Agent'] = cleanUA
    }
    callback({ cancel: false, requestHeaders })
  })
}

app.whenReady().then(() => {
  // Configure session interceptors for default session, browser partition, and vscode partition
  setupSessionInterceptors(session.defaultSession)
  setupSessionInterceptors(session.fromPartition('persist:neowork-browser'))
  setupSessionInterceptors(session.fromPartition('persist:neowork-vscode'))

  // WebContents resource optimization
  app.on('web-contents-created', (_event, contents) => {
    // Enable background throttling to save CPU & battery on inactive webviews
    contents.setBackgroundThrottling(true)
  })

  appUpdater = new AppUpdater()

  // Store IPC
  ipcMain.handle('store:get', () => {
    return store.getState()
  })

  ipcMain.handle('store:save', (_event, state: AppState) => {
    if (state.activeWorkspaceId) {
      remoteGateway.setActiveWorkspace(state.activeWorkspaceId)
    }
    return store.saveState(state)
  })

  // Remote Mobile Gateway IPC
  ipcMain.handle('remote:get-status', () => {
    return remoteGateway.getStatus()
  })

  ipcMain.handle('remote:toggle', async () => {
    const status = await remoteGateway.getStatus()
    if (status.enabled) {
      await remoteGateway.stop()
    } else {
      await remoteGateway.start()
    }
    return remoteGateway.getStatus()
  })

  ipcMain.handle('remote:regenerate-token', () => {
    return remoteGateway.regenerateToken()
  })

  ipcMain.handle('remote:set-port', async (_event, port: number) => {
    return remoteGateway.setPort(port)
  })

  remoteGateway.onStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote:status-update', status)
    }
  })

  remoteGateway.onWorkspaceSelect((workspaceId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote:workspace-selected', workspaceId)
    }
  })

  // Start remote gateway
  remoteGateway.start()

  // Directory picker dialog
  ipcMain.handle('dialog:select-directory', async (_event, defaultPath?: string) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Directory for Terminal',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  // Native Clipboard IPC
  ipcMain.handle('clipboard:write', async (_event, text: string) => {
    if (typeof text === 'string') {
      await clipboard.writeText(text)
      return true
    }
    return false
  })

  ipcMain.handle('clipboard:read', async () => {
    return await clipboard.readText()
  })

  // Smart Clipboard IPC: reads text, or saves clipboard images to disk and returns the file path for CLI agents
  ipcMain.handle('clipboard:read-smart', async () => {
    try {
      // 1. Check if clipboard contains an image via Electron's modern clipboard.read()
      if (typeof clipboard.read === 'function') {
        const items = await clipboard.read()
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'))
          if (imageType) {
            const blob = (await item.getType(imageType)) as Blob
            if (blob && blob.size > 0) {
              const arrayBuffer = await blob.arrayBuffer()
              const buffer = Buffer.from(arrayBuffer)
              const tempDir = join(app.getPath('temp'), 'neowork-clipboard')
              if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true })
              }
              const ext = imageType.includes('jpeg') ? 'jpg' : imageType.includes('webp') ? 'webp' : 'png'
              const fileName = `agent-img-${Date.now()}.${ext}`
              const filePath = join(tempDir, fileName)
              fs.writeFileSync(filePath, buffer)
              return {
                type: 'image' as const,
                path: filePath,
                text: filePath,
                sizeBytes: buffer.length
              }
            }
          }
        }
      }

      // Fallback for legacy sync readImage if available in runtime
      if (typeof (clipboard as any).readImage === 'function') {
        const legacyImage = (clipboard as any).readImage()
        if (legacyImage && !legacyImage.isEmpty()) {
          const tempDir = join(app.getPath('temp'), 'neowork-clipboard')
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
          }
          const fileName = `agent-img-${Date.now()}.png`
          const filePath = join(tempDir, fileName)
          const pngBuffer = legacyImage.toPNG()
          fs.writeFileSync(filePath, pngBuffer)
          return {
            type: 'image' as const,
            path: filePath,
            text: filePath,
            sizeBytes: pngBuffer.length
          }
        }
      }

      // 2. Check if clipboard text is a file:// URI pointing to an image or file
      const text = await clipboard.readText()
      if (text) {
        const trimmed = text.trim()
        if (trimmed.startsWith('file://')) {
          try {
            const rawPath = decodeURI(new URL(trimmed).pathname)
            if (fs.existsSync(rawPath)) {
              const isImg = /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(rawPath)
              return {
                type: isImg ? ('image' as const) : ('file' as const),
                path: rawPath,
                text: rawPath
              }
            }
          } catch {
            const fallbackPath = decodeURIComponent(trimmed.replace(/^file:\/\//, ''))
            if (fs.existsSync(fallbackPath)) {
              return {
                type: 'file' as const,
                path: fallbackPath,
                text: fallbackPath
              }
            }
          }
        }

        return {
          type: 'text' as const,
          text
        }
      }

      return {
        type: 'empty' as const,
        text: ''
      }
    } catch (err: any) {
      console.error('[Clipboard] read-smart error:', err)
      try {
        const fallback = await clipboard.readText()
        return {
          type: 'text' as const,
          text: fallback || ''
        }
      } catch {
        return {
          type: 'empty' as const,
          text: ''
        }
      }
    }
  })

  // PTY IPC
  ipcMain.handle('pty:spawn', (_event, options: SpawnOptions) => {
    if (!mainWindow) return false
    return ptyManager.spawn(
      options,
      (data: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`pty:data:${options.panelId}`, data)
        }
      },
      (code: number, signal?: number) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`pty:exit:${options.panelId}`, { code, signal })
        }
      }
    )
  })

  ipcMain.on('pty:write', (_event, { panelId, data }: { panelId: string; data: string }) => {
    ptyManager.write(panelId, data)
  })

  ipcMain.on('pty:resize', (_event, { panelId, cols, rows }: { panelId: string; cols: number; rows: number }) => {
    ptyManager.resize(panelId, cols, rows)
  })

  ipcMain.handle('pty:kill', (_event, panelId: string) => {
    ptyManager.kill(panelId)
    return true
  })

  ipcMain.handle('pty:killAll', () => {
    ptyManager.killAll()
    return true
  })

  ipcMain.handle('pty:get-process', (_event, panelId: string) => {
    return ptyManager.getForegroundProcess(panelId)
  })

  // File System IPC for Canvas Explorer & Project Inspection
  ipcMain.handle('fs:list-directory', async (_event, targetDir?: string) => {
    try {
      const dir =
        targetDir && fs.existsSync(targetDir)
          ? targetDir
          : process.env.HOME || process.env.USERPROFILE || '.'
      const dirents = await fs.promises.readdir(dir, { withFileTypes: true })
      const entries = []
      for (const d of dirents) {
        if (d.name === '.git' || d.name === 'node_modules') continue
        const fullPath = join(dir, d.name)
        let isDir = d.isDirectory()
        let size = 0
        try {
          if (d.isSymbolicLink()) {
            const stat = fs.statSync(fullPath)
            isDir = stat.isDirectory()
            if (!isDir) size = stat.size
          } else if (!isDir) {
            const stat = fs.statSync(fullPath)
            size = stat.size
          }
        } catch {}
        entries.push({
          name: d.name,
          path: fullPath,
          isDirectory: isDir,
          size,
          extension: isDir ? undefined : extname(d.name).toLowerCase()
        })
      }
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
      return { dir, entries }
    } catch (err: any) {
      console.error('fs:list-directory error:', err)
      return { dir: targetDir || '', entries: [], error: err.message }
    }
  })

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return { error: 'File not found' }
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) return { error: 'Path is a directory' }

      const ext = extname(filePath).toLowerCase()
      // Spreadsheet support (Excel .xlsx, .xls, .csv, .tsv, .ods)
      if (['.xlsx', '.xls', '.csv', '.tsv', '.ods'].includes(ext)) {
        try {
          const workbook = XLSX.readFile(filePath, { sheetRows: 100 })
          const sheets = workbook.SheetNames.map((sheetName) => {
            const worksheet = workbook.Sheets[sheetName]
            const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
            return {
              name: sheetName,
              rows: rows.slice(0, 100)
            }
          })
          return {
            type: 'spreadsheet',
            sheets,
            size: stat.size,
            path: filePath,
            name: basename(filePath)
          }
        } catch (excelErr: any) {
          console.error('Excel parse error:', excelErr)
          return {
            type: 'binary',
            isBinary: true,
            size: stat.size,
            path: filePath,
            name: basename(filePath),
            error: `No se pudo interpretar el archivo Excel (${excelErr.message})`
          }
        }
      }

      if (stat.size > 2 * 1024 * 1024) {
        return {
          type: 'binary',
          isBinary: true,
          size: stat.size,
          path: filePath,
          name: basename(filePath),
          error: 'El archivo excede los 2MB para previsualización directa.'
        }
      }

      const buffer = await fs.promises.readFile(filePath)
      const sampleSize = Math.min(buffer.length, 1024)
      for (let i = 0; i < sampleSize; i++) {
        if (buffer[i] === 0) {
          return {
            type: 'binary',
            isBinary: true,
            size: stat.size,
            path: filePath,
            name: basename(filePath),
            error: 'Archivo binario. Haz clic en "Abrir en el sistema" para verlo.'
          }
        }
      }
      const content = buffer.toString('utf-8')
      return { type: 'text', content, size: stat.size, path: filePath, name: basename(filePath) }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Shell open path & show item in folder
  ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
    try {
      if (!targetPath || !fs.existsSync(targetPath)) return 'File not found'
      return await shell.openPath(targetPath)
    } catch (err: any) {
      return err.message
    }
  })

  ipcMain.handle('shell:show-item-in-folder', async (_event, targetPath: string) => {
    try {
      if (targetPath && fs.existsSync(targetPath)) {
        shell.showItemInFolder(targetPath)
        return true
      }
      return false
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:inspect-project', async (_event, targetDir: string) => {
    try {
      if (!targetDir || !fs.existsSync(targetDir)) {
        return { type: 'unknown', suggestedCommands: [], hasNeoworkConfig: false }
      }
      const suggestions: Array<{ label: string; command: string }> = []
      let projType = 'generic'
      let name: string | undefined

      const pkgPath = join(targetDir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        projType = 'node'
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
          if (pkg.name) name = pkg.name
          if (pkg.scripts) {
            for (const [scriptName] of Object.entries(pkg.scripts)) {
              suggestions.push({
                label: `npm run ${scriptName}`,
                command: `npm run ${scriptName}`
              })
            }
          }
        } catch {}
      }

      const cargoPath = join(targetDir, 'Cargo.toml')
      if (fs.existsSync(cargoPath)) {
        projType = 'rust'
        suggestions.push({ label: 'cargo run', command: 'cargo run' })
        suggestions.push({ label: 'cargo test', command: 'cargo test' })
        suggestions.push({ label: 'cargo build', command: 'cargo build' })
      }

      if (fs.existsSync(join(targetDir, 'requirements.txt')) || fs.existsSync(join(targetDir, 'pyproject.toml'))) {
        projType = 'python'
        if (fs.existsSync(join(targetDir, 'main.py'))) {
          suggestions.push({ label: 'python main.py', command: 'python main.py' })
        }
        suggestions.push({ label: 'pytest', command: 'pytest' })
      }

      if (fs.existsSync(join(targetDir, 'docker-compose.yml')) || fs.existsSync(join(targetDir, 'compose.yaml'))) {
        suggestions.push({ label: 'docker compose up', command: 'docker compose up' })
      }

      const hasNeoworkConfig = fs.existsSync(join(targetDir, '.neowork.json'))

      return {
        name,
        type: projType,
        suggestedCommands: suggestions,
        hasNeoworkConfig
      }
    } catch (err: any) {
      return { type: 'unknown', suggestedCommands: [], hasNeoworkConfig: false }
    }
  })

  ipcMain.handle('fs:read-neowork-config', async (_event, folderPath: string) => {
    try {
      const configPath = join(folderPath, '.neowork.json')
      if (fs.existsSync(configPath)) {
        const raw = await fs.promises.readFile(configPath, 'utf-8')
        return JSON.parse(raw)
      }
      return null
    } catch (err: any) {
      console.error('Error reading .neowork.json:', err)
      return null
    }
  })

  ipcMain.handle('fs:write-neowork-config', async (_event, { folderPath, workspace }: { folderPath: string; workspace: any }) => {
    try {
      const configPath = join(folderPath, '.neowork.json')
      await fs.promises.writeFile(configPath, JSON.stringify(workspace, null, 2), 'utf-8')
      return true
    } catch (err: any) {
      console.error('Error writing .neowork.json:', err)
      return false
    }
  })

  // Port health check
  ipcMain.handle('net:check-port', async (_event, port: number) => {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(600)

      socket.once('connect', () => {
        socket.destroy()
        resolve({ port, isOpen: true })
      })

      socket.once('timeout', () => {
        socket.destroy()
        resolve({ port, isOpen: false })
      })

      socket.once('error', () => {
        socket.destroy()
        resolve({ port, isOpen: false })
      })

      socket.connect(port, '127.0.0.1')
    })
  })

  // VS Code Integration IPC
  ipcMain.handle('vscode:check-installed', async () => {
    return vscodeManager.checkInstalled()
  })

  ipcMain.handle('vscode:start-server', async (_event, folderPath?: string) => {
    return vscodeManager.startServer(folderPath)
  })

  ipcMain.handle('vscode:stop-server', async (_event, port?: number) => {
    return vscodeManager.stopServer(port)
  })

  ipcMain.handle('vscode:open-desktop', async (_event, folderPath?: string) => {
    return vscodeManager.openDesktop(folderPath)
  })

  // Built-in AdBlocker IPC (disabled)
  ipcMain.handle('adblock:get-status', () => {
    return false
  })

  ipcMain.handle('adblock:toggle', () => {
    return false
  })

  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })

  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock && app.isPackaged) {
    app.exit(0)
    return
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  telemetryMonitor?.stop()
  remoteGateway.stop()
  ptyManager.killAll()
  vscodeManager.cleanupAll()
  if (process.platform !== 'darwin') {
    app.exit(0)
  }
})
