// Tauri implementation of window.neoAPI. Same shape as neo-api.ts, so the
// components don't change. Rust commands are the channel names in snake_case
// (`pty:get-process` -> `pty_get_process`); events keep the channel name.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { NeoAPI } from './neo-api'

// camelCase -> snake_case too: `window:isMaximized` -> `window_is_maximized`.
const call = <T>(channel: string, args?: Record<string, unknown>): Promise<T> =>
  invoke<T>(channel.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[:-]/g, '_'), args)

// Fire-and-forget (ipcRenderer.send equivalent): swallow rejections like send() does.
const send = (channel: string, args?: Record<string, unknown>): void => {
  call(channel, args).catch((e) => console.warn(`[tauri] ${channel} failed:`, e))
}

// listen() is async; hand back a sync unsubscribe that also works if called before it resolves.
const on = <T>(channel: string, callback: (payload: T) => void): (() => void) => {
  let off: (() => void) | undefined
  let cancelled = false
  listen<T>(channel, (e) => callback(e.payload)).then((fn) => (cancelled ? fn() : (off = fn)))
  return () => {
    cancelled = true
    off?.()
  }
}

const tauriAPI: NeoAPI = {
  getStore: () => call('store:get'),
  saveStore: (state) => call('store:save', { state }),
  selectDirectory: (defaultPath) => call('dialog:select-directory', { defaultPath }),
  writeClipboard: (text) => call('clipboard:write', { text }),
  readClipboard: () => call('clipboard:read'),
  readSmartClipboard: () => call('clipboard:read-smart'),

  getShells: () => call('pty:shells'),
  spawnTerminal: (options) => call('pty:spawn', { options }),
  writeTerminal: (panelId, data) => send('pty:write', { panelId, data }),
  resizeTerminal: (panelId, cols, rows) => send('pty:resize', { panelId, cols, rows }),
  killTerminal: (panelId) => call('pty:kill', { panelId }),
  killAllTerminals: () => call('pty:killAll'),
  getPtyProcess: (panelId) => call('pty:get-process', { panelId }),
  onTerminalData: (panelId, cb) => on(`pty:data:${panelId}`, cb),
  onTerminalExit: (panelId, cb) => on(`pty:exit:${panelId}`, cb),
  onAgentStatus: (cb) => on('agent:status', cb),
  onAgentOpen: (cb) => on('agent:open', cb),
  onTelemetry: (cb) => on('telemetry:update', cb),

  checkForUpdates: () => call('updater:check'),
  downloadUpdate: () => call('updater:download'),
  quitAndInstallUpdate: () => send('updater:quit-and-install'),
  onUpdaterStatus: (cb) => on('updater:status', cb),

  minimizeWindow: () => send('window:minimize'),
  maximizeWindow: () => send('window:maximize'),
  closeWindow: () => send('window:close'),
  isWindowMaximized: () => call('window:isMaximized'),
  getAppVersion: () => call('app:getVersion'),

  getDisplays: () => call('screen:get-displays'),
  getMultiMonitorStatus: () => call('screen:get-status'),
  openSecondaryWindow: (displayIndex) => call('screen:open-secondary', { displayIndex }),
  closeSecondaryWindow: () => call('screen:close-secondary'),
  moveWindowToDisplay: (displayIndex) => call('screen:move-window-to-display', { displayIndex }),
  onMultiMonitorStatus: (cb) => on('screen:status-changed', cb),
  onStoreSynced: (cb) => on('store:synced', cb),

  listDirectory: (dirPath) => call('fs:list-directory', { dirPath }),
  readFile: (filePath) => call('fs:read-file', { filePath }),
  openPath: (targetPath) => call('shell:open-path', { targetPath }),
  showItemInFolder: (targetPath) => call('shell:show-item-in-folder', { targetPath }),
  openExternal: (url) => call('shell:open-external', { url }),
  inspectProject: (dirPath) => call('fs:inspect-project', { dirPath }),
  readNeoworkConfig: (folderPath) => call('fs:read-neowork-config', { folderPath }),
  writeNeoworkConfig: (folderPath, workspace) =>
    call('fs:write-neowork-config', { folderPath, workspace }),
  checkPort: (port) => call('net:check-port', { port }),

  getRemoteStatus: () => call('remote:get-status'),
  toggleRemote: () => call('remote:toggle'),
  regenerateRemoteToken: () => call('remote:regenerate-token'),
  setRemotePort: (port) => call('remote:set-port', { port }),
  onRemoteStatus: (cb) => on('remote:status-update', cb),
  onRemoteWorkspaceSelect: (cb) => on('remote:workspace-selected', cb),

  vscodeCheckInstalled: () => call('vscode:check-installed'),
  vscodeStartServer: (folderPath) => call('vscode:start-server', { folderPath }),
  vscodeStopServer: (port) => call('vscode:stop-server', { port }),
  vscodeOpenDesktop: (folderPath) => call('vscode:open-desktop', { folderPath }),

  wallpapersList: () => call('wallpapers:list'),
  wallpapersImport: () => call('wallpapers:import'),
  wallpapersRemove: (id) => call('wallpapers:remove', { id }),

  gitBranches: (folders) => call('git:branches', { folders }),
  setRunningWorkspaces: (ids) => send('clock:set-running', { ids }),
  readWorkspaceClock: (id) => call('clock:read', { id }),
  gitRepos: (folders) => call('git:repos', { folders }),
  gitSessionChanges: (repo) => call('git:session-changes', { repo }),
  gitSessionDiff: (repo, file) => call('git:session-diff', { repo, file }),
  gitSessionReset: (repo) => call('git:session-reset', { repo }),

  adblockGetStatus: () => Promise.resolve(false),
  adblockToggle: () => Promise.resolve(false)
}

if ('__TAURI_INTERNALS__' in window) {
  window.neoAPI = tauriAPI
  // Tauri's webviews ignore -webkit-app-region: drag the window from the same elements by hand.
  document.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement
    if (e.button !== 0 || !target.closest('.drag-region')) return
    if (target.closest('.no-drag, button, input, select, textarea, a')) return
    if (e.detail === 2) tauriAPI.maximizeWindow()
    else getCurrentWindow().startDragging().catch(() => {})
  })
}
