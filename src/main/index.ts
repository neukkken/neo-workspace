import { app, shell, BrowserWindow, ipcMain, dialog, clipboard } from 'electron'
import { join, extname, basename } from 'path'
import * as fs from 'fs'
import * as net from 'net'
import { StoreManager, AppState } from './store'
import { PtyManager, SpawnOptions } from './pty-manager'
import { TelemetryMonitor, TelemetryPayload } from './telemetry'
import { AppUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
const store = new StoreManager()
const ptyManager = new PtyManager()
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
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('console-message', (event: any) => {
    if (event?.level >= 2 && event?.message) {
      console.warn(`[RENDERER warn/err] ${event.message}`)
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
    mainWindow = null
  })
}

app.whenReady().then(() => {
  appUpdater = new AppUpdater()

  // Store IPC
  ipcMain.handle('store:get', () => {
    return store.getState()
  })

  ipcMain.handle('store:save', (_event, state: AppState) => {
    return store.saveState(state)
  })

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
  ipcMain.handle('clipboard:write', (_event, text: string) => {
    if (typeof text === 'string') {
      clipboard.writeText(text)
      return true
    }
    return false
  })

  ipcMain.handle('clipboard:read', () => {
    return clipboard.readText()
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
        let size = 0
        try {
          if (!d.isDirectory()) {
            const stat = fs.statSync(fullPath)
            size = stat.size
          }
        } catch {}
        entries.push({
          name: d.name,
          path: fullPath,
          isDirectory: d.isDirectory(),
          size,
          extension: d.isDirectory() ? undefined : extname(d.name).toLowerCase()
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
      if (stat.size > 2 * 1024 * 1024) {
        return { error: 'File exceeds 2MB limit for preview' }
      }
      const buffer = await fs.promises.readFile(filePath)
      const sampleSize = Math.min(buffer.length, 1024)
      for (let i = 0; i < sampleSize; i++) {
        if (buffer[i] === 0) {
          return { error: 'Binary file preview not supported', isBinary: true, size: stat.size, path: filePath, name: basename(filePath) }
        }
      }
      const content = buffer.toString('utf-8')
      return { content, size: stat.size, path: filePath, name: basename(filePath) }
    } catch (err: any) {
      return { error: err.message }
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
  ptyManager.killAll()
  if (process.platform !== 'darwin') {
    app.exit(0)
  }
})
