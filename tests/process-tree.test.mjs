import assert from 'node:assert/strict'
import { test } from 'node:test'
import { measureTree, parseProcessList } from '../src/main/process-tree.ts'

const MB = 1024 * 1024
const sample = (pid, ppid, memoryMb, cpuMs) => ({ pid, ppid, memory: memoryMb * MB, cpuMs })

test('reads the listing, skipping whatever is not a process line', () => {
  assert.deepEqual(parseProcessList('10 4 2048 50000\r\n\r\nGet-CimInstance : boom\r\n 11 10 1024 100000 \r\n'), [
    { pid: 10, ppid: 4, memory: 2048, cpuMs: 5 },
    { pid: 11, ppid: 10, memory: 1024, cpuMs: 10 }
  ])
})

test('counts the shell and everything under it, at any depth', () => {
  const processes = [sample(10, 4, 8, 100), sample(20, 10, 300, 1000), sample(30, 20, 50, 500), sample(99, 4, 900, 9000)]
  const last = new Map([[10, 100], [20, 500], [30, 300], [99, 0]])
  assert.deepEqual(measureTree(10, processes, last, 1000), { cpu: 70, memoryMb: 358 })
})

test('an agent using a whole core shows while the shell sits idle', () => {
  const processes = [sample(10, 4, 8, 100), sample(20, 10, 300, 2800)]
  const last = new Map([[10, 100], [20, 1000]])
  assert.equal(measureTree(10, processes, last, 1800).cpu, 100)
})

test('a process first seen in this read costs nothing yet', () => {
  assert.equal(measureTree(10, [sample(10, 4, 8, 100), sample(20, 10, 8, 5000)], new Map([[10, 100]]), 1000).cpu, 0)
})

test('a reused pid closing a loop does not hang', () => {
  const processes = [sample(10, 20, 1, 0), sample(20, 10, 1, 0)]
  assert.equal(measureTree(10, processes, new Map(), 1000).memoryMb, 2)
})

test('a panel whose process is gone reads as zero', () => {
  assert.deepEqual(measureTree(10, [], new Map(), 1000), { cpu: 0, memoryMb: 0 })
  assert.deepEqual(measureTree(10, [sample(10, 4, 1, 0)], new Map(), 0), { cpu: 0, memoryMb: 1 })
})
