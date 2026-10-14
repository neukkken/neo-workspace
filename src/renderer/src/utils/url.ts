/**
 * Utility functions for URL sanitization and opening external links safely across Neowork.
 */

export function cleanUrl(raw?: string | null): string {
  if (!raw) return ''
  let cleaned = String(raw).trim()

  // 1. Strip raw ANSI escape codes (e.g. \x1b[39m, \x1b[0m, \x1b[36m)
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

  // 2. Strip percent-encoded ANSI escape codes (e.g. %1B[39m, %1b[0m)
  cleaned = cleaned.replace(/%1[Bb](?:\[[0-9;]*[a-zA-Z])?/g, '')

  // 3. Strip non-printable ASCII and control characters
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '')

  // 4. Strip surrounding quotation marks, parens, brackets, angles
  cleaned = cleaned.replace(/^['"`(<{\[]+|['"`>)}\]]+$/g, '')

  // 5. Strip trailing sentence punctuation: . , ; : ! ?
  cleaned = cleaned.replace(/[.,;:!?]+$/, '')

  // 6. Normalize 0.0.0.0 host to localhost (browsers block or reject 0.0.0.0)
  cleaned = cleaned.replace(
    /^(https?:\/\/)0\.0\.0\.0(?::(\d+))?/i,
    (_, proto, port) => `${proto}localhost:${port || '80'}`
  )
  cleaned = cleaned.replace(/^0\.0\.0\.0(?::(\d+))?/i, (_, port) => `http://localhost:${port || '80'}`)

  // 7. Normalize localhost/127.0.0.1 without scheme
  if (/^(localhost|127\.0\.0\.1|\[::1\]):\d+/i.test(cleaned)) {
    cleaned = `http://${cleaned}`
  } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleaned)) {
    if (cleaned.includes('.') && !cleaned.includes(' ')) {
      cleaned = `https://${cleaned}`
    }
  }

  return cleaned
}

export async function openExternalUrl(rawUrl: string): Promise<boolean> {
  const target = cleanUrl(rawUrl)
  if (!target) return false

  try {
    if (window.neoAPI?.openExternal) {
      const success = await window.neoAPI.openExternal(target)
      if (success) return true
    }
  } catch (err) {
    console.warn('[openExternalUrl via neoAPI failed]', err)
  }

  try {
    window.open(target, '_blank')
    return true
  } catch (err) {
    console.error('[openExternalUrl via window.open failed]', err)
    return false
  }
}
