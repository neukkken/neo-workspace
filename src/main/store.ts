import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface PanelConfig {
  id: string
  title: string
  cwd: string
  command: string
  autoStart: boolean
}

export type NodeKind = 'terminal' | 'browser' | 'note' | 'explorer' | 'port-monitor' | 'vscode' | 'git'

export interface CanvasCard {
  id: string
  kind: NodeKind
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex?: number
  cwd?: string
  command?: string
  autoStart?: boolean
  url?: string
  notifyMuted?: boolean
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
  /** Legacy inline image; migrated to the wallpaper folder at startup */
  canvasBackground?: string
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

const defaultState: AppState = {
  activeWorkspaceId: '',
  settings: {
    sidebarPosition: 'right'
  },
  workspaces: []
}

export class StoreManager {
  private configPath: string

  constructor() {
    const userData = app.getPath('userData')
    this.configPath = join(userData, 'neo-workspaces.json')
  }

  public getState(): AppState {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw) as AppState
        if (Array.isArray(parsed.workspaces)) {
          return parsed
        }
      }
    } catch (err) {
      console.error('Failed to load workspaces state:', err)
    }
    return defaultState
  }

  public saveState(state: AppState): boolean {
    try {
      // Write then swap, so a crash mid-save can't leave a truncated config
      const tmp = `${this.configPath}.tmp`
      writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
      renameSync(tmp, this.configPath)
      return true
    } catch (err) {
      console.error('Failed to save workspaces state:', err)
      return false
    }
  }
}
