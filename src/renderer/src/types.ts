export interface PanelConfig {
  id: string
  title: string
  cwd: string
  command: string
  commands?: string[]
  autoStart: boolean
  env?: Record<string, string>
}

export type NodeKind = 'terminal' | 'browser' | 'note' | 'explorer' | 'port-monitor' | 'vscode' | 'git'

export interface WorkspaceTime {
  elapsedMs: number
  totalMs: number
  weekMs: number
  paused: boolean
}

export type NoteColor = 'emerald' | 'amber' | 'cyan' | 'purple' | 'zinc'

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
  shell?: string
  command?: string
  commands?: string[]
  autoStart?: boolean
  env?: Record<string, string>
  notifyMuted?: boolean
  // For browser kind:
  url?: string
  // For note kind:
  noteContent?: string
  noteColor?: NoteColor
  // For explorer kind:
  explorerPath?: string
  // For port-monitor kind:
  monitoredPorts?: number[]
  // For vscode kind:
  vscodeMode?: 'local' | 'web' | 'custom'
  vscodeUrl?: string
  vscodePort?: number
  vscodePath?: string
}

export interface CanvasConnector {
  id: string
  fromId: string
  toId: string
  label?: string
  color?: string
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  extension?: string
}

export interface ProjectInspection {
  name?: string
  type: string
  suggestedCommands: Array<{ label: string; command: string }>
  hasNeoworkConfig: boolean
}

export interface PortStatus {
  port: number
  isOpen: boolean
  label?: string
}

export type WorkspaceLayoutMode = 'grid' | 'canvas'

export interface Workspace {
  id: string
  name: string
  code: string
  panels: PanelConfig[]
  layoutMode?: WorkspaceLayoutMode
  canvasCards?: CanvasCard[]
  canvasConnectors?: CanvasConnector[]
}

export type SidebarPosition = 'left' | 'right' | 'top' | 'bottom'

export type TerminalThemeName = 'midnight' | 'matrix' | 'dracula' | 'tokyo' | 'monokai' | 'nord'

export interface AppSettings {
  sidebarPosition: SidebarPosition
  terminalTheme?: TerminalThemeName
  terminalFontSize?: number
  wallpaper?: string
  wallpaperAppearance?: Record<string, { islandOpacity?: number; islandBlur?: number }>
  islandScale?: number
  islandOpacity?: number
  islandBlur?: number
  railHeight?: number
  defaultShell?: string
}

export interface AppState {
  activeWorkspaceId: string
  workspaces: Workspace[]
  settings?: AppSettings
}

export interface SessionFile {
  path: string
  status: string
  added: number | null
  removed: number | null
}

export interface SessionChanges {
  repo: string
  name: string
  branch: string
  hasBaseline: boolean
  commits: { hash: string; subject: string }[]
  files: SessionFile[]
  truncated: boolean
}

export interface AgentStatus {
  panelId: string
  state: 'working' | 'done' | 'exited' | 'stopped'
  startedAt: number | null
  exitCode?: number
  workspaceId: string
  workspaceName: string
  title: string
  at: number
  notify: boolean
  log: boolean
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
