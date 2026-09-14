import pidusage from 'pidusage'
import { freemem, totalmem, loadavg, cpus } from 'os'
import { PtyManager } from './pty-manager'

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

export class TelemetryMonitor {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private ptyManager: PtyManager,
    private onUpdate: (data: TelemetryPayload) => void
  ) {}

  public start(intervalMs = 2000): void {
    if (this.timer) return

    this.timer = setInterval(async () => {
      await this.collect()
    }, intervalMs)
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async collect(): Promise<void> {
    const pidsMap = this.ptyManager.getPids()
    const panelsMetrics: Record<string, ProcessMetrics> = {}

    for (const [panelId, pid] of pidsMap.entries()) {
      try {
        const stats = await pidusage(pid)
        panelsMetrics[panelId] = {
          cpu: Math.round(stats.cpu * 10) / 10,
          memoryMb: Math.round((stats.memory / (1024 * 1024)) * 10) / 10
        }
      } catch {
        // Process might have exited or is not yet tracked
        panelsMetrics[panelId] = {
          cpu: 0,
          memoryMb: 0
        }
      }
    }

    // System overview
    const totalMem = totalmem()
    const freeMem = freemem()
    const usedMemMb = Math.round((totalMem - freeMem) / (1024 * 1024))
    const totalMemMb = Math.round(totalMem / (1024 * 1024))

    const cpuList = cpus()
    const avgLoad = loadavg()[0]
    const cpuPercent = Math.min(100, Math.round((avgLoad / (cpuList.length || 1)) * 100))

    this.onUpdate({
      system: {
        cpuPercent: Math.max(1, cpuPercent),
        usedMemMb,
        totalMemMb
      },
      panels: panelsMetrics
    })
  }
}
