import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GitSession } from '../src/main/git-session.ts'

const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })

const makeRepo = (commit = true) => {
  const repo = mkdtempSync(join(tmpdir(), 'nws-git-'))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.email', 'test@neowork.dev')
  git(repo, 'config', 'user.name', 'test')
  git(repo, 'config', 'core.autocrlf', 'false')
  writeFileSync(join(repo, '.gitignore'), 'ignored.log\n')
  writeFileSync(join(repo, 'a.txt'), 'uno\ndos\n')
  writeFileSync(join(repo, 'b.txt'), 'be\n')
  if (commit) {
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'base')
  }
  return repo
}

const byPath = (changes) => Object.fromEntries(changes.files.map((f) => [f.path, f]))

test('a clean repo starts with nothing and reports what happens after', async () => {
  const repo = makeRepo()
  const session = new GitSession()
  await session.ensureBaseline(repo)
  assert.deepEqual((await session.changes(repo)).files, [])

  writeFileSync(join(repo, 'a.txt'), 'uno\ncambio\ntres\n')
  unlinkSync(join(repo, 'b.txt'))
  writeFileSync(join(repo, 'nuevo.txt'), 'hola\n')
  writeFileSync(join(repo, 'ignored.log'), 'ruido\n')

  const files = byPath(await session.changes(repo))
  assert.deepEqual(Object.keys(files).sort(), ['a.txt', 'b.txt', 'nuevo.txt'])
  assert.equal(files['a.txt'].status, 'M')
  assert.equal(files['a.txt'].added, 2)
  assert.equal(files['a.txt'].removed, 1)
  assert.equal(files['b.txt'].status, 'D')
  assert.equal(files['nuevo.txt'].status, 'U')
})

test('work already uncommitted at the start is not part of the session', async () => {
  const repo = makeRepo()
  writeFileSync(join(repo, 'a.txt'), 'de antes\n')
  writeFileSync(join(repo, 'previo.txt'), 'de antes\n')
  const session = new GitSession()
  await session.ensureBaseline(repo)
  assert.deepEqual((await session.changes(repo)).files, [])

  writeFileSync(join(repo, 'a.txt'), 'de antes\ny de ahora\n')
  const changes = await session.changes(repo)
  assert.deepEqual(changes.files.map((f) => f.path), ['a.txt'])
  assert.match(await session.fileDiff(repo, 'a.txt'), /^\+y de ahora$/m)
  assert.doesNotMatch(await session.fileDiff(repo, 'a.txt'), /^-uno$/m)
})

test('commits made during the session stay visible', async () => {
  const repo = makeRepo()
  const session = new GitSession()
  await session.ensureBaseline(repo)

  writeFileSync(join(repo, 'a.txt'), 'uno\ndos\ntres\n')
  git(repo, 'commit', '-qam', 'agente: añade tres')

  const changes = await session.changes(repo)
  assert.deepEqual(changes.files.map((f) => f.path), ['a.txt'])
  assert.deepEqual(changes.commits.map((c) => c.subject), ['agente: añade tres'])
})

test('capturing the baseline leaves the repo untouched', async () => {
  const repo = makeRepo()
  writeFileSync(join(repo, 'a.txt'), 'sin guardar\n')
  git(repo, 'add', 'a.txt')
  writeFileSync(join(repo, 'b.txt'), 'sin preparar\n')
  const before = git(repo, 'status', '--porcelain')

  const session = new GitSession()
  await session.ensureBaseline(repo)
  await session.changes(repo)

  assert.equal(git(repo, 'status', '--porcelain'), before)
  assert.equal(git(repo, 'stash', 'list'), '')
  assert.equal(readFileSync(join(repo, 'a.txt'), 'utf8'), 'sin guardar\n')
})

test('a new session starts counting again', async () => {
  const repo = makeRepo()
  const session = new GitSession()
  await session.ensureBaseline(repo)
  writeFileSync(join(repo, 'a.txt'), 'cambio\n')
  assert.equal((await session.changes(repo)).files.length, 1)
  await session.reset(repo)
  assert.equal((await session.changes(repo)).files.length, 0)
})

test('new untracked files can be diffed, with odd names too', async () => {
  const repo = makeRepo()
  const session = new GitSession()
  await session.ensureBaseline(repo)
  const names = ['con espacio.txt', 'ñandú.txt', '[corchete].txt']
  for (const name of names) writeFileSync(join(repo, name), 'contenido\n')

  const changes = await session.changes(repo)
  assert.deepEqual(changes.files.map((f) => f.path).sort(), [...names].sort())
  for (const name of names) assert.match(await session.fileDiff(repo, name), /^\+contenido$/m)
})

test('binary files carry no line counts', async () => {
  const repo = makeRepo()
  const session = new GitSession()
  await session.ensureBaseline(repo)
  writeFileSync(join(repo, 'a.txt'), Buffer.from([0, 1, 2, 0, 255]))
  const file = (await session.changes(repo)).files[0]
  assert.equal(file.added, null)
  assert.equal(file.removed, null)
})

test('a repo without commits reports no baseline instead of failing', async () => {
  const repo = makeRepo(false)
  const session = new GitSession()
  assert.equal(await session.ensureBaseline(repo), null)
  const changes = await session.changes(repo)
  assert.equal(changes.hasBaseline, false)
  assert.deepEqual(changes.files, [])
  assert.equal(await session.fileDiff(repo, 'a.txt'), null)
})

test('only files in the current listing can be read', async () => {
  const repo = makeRepo()
  const outside = join(mkdtempSync(join(tmpdir(), 'nws-secret-')), 'secret.txt')
  writeFileSync(outside, 'secreto\n')
  const session = new GitSession()
  await session.ensureBaseline(repo)
  writeFileSync(join(repo, 'a.txt'), 'cambio\n')

  for (const file of [outside, '../secret.txt', '..\\secret.txt', 'b.txt', '']) {
    assert.equal(await session.fileDiff(repo, file), null, file)
  }
})

test('a folder no session opened is out of reach', async () => {
  const repo = makeRepo()
  const session = new GitSession()
  writeFileSync(join(repo, 'a.txt'), 'cambio\n')
  assert.equal(await session.changes(repo), null)
  assert.equal(await session.fileDiff(repo, 'a.txt'), null)
  assert.equal(await session.reset(repo), null)
  assert.equal(await session.changes(repo), null)
})

test('polling takes no lock while another process holds the index', async () => {
  const repo = makeRepo()
  const session = new GitSession()
  await session.ensureBaseline(repo)
  writeFileSync(join(repo, 'a.txt'), 'cambio\n')

  const lock = join(repo, '.git', 'index.lock')
  writeFileSync(lock, '')
  assert.equal((await session.changes(repo)).files.length, 1)
  assert.ok(await session.fileDiff(repo, 'a.txt'))
  assert.ok(existsSync(lock))
  unlinkSync(lock)
})
