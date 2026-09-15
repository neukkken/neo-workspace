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
  activeWorkspaceId: 'efastack',
  settings: {
    sidebarPosition: 'left'
  },
  workspaces: [
    {
      id: 'efastack',
      name: 'EFAStack',
      code: '01',
      panels: [
        {
          id: 'agent-process',
          title: 'AGENT-PROCESS',
          cwd: homedir(),
          command: 'python3 -c "import time; print(\'\\033[1;32m[INFO]\\033[0m Agent core initialized.\'); print(\'\\033[1;36m[STATUS]\\033[0m Listening for instructions...\'); time.sleep(0.5)" && echo "Ready."',
          autoStart: true
        },
        {
          id: 'frontend-dev',
          title: 'FRONTEND-DEV',
          cwd: homedir(),
          command: 'npm --version',
          autoStart: true
        },
        {
          id: 'git-console',
          title: 'GIT-CONSOLE',
          cwd: homedir(),
          command: 'git status',
          autoStart: true
        },
        {
          id: 'docker-service',
          title: 'DOCKER-SERVICE',
          cwd: homedir(),
          command: 'docker ps || echo "Docker daemon ready"',
          autoStart: true
        }
      ]
    },
    {
      id: 'fantasybook',
      name: 'FantasyBook',
      code: '02',
      panels: [
        {
          id: 'fb-api',
          title: 'API-SERVER',
          cwd: homedir(),
          command: '',
          autoStart: false
        },
        {
          id: 'fb-client',
          title: 'CLIENT-APP',
          cwd: homedir(),
          command: '',
          autoStart: false
        }
      ]
    },
    {
      id: 'personal',
      name: 'Personal',
      code: '03',
      panels: [
        {
          id: 'pers-term1',
          title: 'DEV-SHELL',
          cwd: homedir(),
          command: '',
          autoStart: false
        }
      ]
    },
    {
      id: 'agent-dev',
      name: 'Agent-Dev',
      code: '04',
      panels: [
        {
          id: 'agent-runner',
          title: 'AGENT-RUNNER',
          cwd: homedir(),
          command: '',
          autoStart: false
        }
      ]
    }
  ]
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
        if (parsed.workspaces && parsed.workspaces.length > 0) {
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
