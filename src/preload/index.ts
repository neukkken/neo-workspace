import { contextBridge, ipcRenderer } from 'electron'

export interface SpawnOptions {
  panelId: string
  cwd: string
  command?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface PanelConfig {
  id: string
  title: string
  cwd: string
  command: string
  autoStart: boolean
}

export type TerminalThemeName = 'matrix' | 'dracula' | 'tokyo' | 'monokai' | 'nord'

export type WorkspaceLayoutMode = 'grid' | 'canvas'

export interface Workspace {
  id: string
  name: string
  code: string
  panels: PanelConfig[]
  layoutMode?: WorkspaceLayoutMode
  canvasCards?: any[]
}

export type SidebarPosition = 'left' | 'right' | 'top' | 'bottom'

export interface AppSettings {
  sidebarPosition: SidebarPosition
  terminalTheme?: TerminalThemeName
  terminalFontSize?: number
  defaultShell?: string
}

export interface AppState {
  activeWorkspaceId: string
  workspaces: Workspace[]
  settings?: AppSettings
}

export interface ProcessMetrics {
  cpu: number
  memoryMb: number
}

export interface SystemMetrics {
  cpuPercent: number
  usedMemMb: number
  totalMemMb: number
}

export interface TelemetryPayload {
  system: SystemMetrics
  panels: Record<string, ProcessMetrics>
}

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

export type NeoAPI = typeof neoAPI
export const neoAPI = {
  getStore: (): Promise<AppState> => ipcRenderer.invoke('store:get'),
  saveStore: (state: AppState): Promise<boolean> => ipcRenderer.invoke('store:save', state),

  selectDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-directory', defaultPath),

  writeClipboard: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('clipboard:write', text),

  readClipboard: (): Promise<string> =>
    ipcRenderer.invoke('clipboard:read'),

  spawnTerminal: (options: SpawnOptions): Promise<boolean> =>
    ipcRenderer.invoke('pty:spawn', options),

  writeTerminal: (panelId: string, data: string): void => {
    ipcRenderer.send('pty:write', { panelId, data })
  },

  resizeTerminal: (panelId: string, cols: number, rows: number): void => {
    ipcRenderer.send('pty:resize', { panelId, cols, rows })
  },

  killTerminal: (panelId: string): Promise<boolean> =>
    ipcRenderer.invoke('pty:kill', panelId),

  killAllTerminals: (): Promise<boolean> =>
    ipcRenderer.invoke('pty:killAll'),

  onTerminalData: (panelId: string, callback: (data: string) => void): (() => void) => {
    const channel = `pty:data:${panelId}`
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => callback(data)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },

  onTerminalExit: (
    panelId: string,
    callback: (exitInfo: { code: number; signal?: number }) => void
  ): (() => void) => {
    const channel = `pty:exit:${panelId}`
    const handler = (
      _event: Electron.IpcRendererEvent,
      exitInfo: { code: number; signal?: number }
    ): void => callback(exitInfo)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },

  onTelemetry: (callback: (data: TelemetryPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TelemetryPayload): void =>
      callback(data)
    ipcRenderer.on('telemetry:update', handler)
    return () => {
      ipcRenderer.removeListener('telemetry:update', handler)
    }
  },

  // Auto Updater APIs
  checkForUpdates: (): Promise<UpdateStatusPayload> => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke('updater:download'),
  quitAndInstallUpdate: (): void => ipcRenderer.send('updater:quit-and-install'),
  onUpdaterStatus: (callback: (status: UpdateStatusPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatusPayload): void =>
      callback(status)
    ipcRenderer.on('updater:status', handler)
    return () => {
      ipcRenderer.removeListener('updater:status', handler)
    }
  },

  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  // File System & Project Intelligence
  listDirectory: (dirPath?: string): Promise<{ dir: string; entries: any[]; error?: string }> =>
    ipcRenderer.invoke('fs:list-directory', dirPath),

  readFile: (filePath: string): Promise<{ content?: string; size?: number; path?: string; name?: string; error?: string }> =>
    ipcRenderer.invoke('fs:read-file', filePath),

  inspectProject: (
    dirPath: string
  ): Promise<{
    name?: string
    type: string
    suggestedCommands: Array<{ label: string; command: string }>
    hasNeoworkConfig: boolean
  }> => ipcRenderer.invoke('fs:inspect-project', dirPath),

  readNeoworkConfig: (folderPath: string): Promise<any> =>
    ipcRenderer.invoke('fs:read-neowork-config', folderPath),

  writeNeoworkConfig: (folderPath: string, workspace: any): Promise<boolean> =>
    ipcRenderer.invoke('fs:write-neowork-config', { folderPath, workspace }),

  checkPort: (port: number): Promise<{ port: number; isOpen: boolean }> =>
    ipcRenderer.invoke('net:check-port', port)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('neoAPI', neoAPI)
  } catch (error) {
    console.error('Failed to expose neoAPI in main world:', error)
  }
} else {
  // @ts-ignore (fallback)
  window.neoAPI = neoAPI
}
