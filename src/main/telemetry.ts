import pidusage from 'pidusage'
import { freemem, totalmem, cpus } from 'os'
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

const readCpuTimes = (): { idle: number; total: number } =>
  cpus().reduce(
    (sum, { times }) => ({
      idle: sum.idle + times.idle,
      total: sum.total + times.user + times.nice + times.sys + times.idle + times.irq
    }),
    { idle: 0, total: 0 }
  )

export class TelemetryMonitor {
  private timer: NodeJS.Timeout | null = null
  private collecting = false
  private lastCpu = readCpuTimes()

  constructor(
    private ptyManager: PtyManager,
    private onUpdate: (data: TelemetryPayload) => void
  ) {}

  public start(intervalMs = 2000): void {
    if (this.timer) return

    this.timer = setInterval(async () => {
      // Each read starts a PowerShell on Windows; never stack them on a busy machine
      if (this.collecting) return
      this.collecting = true
      await this.collect()
      this.collecting = false
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

    let stats: Awaited<ReturnType<typeof pidusage>> = {}
    try {
      if (pidsMap.size > 0) stats = await pidusage([...pidsMap.values()])
    } catch {
      // All processes exited or none is tracked yet
    }

    for (const [panelId, pid] of pidsMap.entries()) {
      const stat = stats[pid]
      panelsMetrics[panelId] = {
        cpu: stat ? Math.round(stat.cpu * 10) / 10 : 0,
        memoryMb: stat ? Math.round((stat.memory / (1024 * 1024)) * 10) / 10 : 0
      }
    }

    // System overview
    const totalMem = totalmem()
    const freeMem = freemem()
    const usedMemMb = Math.round((totalMem - freeMem) / (1024 * 1024))
    const totalMemMb = Math.round(totalMem / (1024 * 1024))

    // loadavg() is always 0 on Windows, so compare CPU times between reads instead
    const cpuNow = readCpuTimes()
    const cpuSpent = cpuNow.total - this.lastCpu.total
    const cpuPercent = cpuSpent > 0 ? Math.round((1 - (cpuNow.idle - this.lastCpu.idle) / cpuSpent) * 100) : 0
    this.lastCpu = cpuNow

    this.onUpdate({
      system: {
        cpuPercent,
        usedMemMb,
        totalMemMb
      },
      panels: panelsMetrics
    })
  }
}
