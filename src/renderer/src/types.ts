export interface PanelConfig {
  id: string
  title: string
  cwd: string
  command: string
  autoStart: boolean
}

export interface Workspace {
  id: string
  name: string
  code: string
  panels: PanelConfig[]
}

export type SidebarPosition = 'left' | 'right' | 'top' | 'bottom'

export interface AppSettings {
  sidebarPosition: SidebarPosition
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
