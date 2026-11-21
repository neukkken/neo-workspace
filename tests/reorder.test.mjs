import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moveItem } from '../src/renderer/src/utils/reorder.ts'

const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
const ids = (items) => items.map((item) => item.id).join('')

test('moveItem drops an item into the target slot, in both directions', () => {
  assert.equal(ids(moveItem(list, 'a', 'c')), 'bcad')
  assert.equal(ids(moveItem(list, 'd', 'b')), 'adbc')
  assert.equal(ids(list), 'abcd')
})

test('moveItem returns the same list when there is nothing to move', () => {
  assert.equal(moveItem(list, 'b', 'b'), list)
  assert.equal(moveItem(list, 'x', 'b'), list)
  assert.equal(moveItem(list, 'b', 'x'), list)
})
