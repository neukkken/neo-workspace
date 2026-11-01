import pidusage from 'pidusage'
import { execFile } from 'child_process'
import { freemem, totalmem, cpus } from 'os'
import { promisify } from 'util'
import { PtyManager } from './pty-manager'
import { measureTree, parseProcessList, ProcessSample } from './process-tree'

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

const LIST_PROCESSES =
  "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime | ForEach-Object { '{0} {1} {2} {3}' -f $_.ProcessId,$_.ParentProcessId,$_.WorkingSetSize,($_.KernelModeTime+$_.UserModeTime) }"

const run = promisify(execFile)

const listProcesses = async (): Promise<ProcessSample[]> => {
  const { stdout } = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', LIST_PROCESSES], {
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024
  })
  return parseProcessList(stdout)
}

export class TelemetryMonitor {
  private timer: NodeJS.Timeout | null = null
  private collecting = false
  private lastCpu = readCpuTimes()
  private lastProcessCpuMs = new Map<number, number>()
  private lastProcessReadAt = 0

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

  private async measureTrees(pids: Map<string, number>): Promise<Record<string, ProcessMetrics>> {
    const metrics: Record<string, ProcessMetrics> = {}
    try {
      const processes = await listProcesses()
      const now = Date.now()
      for (const [panelId, pid] of pids) {
        metrics[panelId] = measureTree(pid, processes, this.lastProcessCpuMs, now - this.lastProcessReadAt)
      }
      this.lastProcessCpuMs = new Map(processes.map((p) => [p.pid, p.cpuMs]))
      this.lastProcessReadAt = now
    } catch (err) {
      console.warn('[Telemetry] Could not list processes:', err)
    }
    return metrics
  }

  // shortcut: only the shell itself outside Windows, list the tree with `ps` when that matters
  private async measureShells(pids: Map<string, number>): Promise<Record<string, ProcessMetrics>> {
    const metrics: Record<string, ProcessMetrics> = {}
    let stats: Awaited<ReturnType<typeof pidusage>> = {}
    try {
      if (pids.size > 0) stats = await pidusage([...pids.values()])
    } catch {
      // All processes exited or none is tracked yet
    }

    for (const [panelId, pid] of pids.entries()) {
      const stat = stats[pid]
      metrics[panelId] = {
        cpu: stat ? Math.round(stat.cpu * 10) / 10 : 0,
        memoryMb: stat ? Math.round((stat.memory / (1024 * 1024)) * 10) / 10 : 0
      }
    }
    return metrics
  }

  private async collect(): Promise<void> {
    const pidsMap = this.ptyManager.getPids()
    let panelsMetrics: Record<string, ProcessMetrics> = {}
    if (pidsMap.size > 0) {
      panelsMetrics = process.platform === 'win32' ? await this.measureTrees(pidsMap) : await this.measureShells(pidsMap)
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
