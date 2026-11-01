export type AgentState = 'working' | 'done' | 'exited' | 'stopped'

export interface AgentChange {
  panelId: string
  state: AgentState
  startedAt: number | null
  exitCode?: number
}

interface PanelActivity {
  startedAt: number | null
  lastOutputAt: number
  working: boolean
  titled: boolean
}

// Without a title signal: sustained output followed by silence. Long enough that
// a directory listing or a server logging now and then doesn't count as work
export const MIN_BUSY_MS = 15000
export const QUIET_MS = 6000

// Agents that animate the terminal title report their state exactly, so short turns count too.
// Claude Code alternates ◐ ◑ while working and shows ✳ when it's free
const SPINNER_TITLE = /^[◐◑◒◓⠀-⣿]/
const IDLE_TITLE = /^✳/
const TITLE_OSC = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g

const lastTitle = (data: string): string | undefined =>
  data.includes('\x1b]') ? [...data.matchAll(TITLE_OSC)].at(-1)?.[1] : undefined

export class AgentActivity {
  private panels = new Map<string, PanelActivity>()
  private onChange: (change: AgentChange) => void

  constructor(onChange: (change: AgentChange) => void) {
    this.onChange = onChange
  }

  private panel(panelId: string): PanelActivity {
    let panel = this.panels.get(panelId)
    if (!panel) {
      panel = { startedAt: null, lastOutputAt: 0, working: false, titled: false }
      this.panels.set(panelId, panel)
    }
    return panel
  }

  private begin(panelId: string, panel: PanelActivity, now: number): void {
    panel.startedAt ??= now
    if (panel.working) return
    panel.working = true
    this.onChange({ panelId, state: 'working', startedAt: panel.startedAt })
  }

  private finish(panelId: string, panel: PanelActivity): void {
    if (panel.working) this.onChange({ panelId, state: 'done', startedAt: panel.startedAt })
    panel.working = false
    panel.startedAt = null
  }

  public onOutput(panelId: string, data: string, now: number): void {
    const panel = this.panel(panelId)
    panel.lastOutputAt = now

    const title = lastTitle(data)
    if (title !== undefined && SPINNER_TITLE.test(title)) {
      // Whatever ran before the agent spoke up wasn't its work
      if (!panel.titled) panel.startedAt = null
      panel.titled = true
      this.begin(panelId, panel, now)
    } else if (title !== undefined && (panel.titled || IDLE_TITLE.test(title))) {
      // ✳ means the agent is still open, so its screen redraws aren't work either
      panel.titled = IDLE_TITLE.test(title)
      this.finish(panelId, panel)
    }
    if (panel.titled) return

    panel.startedAt ??= now
    if (now - panel.startedAt >= MIN_BUSY_MS) this.begin(panelId, panel, now)
  }

  // Keystrokes echo back as output; only Enter can start real work
  public onInput(panelId: string, data: string): void {
    const panel = this.panels.get(panelId)
    if (panel && !panel.working && !data.includes('\r')) panel.startedAt = null
  }

  // Also the safety net for titled agents: a title split across two chunks can't leave one stuck
  public tick(now: number): void {
    for (const [panelId, panel] of this.panels) {
      if (panel.startedAt !== null && now - panel.lastOutputAt >= QUIET_MS) this.finish(panelId, panel)
    }
  }

  public onExit(panelId: string, exitCode: number): void {
    const startedAt = this.panels.get(panelId)?.startedAt ?? null
    this.panels.delete(panelId)
    this.onChange({ panelId, state: 'exited', startedAt, exitCode })
  }

  public workingPanels(): string[] {
    return [...this.panels].filter(([, panel]) => panel.working).map(([panelId]) => panelId)
  }

  // The user killed or restarted it: nothing to report as finished
  public forget(panelId: string): void {
    const panel = this.panels.get(panelId)
    this.panels.delete(panelId)
    if (panel?.working) this.onChange({ panelId, state: 'stopped', startedAt: panel.startedAt })
  }
}
