import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, UpdateInfo as ElectronUpdateInfo, ProgressInfo } from 'electron-updater'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateProgress {
  percent: number
  transferredMb: number
  totalMb: number
  bytesPerSecond: number
}

export interface UpdateStatusPayload {
  state: UpdateState
  info?: UpdateInfo
  progress?: UpdateProgress
  error?: string
}

export class AppUpdater {
  private mainWindow: BrowserWindow | null = null
  private currentStatus: UpdateStatusPayload = { state: 'idle' }

  constructor() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    this.registerAutoUpdaterEvents()
    this.registerIpcHandlers()
  }

  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private sendStatus(status: UpdateStatusPayload): void {
    this.currentStatus = status
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater:status', status)
    }
  }

  private registerAutoUpdaterEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus({ state: 'checking' })
    })

    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      const releaseNotes =
        typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
            : undefined

      this.sendStatus({
        state: 'available',
        info: {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes
        }
      })
    })

    autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
      this.sendStatus({
        state: 'not-available',
        info: {
          version: info.version
        }
      })
    })

    autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
      this.sendStatus({
        state: 'downloading',
        progress: {
          percent: Math.round(progressObj.percent),
          transferredMb: Number((progressObj.transferred / 1024 / 1024).toFixed(1)),
          totalMb: Number((progressObj.total / 1024 / 1024).toFixed(1)),
          bytesPerSecond: Math.round(progressObj.bytesPerSecond)
        }
      })
    })

    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      this.sendStatus({
        state: 'downloaded',
        info: {
          version: info.version
        }
      })
    })

    autoUpdater.on('error', (err: Error) => {
      console.error('[AppUpdater Error]:', err)
      this.sendStatus({
        state: 'error',
        error: err.message || 'Error checking or downloading updates'
      })
    })
  }

  private registerIpcHandlers(): void {
    ipcMain.handle('updater:check', async (): Promise<UpdateStatusPayload> => {
      if (!app.isPackaged) {
        // In local development, simulate or inform that app is in dev environment
        const devPayload: UpdateStatusPayload = {
          state: 'not-available',
          info: {
            version: `${app.getVersion()} (dev)`
          }
        }
        this.sendStatus(devPayload)
        return devPayload
      }

      try {
        this.sendStatus({ state: 'checking' })
        const result = await autoUpdater.checkForUpdates()
        if (result && result.updateInfo) {
          return this.currentStatus
        }
        return { state: 'not-available', info: { version: app.getVersion() } }
      } catch (err: any) {
        console.error('Error invoking checkForUpdates:', err)
        const errPayload: UpdateStatusPayload = {
          state: 'error',
          error: err?.message || 'Failed to check for updates'
        }
        this.sendStatus(errPayload)
        return errPayload
      }
    })

    ipcMain.handle('updater:download', async (): Promise<boolean> => {
      if (!app.isPackaged) {
        return false
      }

      try {
        await autoUpdater.downloadUpdate()
        return true
      } catch (err) {
        console.error('Error invoking downloadUpdate:', err)
        return false
      }
    })

    ipcMain.on('updater:quit-and-install', () => {
      if (app.isPackaged) {
        autoUpdater.quitAndInstall(false, true)
      }
    })
  }

  public checkOnStartup(): void {
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[AppUpdater] Initial background update check failed:', err?.message)
        })
      }, 5000)
    }
  }
}
