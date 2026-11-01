import { readFileSync, renameSync, writeFileSync } from 'fs'

export interface WorkspaceTime {
  elapsedMs: number
  totalMs: number
  weekMs: number
  paused: boolean
}

interface Banked {
  totalMs: number
  weekStart: number
  weekMs: number
}

interface Session {
  startedAt: number
  countedTo: number
  paused: boolean
}

// Running workspaces are banked every minute, so a longer gap means the computer slept
export const MAX_GAP_MS = 5 * 60 * 1000

// Monday 00:00, local time
export const weekStartOf = (at: number): number => {
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return day.getTime()
}

export class WorkspaceClock {
  private path: string
  private banked: Record<string, Banked> = {}
  private sessions = new Map<string, Session>()

  constructor(path: string) {
    this.path = path
    try {
      this.banked = JSON.parse(readFileSync(path, 'utf-8')) ?? {}
    } catch {
      // First run or a damaged file: counting restarts from zero
    }
  }

  public setRunning(ids: string[], now: number): void {
    const stopped = [...this.sessions.keys()].filter((id) => !ids.includes(id))
    for (const id of stopped) {
      this.bank(id, now)
      this.sessions.delete(id)
    }
    for (const id of ids) {
      if (!this.sessions.has(id)) this.sessions.set(id, { startedAt: now, countedTo: now, paused: false })
    }
    if (stopped.length > 0) this.save()
  }

  // A paused workspace stands still: neither the stopwatch nor its totals move
  public pauseWhere(isPaused: (id: string) => boolean, now: number): void {
    for (const [id, session] of this.sessions) {
      this.bank(id, now)
      session.paused = isPaused(id)
    }
  }

  // Run periodically, so a crash costs a minute at most
  public flush(now: number): void {
    if (this.sessions.size === 0) return
    for (const id of this.sessions.keys()) this.bank(id, now)
    this.save()
  }

  public read(id: string, now: number): WorkspaceTime {
    this.bank(id, now)
    const banked = this.banked[id]
    const session = this.sessions.get(id)
    return {
      elapsedMs: session ? now - session.startedAt : 0,
      totalMs: banked?.totalMs ?? 0,
      weekMs: banked?.weekStart === weekStartOf(now) ? banked.weekMs : 0,
      paused: session?.paused ?? false
    }
  }

  private bank(id: string, now: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    const gap = now - session.countedTo
    session.countedTo = now
    if (session.paused || gap < 0 || gap > MAX_GAP_MS) {
      session.startedAt += gap
      return
    }
    const banked = this.banked[id]
    const weekStart = weekStartOf(now)
    const weekMs = banked?.weekStart === weekStart ? banked.weekMs : 0
    this.banked[id] = {
      totalMs: (banked?.totalMs ?? 0) + gap,
      weekStart,
      weekMs: weekMs + now - Math.max(now - gap, weekStart)
    }
  }

  private save(): void {
    try {
      // Write then swap, so a crash mid-save can't leave a truncated file
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(this.banked), 'utf-8')
      renameSync(tmp, this.path)
    } catch (err) {
      console.error('Failed to save workspace time:', err)
    }
  }
}
