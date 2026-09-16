import { app, shell, BrowserWindow, ipcMain, dialog, clipboard } from 'electron'
import { join } from 'path'
import { StoreManager, AppState } from './store'
import { PtyManager, SpawnOptions } from './pty-manager'
import { TelemetryMonitor, TelemetryPayload } from './telemetry'

let mainWindow: BrowserWindow | null = null
const store = new StoreManager()
const ptyManager = new PtyManager()
let telemetryMonitor: TelemetryMonitor | null = null

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

  mainWindow.on('closed', () => {
    telemetryMonitor?.stop()
    ptyManager.killAll()
    mainWindow = null
  })
}

app.whenReady().then(() => {
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
      if (process.platform === 'linux') {
        clipboard.writeText(text, 'selection')
      }
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

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })

  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
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
