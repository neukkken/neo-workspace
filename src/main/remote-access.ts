import { timingSafeEqual } from 'crypto'

// The usual private ranges, plus 100.64.0.0/10, which is what Tailscale hands out
const PRIVATE_V4 = /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/

export const isPrivateAddress = (address: string | undefined): boolean => {
  if (!address) return false
  return address === '::1' || PRIVATE_V4.test(address.replace(/^::ffff:/i, ''))
}

export const isSameToken = (given: string | null, token: string): boolean => {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}
