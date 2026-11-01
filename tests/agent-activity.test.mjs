import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AgentActivity, MIN_BUSY_MS, QUIET_MS } from '../src/main/agent-activity.ts'

const setup = () => {
  const changes = []
  const activity = new AgentActivity((change) => changes.push(change))
  return { activity, states: () => changes.map((c) => c.state), changes }
}
const title = (text) => `\x1b]0;${text}\x07`

// Output every second from `from` for `seconds`
const stream = (activity, from, seconds, data = 'x') => {
  for (let s = 0; s <= seconds; s++) activity.onOutput('p', data, from + s * 1000)
  return from + seconds * 1000
}

test('sustained output then silence is one finished run', () => {
  const { activity, states, changes } = setup()
  const end = stream(activity, 0, 20)
  activity.tick(end + QUIET_MS - 1)
  assert.deepEqual(states(), ['working'])
  activity.tick(end + QUIET_MS)
  assert.deepEqual(states(), ['working', 'done'])
  assert.equal(changes[1].startedAt, 0)
})

test('short bursts and occasional logs never count as work', () => {
  const { activity, states } = setup()
  activity.onOutput('p', 'dir output', 0)
  activity.tick(QUIET_MS)
  for (let i = 1; i <= 6; i++) {
    activity.onOutput('p', 'request log', i * 10000)
    activity.tick(i * 10000 + QUIET_MS)
  }
  assert.deepEqual(states(), [])
  assert.ok(MIN_BUSY_MS > QUIET_MS)
})

test('typing is not work, Enter lets the run count', () => {
  const { activity, states } = setup()
  for (let s = 0; s <= 30; s++) {
    activity.onOutput('p', 'a', s * 1000)
    activity.onInput('p', 'a')
  }
  assert.deepEqual(states(), [])
  activity.onInput('p', '\r')
  stream(activity, 31000, 20)
  assert.deepEqual(states(), ['working'])
})

test('a spinner title reports a short turn exactly', () => {
  const { activity, states, changes } = setup()
  activity.onOutput('p', title('✳ Claude Code'), 0)
  activity.onOutput('p', title('◐ Claude Code'), 1000)
  activity.onOutput('p', `${title('◑ Faros')}text`, 2000)
  activity.onOutput('p', title('✳ Faros'), 4000)
  assert.deepEqual(states(), ['working', 'done'])
  assert.equal(changes[0].startedAt, 1000)
})

test('redraws of an idle titled agent are not work', () => {
  const { activity, states } = setup()
  activity.onOutput('p', title('◐ Faros'), 0)
  activity.onOutput('p', title('✳ Faros'), 1000)
  stream(activity, 2000, 30, 'redraw')
  activity.tick(40000)
  assert.deepEqual(states(), ['working', 'done'])
})

test('after the agent closes, the generic rule applies again', () => {
  const { activity, states } = setup()
  activity.onOutput('p', title('◐ Faros'), 0)
  activity.onOutput('p', title('✳ Faros'), 1000)
  activity.onOutput('p', title('cmd.exe'), 2000)
  const end = stream(activity, 3000, 20)
  activity.tick(end + QUIET_MS)
  assert.deepEqual(states(), ['working', 'done', 'working', 'done'])
})

test('a lost idle title still ends the run', () => {
  const { activity, states } = setup()
  activity.onOutput('p', title('◐ Faros'), 0)
  activity.onOutput('p', '\x1b]0;✳ Fa', 1000)
  activity.onOutput('p', 'ros\x07', 1001)
  activity.tick(1001 + QUIET_MS)
  assert.deepEqual(states(), ['working', 'done'])
})

test('a natural exit is reported with its code', () => {
  const { activity, changes } = setup()
  activity.onExit('p', 3)
  assert.deepEqual(changes, [{ panelId: 'p', state: 'exited', startedAt: null, exitCode: 3 }])
})

test('stopping a run on purpose is not a finished run', () => {
  const { activity, states } = setup()
  stream(activity, 0, 20)
  activity.forget('p')
  activity.tick(60000)
  assert.deepEqual(states(), ['working', 'stopped'])

  const quiet = setup()
  quiet.activity.onOutput('p', 'x', 0)
  quiet.activity.forget('p')
  assert.deepEqual(quiet.states(), [])
})
