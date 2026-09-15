import { AppSettings, AppState, PanelConfig, ProcessMetrics, SidebarPosition, SpawnOptions, SystemMetrics, TelemetryPayload, Workspace } from './index'

declare global {
  interface Window {
    neoAPI: {
      getStore: () => Promise<AppState>
      saveStore: (state: AppState) => Promise<boolean>
      selectDirectory: (defaultPath?: string) => Promise<string | null>
      writeClipboard: (text: string) => Promise<boolean>
      readClipboard: () => Promise<string>
      spawnTerminal: (options: SpawnOptions) => Promise<boolean>
      writeTerminal: (panelId: string, data: string) => void
      resizeTerminal: (panelId: string, cols: number, rows: number) => void
      killTerminal: (panelId: string) => Promise<boolean>
      killAllTerminals: () => Promise<boolean>
      onTerminalData: (panelId: string, callback: (data: string) => void) => () => void
      onTerminalExit: (
        panelId: string,
        callback: (exitInfo: { code: number; signal?: number }) => void
      ) => () => void
      onTelemetry: (callback: (data: TelemetryPayload) => void) => () => void
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      isWindowMaximized: () => Promise<boolean>
    }
  }
}

export { AppSettings, AppState, PanelConfig, ProcessMetrics, SidebarPosition, SpawnOptions, SystemMetrics, TelemetryPayload, Workspace }
