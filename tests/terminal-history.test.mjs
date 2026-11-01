import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { TerminalHistory, cleanForReplay } from '../src/main/terminal-history.ts'

const folder = () => mkdtempSync(join(tmpdir(), 'nws-history-'))

test('text and colours survive a replay', () => {
  const text = 'C:\\repo>dir\r\n\x1b[32mok\x1b[0m\x1b[2J\x1b[H\x1b]0;titulo\x07fin'
  assert.equal(cleanForReplay(text), text)
})

test('nothing in a replay can make the terminal answer back', () => {
  const queries = ['\x1b[c', '\x1b[0c', '\x1b[>c', '\x1b[=c', '\x1b[5n', '\x1b[6n', '\x1b[?6n', '\x1b[?25$p', '\x1b[18t', '\x1b]10;?\x07', '\x1b]11;?\x1b\\', '\x1b]4;1;?\x07', '\x1b]52;c;?\x07', '\x1bP+q544e\x1b\\', '\x1bP$qm\x1b\\']
  for (const query of queries) assert.equal(cleanForReplay(`a${query}b`), 'ab', JSON.stringify(query))
})

test('modes left on by a program that is gone are dropped', () => {
  const modes = ['\x1b[?1049h', '\x1b[?1049l', '\x1b[?1000h', '\x1b[?1006h', '\x1b[?2004h', '\x1b[?1004h', '\x1b[?25l', '\x1b[?9001h', '\x1b[?1;2h']
  for (const mode of modes) assert.equal(cleanForReplay(`a${mode}b`), 'ab', JSON.stringify(mode))
})

test('history comes back once per run, then the terminal is on its own', () => {
  const dir = folder()
  new TerminalHistory(dir).save('panel-1', 'hola\x1b[6n')
  const history = new TerminalHistory(dir)
  assert.equal(history.take('panel-1'), 'hola')
  assert.equal(history.take('panel-1'), '')
})

test('a panel with nothing saved starts empty', () => {
  assert.equal(new TerminalHistory(join(folder(), 'nowhere')).take('panel-1'), '')
})

test('a hostile panel id never reaches the disk', () => {
  const dir = folder()
  const outside = join(dir, 'outside.log')
  const history = new TerminalHistory(join(dir, 'history'))
  for (const id of ['../outside', '..\\outside', 'a/b', 'a.b', '']) {
    history.save(id, 'secreto')
    assert.equal(history.take(id), '')
  }
  assert.equal(existsSync(outside), false)
  assert.equal(existsSync(join(dir, 'history')), false)
})

test('history of cards that no longer exist is removed, the rest stays', () => {
  const dir = folder()
  const history = new TerminalHistory(dir)
  history.save('keep-1', 'a')
  history.save('gone-1', 'b')
  writeFileSync(join(dir, 'gone-2.log.tmp'), 'c')
  history.prune(new Set(['keep-1']))
  assert.deepEqual(readdirSync(dir), ['keep-1.log'])
})

test('pruning before anything was saved is fine', () => {
  new TerminalHistory(join(folder(), 'nowhere')).prune(new Set())
})
