import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

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

const defaultState: AppState = {
  activeWorkspaceId: '',
  settings: {
    sidebarPosition: 'left'
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
      writeFileSync(this.configPath, JSON.stringify(state, null, 2), 'utf-8')
      return true
    } catch (err) {
      console.error('Failed to save workspaces state:', err)
      return false
    }
  }
}
