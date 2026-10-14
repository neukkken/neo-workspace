import { contextBridge, ipcRenderer } from 'electron'

export interface SpawnOptions {
  panelId: string
  cwd: string
  command?: string
  commands?: string[]
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface PanelConfig {
  id: string
  title: string
  cwd: string
  command: string
  commands?: string[]
  autoStart: boolean
  env?: Record<string, string>
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

export interface SmartClipboardResult {
  type: 'image' | 'file' | 'text' | 'empty'
  path?: string
  text: string
  width?: number
  height?: number
  sizeBytes?: number
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

  readSmartClipboard: (): Promise<SmartClipboardResult> =>
    ipcRenderer.invoke('clipboard:read-smart'),

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

  getPtyProcess: (panelId: string): Promise<string> =>
    ipcRenderer.invoke('pty:get-process', panelId),

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

  readFile: (
    filePath: string
  ): Promise<{
    type?: 'text' | 'spreadsheet' | 'binary'
    content?: string
    sheets?: Array<{ name: string; rows: any[][] }>
    size?: number
    path?: string
    name?: string
    error?: string
    isBinary?: boolean
  }> => ipcRenderer.invoke('fs:read-file', filePath),

  openPath: (targetPath: string): Promise<string> =>
    ipcRenderer.invoke('shell:open-path', targetPath),

  showItemInFolder: (targetPath: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:show-item-in-folder', targetPath),

  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:open-external', url),

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
    ipcRenderer.invoke('net:check-port', port),

  // Remote Mobile Gateway
  getRemoteStatus: (): Promise<{
    enabled: boolean
    port: number
    token: string
    interfaces: Array<{ name: string; ip: string; type: 'lan' | 'tailscale' | 'other' }>
    primaryUrl: string
    tailscaleUrl?: string
    qrCodeDataUrl: string
    clientCount: number
  }> => ipcRenderer.invoke('remote:get-status'),

  toggleRemote: (): Promise<any> => ipcRenderer.invoke('remote:toggle'),
  regenerateRemoteToken: (): Promise<any> => ipcRenderer.invoke('remote:regenerate-token'),
  setRemotePort: (port: number): Promise<boolean> => ipcRenderer.invoke('remote:set-port', port),

  onRemoteStatus: (callback: (status: any) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: any): void => callback(status)
    ipcRenderer.on('remote:status-update', handler)
    return () => {
      ipcRenderer.removeListener('remote:status-update', handler)
    }
  },

  onRemoteWorkspaceSelect: (callback: (workspaceId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspaceId: string): void => callback(workspaceId)
    ipcRenderer.on('remote:workspace-selected', handler)
    return () => {
      ipcRenderer.removeListener('remote:workspace-selected', handler)
    }
  },

  // VS Code Integration
  vscodeCheckInstalled: (): Promise<boolean> =>
    ipcRenderer.invoke('vscode:check-installed'),

  vscodeStartServer: (
    folderPath?: string
  ): Promise<{ success: boolean; url?: string; port?: number; error?: string }> =>
    ipcRenderer.invoke('vscode:start-server', folderPath),

  vscodeStopServer: (port?: number): Promise<boolean> =>
    ipcRenderer.invoke('vscode:stop-server', port),

  vscodeOpenDesktop: (folderPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('vscode:open-desktop', folderPath),

  // Built-in AdBlocker
  adblockGetStatus: (): Promise<boolean> =>
    ipcRenderer.invoke('adblock:get-status'),

  adblockToggle: (enabled?: boolean): Promise<boolean> =>
    ipcRenderer.invoke('adblock:toggle', enabled)
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
