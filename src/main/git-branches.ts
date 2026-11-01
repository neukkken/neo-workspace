import { execFile } from 'child_process'
import * as fs from 'fs'
import { basename, join } from 'path'

export interface GitBranchInfo {
  name: string
  branch: string
}

const readBranch = (dir: string): Promise<string | null> =>
  new Promise((resolve) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: dir, timeout: 3000, windowsHide: true },
      (err, stdout) => resolve(err ? null : stdout.trim())
    )
  })

// A folder is a repo itself, or holds repos one level down (the workspace's projects)
export const findRepos = (folder: string): string[] => {
  if (!fs.existsSync(folder)) return []
  if (fs.existsSync(join(folder, '.git'))) return [folder]
  try {
    return fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(join(folder, entry.name, '.git')))
      .map((entry) => join(folder, entry.name))
  } catch {
    return []
  }
}

export const readGitBranches = async (folders: string[]): Promise<GitBranchInfo[]> => {
  const repos = [...new Set(folders.filter((f) => f).flatMap(findRepos))]
  const results = await Promise.all(
    repos.map(async (dir) => ({ name: basename(dir), branch: await readBranch(dir) }))
  )
  return results.filter((r): r is GitBranchInfo => r.branch !== null)
}
