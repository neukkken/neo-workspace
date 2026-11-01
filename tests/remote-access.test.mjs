import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPrivateAddress, isSameToken } from '../src/main/remote-access.ts'

test('home networks, Tailscale and this machine are let in', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.1.20', '::ffff:192.168.1.20', '10.0.0.5', '172.16.0.1', '172.31.255.1', '100.64.0.1', '100.127.255.1', '169.254.1.1']) {
    assert.equal(isPrivateAddress(address), true, address)
  }
})

test('the internet is not', () => {
  for (const address of ['8.8.8.8', '::ffff:8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1', '192.169.0.1', '11.0.0.1', '1.127.0.0', '2001:4860:4860::8888']) {
    assert.equal(isPrivateAddress(address), false, address)
  }
  assert.equal(isPrivateAddress(undefined), false)
  assert.equal(isPrivateAddress(''), false)
})

test('a token only matches itself', () => {
  assert.equal(isSameToken('abc123', 'abc123'), true)
  assert.equal(isSameToken('abc124', 'abc123'), false)
  assert.equal(isSameToken('abc12', 'abc123'), false)
  assert.equal(isSameToken('', 'abc123'), false)
  assert.equal(isSameToken(null, 'abc123'), false)
})
