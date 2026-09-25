import * as pty from 'node-pty'
import { existsSync } from 'fs'
import { homedir } from 'os'

export interface SpawnOptions {
  panelId: string
  cwd: string
  command?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export class PtyManager {
  private terminals = new Map<string, pty.IPty>()

  private getShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'powershell.exe'
    }
    return process.env.SHELL || '/bin/bash'
  }

  public spawn(
    options: SpawnOptions,
    onData: (data: string) => void,
    onExit: (code: number, signal?: number) => void
  ): boolean {
    this.kill(options.panelId)

    let workingDir = options.cwd?.trim()
    let dirExists = true

    if (!workingDir || !existsSync(workingDir)) {
      workingDir = homedir()
      dirExists = false
    }

    const shell = this.getShell()
    const cols = options.cols && options.cols > 0 ? options.cols : 80
    const rows = options.rows && options.rows > 0 ? options.rows : 24

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: workingDir,
        env: {
          ...process.env,
          ...(options.env || {}),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        } as Record<string, string>
      })

      this.terminals.set(options.panelId, ptyProcess)

      ptyProcess.onData((data) => {
        onData(data)
      })

      ptyProcess.onExit(({ exitCode, signal }) => {
        this.terminals.delete(options.panelId)
        onExit(exitCode, signal)
      })

      if (!dirExists && options.cwd) {
        setTimeout(() => {
          onData(`\r\n\x1b[33m[NeoWork]: Configured path '${options.cwd}' not found. Defaulted to '${workingDir}'.\x1b[0m\r\n`)
        }, 80)
      }

      const cmd = options.command?.trim()
      if (cmd && cmd.length > 0) {
        setTimeout(() => {
          if (this.terminals.has(options.panelId)) {
            ptyProcess.write(`${cmd}\n`)
          }
        }, 400)
      }

      return true
    } catch (err) {
      console.error(`Failed to spawn terminal for panel ${options.panelId}:`, err)
      onData(`\r\n\x1b[31m[NeoWork Error]: Could not launch shell: ${err}\x1b[0m\r\n`)
      return false
    }
  }

  public write(panelId: string, data: string): void {
    const term = this.terminals.get(panelId)
    if (term) {
      term.write(data)
    }
  }

  public resize(panelId: string, cols: number, rows: number): void {
    const term = this.terminals.get(panelId)
    if (term && cols > 0 && rows > 0) {
      try {
        term.resize(cols, rows)
      } catch (err) {
        console.error(`Error resizing terminal ${panelId}:`, err)
      }
    }
  }

  public kill(panelId: string): void {
    const term = this.terminals.get(panelId)
    if (term) {
      try {
        term.kill()
      } catch (err) {
        console.error(`Error killing terminal ${panelId}:`, err)
      }
      this.terminals.delete(panelId)
    }
  }

  public killAll(): void {
    for (const [panelId, term] of this.terminals.entries()) {
      try {
        term.kill()
      } catch (err) {
        console.error(`Error killing terminal ${panelId}:`, err)
      }
    }
    this.terminals.clear()
  }

  public getPids(): Map<string, number> {
    const pids = new Map<string, number>()
    for (const [panelId, term] of this.terminals.entries()) {
      pids.set(panelId, term.pid)
    }
    return pids
  }
}
