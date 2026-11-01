import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addCodeBlock,
  addTask,
  nextTask,
  parseInline,
  parseNote,
  removeLine,
  taskProgress,
  toggleTask
} from '../src/renderer/src/utils/noteMarkup.ts'

const kinds = (content) => parseNote(content).map((b) => b.kind)

test('recognises each kind of line', () => {
  assert.deepEqual(kinds('# Título\n- [ ] tarea\n- [x] hecha\n- punto\ntexto\n\n'), [
    'heading', 'task', 'task', 'bullet', 'text', 'blank', 'blank'
  ])
})

test('nothing inside a code block is a task or a heading', () => {
  const note = 'antes\n```bash\n- [ ] no soy tarea\n# tampoco\n```\ndespués'
  assert.deepEqual(kinds(note), ['text', 'code', 'text'])
  assert.equal(parseNote(note)[1].text, '- [ ] no soy tarea\n# tampoco')
  assert.equal(parseNote(note)[1].language, 'bash')
  assert.equal(taskProgress(note).total, 0)
  assert.equal(nextTask(note), null)
})

test('an unclosed code block runs to the end instead of failing', () => {
  assert.deepEqual(kinds('```\ncomando'), ['code'])
})

test('toggles the task on its own line and nothing else', () => {
  const note = 'hay [x] en este texto\n- [ ] uno [x]\n- [x] dos\n- [X] tres'
  assert.equal(toggleTask(note, 1), 'hay [x] en este texto\n- [x] uno [x]\n- [x] dos\n- [X] tres')
  assert.equal(toggleTask(note, 2), 'hay [x] en este texto\n- [ ] uno [x]\n- [ ] dos\n- [X] tres')
  assert.equal(toggleTask(note, 3), 'hay [x] en este texto\n- [ ] uno [x]\n- [x] dos\n- [ ] tres')
  assert.equal(toggleTask(note, 0), note)
  assert.equal(toggleTask(note, 99), note)
})

test('a line that only mentions a checkbox is not a task', () => {
  assert.deepEqual(kinds('explica - [ ] aquí'), ['text'])
})

test('adds tasks on a line of their own', () => {
  assert.equal(addTask('', 'uno'), '- [ ] uno')
  assert.equal(addTask('nota', 'dos'), 'nota\n- [ ] dos')
  assert.equal(addTask('nota\n', 'dos'), 'nota\n- [ ] dos')
})

test('removes a single line', () => {
  assert.equal(removeLine('a\nb\nc', 1), 'a\nc')
  assert.equal(removeLine('a', 5), 'a')
})

test('progress and next task follow the note', () => {
  const note = '- [x] uno\n- [ ] dos\n- [ ] tres\n- [ ] '
  assert.deepEqual(taskProgress(note), { done: 1, total: 4 })
  assert.equal(nextTask(note), 'dos')
  assert.equal(nextTask(note, ['dos']), 'tres')
  assert.equal(nextTask('- [x] listo'), null)
})

test('captured output stays inside its block even if it has fences', () => {
  const note = addCodeBlock('nota', 'antes\n```\ndespués')
  assert.deepEqual(kinds(note), ['text', 'code'])
  assert.match(parseNote(note)[1].text, /después/)
})

test('formats bold, code and links in place', () => {
  assert.deepEqual(parseInline('a **b** `c` d'), [
    { kind: 'text', text: 'a ' },
    { kind: 'bold', text: 'b' },
    { kind: 'text', text: ' ' },
    { kind: 'code', text: 'c' },
    { kind: 'text', text: ' d' }
  ])
  assert.deepEqual(parseInline('[docs](https://a.dev/x) y https://b.dev'), [
    { kind: 'link', text: 'docs', href: 'https://a.dev/x' },
    { kind: 'text', text: ' y ' },
    { kind: 'link', text: 'https://b.dev', href: 'https://b.dev' }
  ])
})

test('only web addresses become links', () => {
  for (const text of ['[x](javascript:alert(1))', '[x](file:///C:/secret)', 'javascript:alert(1)']) {
    assert.ok(parseInline(text).every((p) => p.kind === 'text'), text)
  }
})
