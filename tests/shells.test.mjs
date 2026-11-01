import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectShells, resolveShell } from '../src/main/shells.ts'

const windows = (present, extra = {}) =>
  detectShells({
    platform: 'win32',
    env: { COMSPEC: 'C:\\Windows\\System32\\cmd.exe', SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', PATH: '' },
    exists: (path) => present.includes(path),
    hasWslDistro: () => false,
    ...extra
  })

const CMD = 'C:\\Windows\\System32\\cmd.exe'
const WSL = 'C:\\Windows\\System32\\wsl.exe'

test('lists only the shells that exist, cmd first', () => {
  const ps = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  assert.deepEqual(windows([CMD, ps]).map((s) => s.id), ['cmd', 'powershell'])
})

test('finds PowerShell 7 on the PATH or in Program Files', () => {
  const inPath = 'D:\\tools\\pwsh.exe'
  const env = { COMSPEC: CMD, PATH: 'D:\\tools;;C:\\other' }
  assert.equal(windows([CMD, inPath], { env }).find((s) => s.id === 'pwsh').path, inPath)
  const installed = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
  assert.equal(windows([CMD, installed]).find((s) => s.id === 'pwsh').path, installed)
})

test('finds Git Bash next to a per-user git install', () => {
  const root = 'C:\\Users\\me\\AppData\\Local\\Programs\\Git'
  const env = { COMSPEC: CMD, PATH: `${root}\\cmd` }
  const bash = windows([CMD, `${root}\\cmd\\git.exe`, `${root}\\bin\\bash.exe`], { env }).find((s) => s.id === 'git-bash')
  assert.equal(bash.path, `${root}\\bin\\bash.exe`)
  assert.deepEqual(bash.args, ['--login', '-i'])
})

test('skips the wsl.exe stub when no distribution is installed', () => {
  assert.ok(!windows([CMD, WSL]).some((s) => s.id === 'wsl'))
  assert.ok(windows([CMD, WSL], { hasWslDistro: () => true }).some((s) => s.id === 'wsl'))
})

test('reads /etc/shells on Unix, $SHELL first and one entry per name', () => {
  const shells = detectShells({
    platform: 'linux',
    env: { SHELL: '/usr/bin/zsh' },
    exists: (path) => path !== '/bin/missing',
    readEtcShells: () => '# comment\n/bin/bash\n/usr/bin/bash\n/usr/bin/zsh\n/bin/missing\n'
  })
  assert.deepEqual(shells.map((s) => s.path), ['/usr/bin/zsh', '/bin/bash'])
})

test('always has something to run', () => {
  assert.equal(detectShells({ platform: 'win32', env: {}, exists: () => false, hasWslDistro: () => false })[0].path, 'cmd.exe')
  assert.equal(detectShells({ platform: 'linux', env: {}, exists: () => false, readEtcShells: () => '' })[0].path, '/bin/sh')
})

test('an unknown or hostile id falls back to the default, never to a path', () => {
  const shells = windows([CMD])
  assert.equal(resolveShell(shells, 'cmd').id, 'cmd')
  for (const id of ['nope', undefined, 'C:\\evil.exe']) {
    assert.equal(resolveShell(shells, id).path, CMD)
  }
})
