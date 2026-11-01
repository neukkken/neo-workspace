import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { MAX_GAP_MS, WorkspaceClock, weekStartOf } from '../src/main/workspace-clock.ts'
import { formatHours } from '../src/renderer/src/utils/time.ts'

const MINUTE = 60000
const HOUR = 60 * MINUTE
const MONDAY = new Date(2026, 9, 26, 9).getTime()
const file = () => join(mkdtempSync(join(tmpdir(), 'nws-clock-')), 'workspace-time.json')

test('the week starts on Monday at midnight, local time', () => {
  const start = new Date(2026, 9, 26).getTime()
  assert.equal(weekStartOf(start), start)
  assert.equal(weekStartOf(new Date(2026, 10, 1, 23, 59).getTime()), start)
  assert.equal(weekStartOf(new Date(2026, 9, 25, 23, 59).getTime()), new Date(2026, 9, 19).getTime())
})

test('counts from the start, and keeps the totals once stopped', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], MONDAY)
  clock.setRunning(['a'], MONDAY + MINUTE)
  assert.deepEqual(clock.read('a', MONDAY + 2 * MINUTE), { elapsedMs: 2 * MINUTE, totalMs: 2 * MINUTE, weekMs: 2 * MINUTE, paused: false })
  clock.setRunning([], MONDAY + 3 * MINUTE)
  assert.deepEqual(clock.read('a', MONDAY + HOUR), { elapsedMs: 0, totalMs: 3 * MINUTE, weekMs: 3 * MINUTE, paused: false })
})

test('each session adds to the total, and the stopwatch starts over', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], MONDAY)
  clock.setRunning([], MONDAY + 2 * MINUTE)
  clock.setRunning(['a'], MONDAY + HOUR)
  assert.deepEqual(clock.read('a', MONDAY + HOUR + MINUTE), { elapsedMs: MINUTE, totalMs: 3 * MINUTE, weekMs: 3 * MINUTE, paused: false })
})

test('workspaces count on their own', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], MONDAY)
  clock.setRunning(['a', 'b'], MONDAY + MINUTE)
  assert.equal(clock.read('a', MONDAY + 2 * MINUTE).totalMs, 2 * MINUTE)
  assert.equal(clock.read('b', MONDAY + 2 * MINUTE).totalMs, MINUTE)
  assert.equal(clock.read('nunca', MONDAY).totalMs, 0)
})

test('a crash keeps everything up to the last flush', () => {
  const path = file()
  const clock = new WorkspaceClock(path)
  clock.setRunning(['a'], MONDAY)
  clock.flush(MONDAY + MINUTE)
  assert.deepEqual(new WorkspaceClock(path).read('a', MONDAY + HOUR), { elapsedMs: 0, totalMs: MINUTE, weekMs: MINUTE, paused: false })
})

test('a session crossing into Monday only counts this week from midnight', () => {
  const sundayNight = new Date(2026, 9, 25, 23, 59).getTime()
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], sundayNight)
  assert.deepEqual(clock.read('a', sundayNight + 3 * MINUTE), { elapsedMs: 3 * MINUTE, totalMs: 3 * MINUTE, weekMs: 2 * MINUTE, paused: false })
})

test('a new week starts at zero and keeps the total', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], MONDAY)
  clock.setRunning([], MONDAY + 2 * MINUTE)
  assert.deepEqual(clock.read('a', MONDAY + 7 * 24 * HOUR), { elapsedMs: 0, totalMs: 2 * MINUTE, weekMs: 0, paused: false })
})

test('a paused workspace stands still, then carries on from where it was', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], MONDAY)
  clock.pauseWhere(() => true, MONDAY + 2 * MINUTE)
  assert.deepEqual(clock.read('a', MONDAY + 2 * MINUTE + 30000), { elapsedMs: 2 * MINUTE, totalMs: 2 * MINUTE, weekMs: 2 * MINUTE, paused: true })
  clock.pauseWhere(() => true, MONDAY + 3 * HOUR)
  clock.pauseWhere(() => false, MONDAY + 3 * HOUR)
  assert.deepEqual(clock.read('a', MONDAY + 3 * HOUR + MINUTE), { elapsedMs: 3 * MINUTE, totalMs: 3 * MINUTE, weekMs: 3 * MINUTE, paused: false })
})

test('pausing one workspace leaves the others counting', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a', 'b'], MONDAY)
  clock.pauseWhere((id) => id === 'a', MONDAY)
  assert.equal(clock.read('a', MONDAY + MINUTE).totalMs, 0)
  assert.equal(clock.read('b', MONDAY + MINUTE).totalMs, MINUTE)
})

test('flushing while paused adds nothing', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], MONDAY)
  clock.pauseWhere(() => true, MONDAY)
  clock.flush(MONDAY + MINUTE)
  clock.flush(MONDAY + 2 * MINUTE)
  assert.equal(clock.read('a', MONDAY + 3 * MINUTE).totalMs, 0)
})

test('time asleep or a clock moved back counts for nothing', () => {
  const clock = new WorkspaceClock(file())
  clock.setRunning(['a'], MONDAY)
  clock.flush(MONDAY + MINUTE)
  const wake = MONDAY + MINUTE + MAX_GAP_MS + 8 * HOUR
  assert.deepEqual(clock.read('a', wake), { elapsedMs: MINUTE, totalMs: MINUTE, weekMs: MINUTE, paused: false })
  assert.deepEqual(clock.read('a', wake - HOUR), { elapsedMs: MINUTE, totalMs: MINUTE, weekMs: MINUTE, paused: false })
})

test('a damaged file starts from zero', () => {
  for (const content of ['{ not json', 'null']) {
    const path = file()
    writeFileSync(path, content)
    const clock = new WorkspaceClock(path)
    assert.equal(clock.read('a', MONDAY).totalMs, 0)
    clock.setRunning(['a'], MONDAY)
    clock.setRunning([], MONDAY + MINUTE)
    assert.equal(new WorkspaceClock(path).read('a', MONDAY).totalMs, MINUTE)
  }
})

test('hours read naturally', () => {
  assert.equal(formatHours(0), '0 min')
  assert.equal(formatHours(59 * MINUTE), '59 min')
  assert.equal(formatHours(12 * HOUR + 5 * MINUTE), '12 h 5 min')
})
