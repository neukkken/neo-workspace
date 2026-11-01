import { execFile } from 'child_process'
import { basename } from 'path'

export interface SessionFile {
  path: string
  // git's letter (A, M, D, T), or U for a file created this session that git doesn't track
  status: string
  added: number | null
  removed: number | null
}

export interface SessionChanges {
  repo: string
  name: string
  branch: string
  hasBaseline: boolean
  commits: { hash: string; subject: string }[]
  files: SessionFile[]
  truncated: boolean
}

interface Baseline {
  commit: string
  head: string
  untracked: Set<string>
}

const MAX_FILES = 1000
const MAX_COMMITS = 50

// Agents run git at the same time: no optional locks, or polling collides with their index.lock.
// fsmonitor and external diff would run commands from the repo's own config
const git = (repo: string, args: string[], okCodes: number[] = [0]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', ...args],
      { cwd: repo, timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err && !okCodes.includes(typeof err.code === 'number' ? err.code : -1)) reject(err)
        else resolve(stdout)
      }
    )
  })

const splitNul = (output: string): string[] => output.split('\0').filter(Boolean)

const listUntracked = async (repo: string): Promise<string[]> =>
  splitNul(await git(repo, ['ls-files', '-z', '--others', '--exclude-standard']))

const captureBaseline = async (repo: string): Promise<Baseline | null> => {
  try {
    const head = (await git(repo, ['rev-parse', 'HEAD'])).trim()
    // A commit of the dirty tree with no ref: touches neither the files, the index nor the stash list.
    // Empty when the tree is clean, and it refuses during a merge; HEAD is the baseline then
    const dirty = (await git(repo, ['stash', 'create']).catch(() => '')).trim()
    return { commit: dirty || head, head, untracked: new Set(await listUntracked(repo)) }
  } catch {
    // No commits yet, or not usable as a repo
    return null
  }
}

export class GitSession {
  private baselines = new Map<string, Promise<Baseline | null>>()

  public ensureBaseline(repo: string): Promise<Baseline | null> {
    let baseline = this.baselines.get(repo)
    if (!baseline) {
      baseline = captureBaseline(repo)
      this.baselines.set(repo, baseline)
    }
    return baseline
  }

  public async reset(repo: string): Promise<Baseline | null> {
    if (!this.baselines.has(repo)) return null
    this.baselines.delete(repo)
    return this.ensureBaseline(repo)
  }

  private async listFiles(repo: string, base: Baseline): Promise<SessionFile[]> {
    const diffArgs = ['diff', '--no-ext-diff', '--no-renames', '-z']
    const [statuses, numstat, untracked] = await Promise.all([
      git(repo, [...diffArgs, '--name-status', base.commit]),
      git(repo, [...diffArgs, '--numstat', base.commit]),
      listUntracked(repo)
    ])

    const counts = new Map<string, [number | null, number | null]>()
    for (const line of splitNul(numstat)) {
      const [added, removed, ...path] = line.split('\t')
      // Binary files report "-" instead of line counts
      counts.set(path.join('\t'), [added === '-' ? null : Number(added), removed === '-' ? null : Number(removed)])
    }

    const fields = splitNul(statuses)
    const files: SessionFile[] = []
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const [added, removed] = counts.get(fields[i + 1]) ?? [null, null]
      files.push({ path: fields[i + 1], status: fields[i], added, removed })
    }
    // shortcut: a file untracked since before the session is skipped even if edited since; a snapshot of it would be needed to diff it
    for (const path of untracked) {
      if (!base.untracked.has(path)) files.push({ path, status: 'U', added: null, removed: null })
    }
    return files
  }

  // Null for a repo no terminal or card has opened: the renderer can't reach arbitrary folders
  public async changes(repo: string): Promise<SessionChanges | null> {
    if (!this.baselines.has(repo)) return null
    const base = await this.ensureBaseline(repo)
    const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
    const summary = { repo, name: basename(repo), branch, hasBaseline: base !== null }
    if (!base) return { ...summary, commits: [], files: [], truncated: false }

    const [files, log] = await Promise.all([
      this.listFiles(repo, base),
      git(repo, ['log', `-${MAX_COMMITS}`, '--format=%h%x09%s', `${base.head}..HEAD`])
    ])
    const commits = log
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...subject] = line.split('\t')
        return { hash, subject: subject.join('\t') }
      })
    return { ...summary, commits, files: files.slice(0, MAX_FILES), truncated: files.length > MAX_FILES }
  }

  // Only files the current listing reports: `--no-index` would otherwise read any path on disk
  public async fileDiff(repo: string, file: string): Promise<string | null> {
    if (!this.baselines.has(repo)) return null
    const base = await this.ensureBaseline(repo)
    if (!base) return null
    const entry = (await this.listFiles(repo, base)).find((f) => f.path === file)
    if (!entry) return null
    const args = ['diff', '--no-ext-diff', '--no-color', '--no-renames']
    return entry.status === 'U'
      ? git(repo, [...args, '--no-index', '--', '/dev/null', file], [0, 1])
      : git(repo, [...args, base.commit, '--', file])
  }
}
