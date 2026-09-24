export interface PanelConfig {
  id: string
  title: string
  cwd: string
  command: string
  autoStart: boolean
}

export type NodeKind = 'terminal' | 'browser'

export interface CanvasCard {
  id: string
  kind: NodeKind
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex?: number
  // For terminal kind:
  cwd?: string
  command?: string
  autoStart?: boolean
  // For browser kind:
  url?: string
}

export type WorkspaceLayoutMode = 'grid' | 'canvas'

export interface Workspace {
  id: string
  name: string
  code: string
  panels: PanelConfig[]
  layoutMode?: WorkspaceLayoutMode
  canvasCards?: CanvasCard[]
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
