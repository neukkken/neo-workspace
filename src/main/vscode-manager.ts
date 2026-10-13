import { spawn, ChildProcess } from 'child_process'
import * as net from 'net'
import * as fs from 'fs'

interface VSCodeServerInstance {
  folderPath: string
  port: number
  url: string
  process: ChildProcess
}

export class VSCodeManager {
  private instances = new Map<number, VSCodeServerInstance>()
  private isCodeAvailable: boolean | null = null

  public async checkInstalled(): Promise<boolean> {
    if (this.isCodeAvailable !== null) {
      return this.isCodeAvailable
    }
    return new Promise((resolve) => {
      try {
        const cmd = process.platform === 'win32' ? 'where' : 'which'
        const child = spawn(cmd, ['code'])
        child.on('close', (code) => {
          this.isCodeAvailable = code === 0
          resolve(this.isCodeAvailable)
        })
        child.on('error', () => {
          this.isCodeAvailable = false
          resolve(false)
        })
      } catch {
        this.isCodeAvailable = false
        resolve(false)
      }
    })
  }

  private async getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.unref()
      server.on('error', reject)
      server.listen(0, () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 8000
        server.close(() => resolve(port))
      })
    })
  }

  public async startServer(
    folderPath?: string
  ): Promise<{ success: boolean; url?: string; port?: number; error?: string }> {
    const installed = await this.checkInstalled()
    if (!installed) {
      return {
        success: false,
        error: 'El ejecutable de Visual Studio Code ("code") no se encuentra en el PATH del sistema.'
      }
    }

    const cleanFolder = folderPath && fs.existsSync(folderPath) ? folderPath : process.cwd()

    // Check if a server is already running for this folder
    for (const inst of this.instances.values()) {
      if (inst.folderPath === cleanFolder) {
        return {
          success: true,
          url: inst.url,
          port: inst.port
        }
      }
    }

    try {
      const port = await this.getFreePort()
      const args = [
        'serve-web',
        '--port',
        port.toString(),
        '--without-connection-token',
        '--accept-server-license-terms',
        '--disable-telemetry',
        '--default-folder',
        cleanFolder
      ]

      const child = spawn('code', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      })

      return new Promise((resolve) => {
        let isResolved = false
        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true
            // If it hasn't outputted yet, we still return the url as it typically starts within 1-2s
            const url = `http://127.0.0.1:${port}`
            this.instances.set(port, {
              folderPath: cleanFolder,
              port,
              url,
              process: child
            })
            resolve({ success: true, url, port })
          }
        }, 3500)

        const onData = (data: Buffer): void => {
          const str = data.toString()
          if (str.includes('Web UI available at') || str.includes('http://')) {
            clearTimeout(timeout)
            if (!isResolved) {
              isResolved = true
              const url = `http://127.0.0.1:${port}`
              this.instances.set(port, {
                folderPath: cleanFolder,
                port,
                url,
                process: child
              })
              resolve({ success: true, url, port })
            }
          }
        }

        child.stdout?.on('data', onData)
        child.stderr?.on('data', onData)

        child.on('error', (err) => {
          clearTimeout(timeout)
          if (!isResolved) {
            isResolved = true
            resolve({ success: false, error: err.message })
          }
        })

        child.on('close', () => {
          this.instances.delete(port)
        })
      })
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error al iniciar el servidor de VS Code'
      }
    }
  }

  public async stopServer(port?: number): Promise<boolean> {
    if (port && this.instances.has(port)) {
      const inst = this.instances.get(port)!
      try {
        inst.process.kill()
      } catch {}
      this.instances.delete(port)
      return true
    } else if (!port) {
      this.cleanupAll()
      return true
    }
    return false
  }

  public async openDesktop(folderPath?: string): Promise<boolean> {
    const installed = await this.checkInstalled()
    if (!installed) {
      return false
    }

    const cleanFolder = folderPath && fs.existsSync(folderPath) ? folderPath : '.'
    try {
      const child = spawn('code', [cleanFolder], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      return true
    } catch {
      return false
    }
  }

  public cleanupAll(): void {
    for (const inst of this.instances.values()) {
      try {
        inst.process.kill()
      } catch {}
    }
    this.instances.clear()
  }
}
