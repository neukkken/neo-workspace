import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { posix, win32 } from 'path'

export interface ShellInfo {
  id: string
  label: string
  path: string
  args: string[]
}

export interface ShellProbe {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  exists: (path: string) => boolean
  hasWslDistro: (wslPath: string) => boolean
  readEtcShells: () => string
}

// wsl.exe ships with Windows even when nothing is installed behind it
const hasWslDistro = (wslPath: string): boolean => {
  try {
    const list = execFileSync(wslPath, ['-l', '-q'], { encoding: 'utf16le', timeout: 3000, windowsHide: true })
    return list.trim().length > 0
  } catch {
    return false
  }
}

const readEtcShells = (): string => {
  try {
    return readFileSync('/etc/shells', 'utf-8')
  } catch {
    return ''
  }
}

const windowsShells = ({ env, exists, hasWslDistro }: ShellProbe): ShellInfo[] => {
  const system32 = win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32')
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const onPath = (file: string): string[] =>
    (env.PATH ?? '').split(';').filter(Boolean).map((dir) => win32.join(dir, file))

  // git.exe lives in <root>\cmd or <root>\bin; bash sits next to them
  const gitRoots = onPath('git.exe').filter(exists).map((git) => win32.dirname(win32.dirname(git)))
  const bashPaths = [...gitRoots, win32.join(programFiles, 'Git')].flatMap((root) => [
    win32.join(root, 'bin', 'bash.exe'),
    win32.join(root, 'usr', 'bin', 'bash.exe')
  ])
  const wsl = win32.join(system32, 'wsl.exe')

  const candidates: Array<Omit<ShellInfo, 'path'> & { paths: string[] }> = [
    {
      id: 'cmd',
      label: 'Símbolo del sistema (cmd)',
      paths: [env.COMSPEC ?? '', win32.join(system32, 'cmd.exe')],
      args: []
    },
    {
      id: 'powershell',
      label: 'Windows PowerShell',
      paths: [win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe')],
      args: ['-NoLogo']
    },
    {
      id: 'pwsh',
      label: 'PowerShell 7',
      paths: [...onPath('pwsh.exe'), win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe')],
      args: ['-NoLogo']
    },
    { id: 'git-bash', label: 'Git Bash', paths: bashPaths, args: ['--login', '-i'] },
    { id: 'wsl', label: 'WSL', paths: exists(wsl) && hasWslDistro(wsl) ? [wsl] : [], args: [] }
  ]

  return candidates.flatMap(({ paths, ...shell }) => {
    const path = paths.find((p) => p && exists(p))
    return path ? [{ ...shell, path }] : []
  })
}

const unixShells = ({ env, exists, readEtcShells }: ShellProbe): ShellInfo[] => {
  const listed = readEtcShells()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/'))
  const byName = new Map<string, string>()
  for (const path of [env.SHELL ?? '', ...listed]) {
    const name = posix.basename(path)
    if (path && exists(path) && !byName.has(name)) byName.set(name, path)
  }
  return [...byName].map(([name, path]) => ({ id: name, label: name, path, args: [] }))
}

// The first entry is the default. There is always at least one, so spawning never has nothing to run
export const detectShells = (probe: Partial<ShellProbe> = {}): ShellInfo[] => {
  const full: ShellProbe = {
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    hasWslDistro,
    readEtcShells,
    ...probe
  }
  const isWindows = full.platform === 'win32'
  const shells = isWindows ? windowsShells(full) : unixShells(full)
  return shells.length > 0
    ? shells
    : [{ id: 'system', label: 'Sistema', path: isWindows ? 'cmd.exe' : '/bin/sh', args: [] }]
}

// Ids come from the renderer and the config: only ever matched, never used as a path
export const resolveShell = (shells: ShellInfo[], requested?: string): ShellInfo =>
  shells.find((shell) => shell.id === requested) ?? shells[0]
