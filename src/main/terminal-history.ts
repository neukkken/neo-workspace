import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

// Panel ids reach the disk as file names, and they come from the renderer
const SAFE_ID = /^[\w-]+$/

// What must not run again. Queries would make the terminal answer into the new shell as if
// typed; modes (alt screen, mouse, bracketed paste) belonged to programs that are gone
const LIVE_SEQUENCES = [
  /\x1bP[\s\S]*?\x1b\\/g, // DCS: capability and setting queries
  /\x1b\]\d+;[^\x07\x1b]*\?(?:\x07|\x1b\\)/g, // OSC queries: colours, clipboard
  /\x1b\[[?>=]?[\d;]*[cn]/g, // device attributes and cursor position
  /\x1b\[\??\d+\$p/g, // mode queries
  /\x1b\[[\d;]*t/g, // window size and title queries
  /\x1b\[\?[\d;]+[hl]/g // private modes
]

export const cleanForReplay = (text: string): string =>
  LIVE_SEQUENCES.reduce((clean, sequence) => clean.replace(sequence, ''), text)

export class TerminalHistory {
  private dir: string
  private taken = new Set<string>()

  constructor(dir: string) {
    this.dir = dir
  }

  private file(panelId: string): string | null {
    return SAFE_ID.test(panelId) ? join(this.dir, `${panelId}.log`) : null
  }

  public save(panelId: string, text: string): void {
    const file = this.file(panelId)
    if (!file) return
    try {
      mkdirSync(this.dir, { recursive: true })
      // Write then swap, so a crash mid-save keeps the previous history
      writeFileSync(`${file}.tmp`, text, 'utf-8')
      renameSync(`${file}.tmp`, file)
    } catch (err) {
      console.error('Failed to save terminal history:', err)
    }
  }

  // Only the first start of a panel in each run gets its past back; a restart keeps the live one
  public take(panelId: string): string {
    const file = this.file(panelId)
    if (!file || this.taken.has(panelId)) return ''
    this.taken.add(panelId)
    try {
      return cleanForReplay(readFileSync(file, 'utf-8'))
    } catch {
      return ''
    }
  }

  public prune(keep: Set<string>): void {
    try {
      for (const name of readdirSync(this.dir)) {
        if (!keep.has(name.replace(/\.log(\.tmp)?$/, ''))) rmSync(join(this.dir, name), { force: true })
      }
    } catch {
      // No history saved yet
    }
  }
}
