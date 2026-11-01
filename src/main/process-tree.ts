export interface ProcessSample {
  pid: number
  ppid: number
  memory: number
  cpuMs: number
}

// One process per line: pid, parent pid, bytes in memory, CPU time in 100 ns units
export const parseProcessList = (text: string): ProcessSample[] =>
  text.split(/\r?\n/).flatMap((line) => {
    const [pid, ppid, memory, cpu] = line.trim().split(/\s+/).map(Number)
    return Number.isFinite(cpu) ? [{ pid, ppid, memory, cpuMs: cpu / 10000 }] : []
  })

const round = (value: number): number => Math.round(value * 10) / 10

// A shell is mostly idle: what the terminal really spends is in the programs it started.
// `seen` because Windows reuses pids, so a dead parent's id can close a loop
export const measureTree = (
  rootPid: number,
  processes: ProcessSample[],
  lastCpuMs: Map<number, number>,
  elapsedMs: number
): { cpu: number; memoryMb: number } => {
  const pending = processes.filter((p) => p.pid === rootPid)
  const seen = new Set<number>()
  let memory = 0
  let spentMs = 0

  while (pending.length > 0) {
    const current = pending.pop()!
    if (seen.has(current.pid)) continue
    seen.add(current.pid)
    memory += current.memory
    spentMs += Math.max(0, current.cpuMs - (lastCpuMs.get(current.pid) ?? current.cpuMs))
    pending.push(...processes.filter((p) => p.ppid === current.pid))
  }

  return {
    cpu: elapsedMs > 0 ? round((spentMs / elapsedMs) * 100) : 0,
    memoryMb: round(memory / (1024 * 1024))
  }
}
