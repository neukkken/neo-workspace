// Derives the app palette from a wallpaper. Pure so it can be tested without a DOM.
import type { ITheme } from '@xterm/xterm'

export interface DerivedPalette {
  vars: Record<string, string>
  terminal: ITheme
}

type Rgb = [number, number, number]

const BUCKETS = 24
// Share of the way each ANSI hue leans towards the wallpaper; more and red stops reading as an error
const ANSI_LEAN = 0.12
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === rn ? ((gn - bn) / d + 6) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  return [h * 60, clamp(s, 0, 1), l]
}

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as Rgb
}

const luminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const hex = (rgb: Rgb): string => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`

const peak = (weights: number[]): { index: number; hue: number } => {
  const index = weights.indexOf(Math.max(...weights))
  return { index, hue: (index + 0.5) * (360 / BUCKETS) }
}

// `rgba` is raw canvas pixel data. Returns null when the image has nothing to read.
export const derivePalette = (rgba: ArrayLike<number>): DerivedPalette | null => {
  const base = new Array<number>(BUCKETS).fill(0)
  const vivid = new Array<number>(BUCKETS).fill(0)
  let total = 0
  let satSum = 0

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    const [h, s, l] = rgbToHsl(rgba[i], rgba[i + 1], rgba[i + 2])
    const bucket = Math.floor(h / (360 / BUCKETS)) % BUCKETS
    total++
    satSum += s
    if (l > 0.08 && l < 0.92) base[bucket] += s
    // Colourful mid-tones carry the image's accent; near-black noise doesn't
    if (s > 0.3 && l > 0.2 && l < 0.85) vivid[bucket] += s * s * (1 - Math.abs(2 * l - 1))
  }
  if (total === 0) return null

  const baseHue = peak(base).hue
  const tint = clamp((satSum / total) * 0.5, 0.04, 0.16)
  const vividShare = vivid.reduce((a, b) => a + b, 0) / total
  // Near-monochrome image: keep the house ochre instead of inventing an accent
  const signalHue = vividShare < 0.015 ? 36 : peak(vivid).hue

  const voidRgb = hslToRgb(baseHue, tint, 0.095)
  const islandRgb = hslToRgb(baseHue, tint, 0.17)

  let lightness = 0.6
  let signal = hslToRgb(signalHue, 0.72, lightness)
  while ((contrast(signal, islandRgb) < 4.5 || contrast(signal, voidRgb) < 4.5) && lightness < 0.9) {
    lightness += 0.02
    signal = hslToRgb(signalHue, 0.72, lightness)
  }

  // Perceived brightness varies by hue, so each tone climbs until it clears AA on an island
  const readable = (hue: number, saturation: number, start: number): string => {
    let l = start
    let rgb = hslToRgb(hue, saturation, l)
    while (contrast(rgb, islandRgb) < 4.5 && l < 0.95) {
      l += 0.01
      rgb = hslToRgb(hue, saturation, l)
    }
    return hex(rgb)
  }
  const text = (start: number): string => readable(baseHue, Math.min(tint + 0.06, 0.18), start)

  const ansiSaturation = clamp(tint * 3.5, 0.3, 0.55)
  const ansi = (hue: number, start: number): string => {
    const towardsBase = ((baseHue - hue + 540) % 360) - 180
    return readable((hue + towardsBase * ANSI_LEAN + 360) % 360, ansiSaturation, start)
  }

  return {
    // No background: the card's own surface already carries the wallpaper's tint
    terminal: {
      foreground: text(0.93),
      cursor: hex(signal),
      cursorAccent: hex(voidRgb),
      selectionBackground: `${hex(signal)}42`,
      black: hex(hslToRgb(baseHue, tint, 0.24)),
      red: ansi(4, 0.68),
      green: ansi(130, 0.68),
      yellow: ansi(44, 0.68),
      blue: ansi(212, 0.68),
      magenta: ansi(322, 0.68),
      cyan: ansi(176, 0.68),
      white: text(0.89),
      brightBlack: text(0.6),
      brightRed: ansi(4, 0.8),
      brightGreen: ansi(130, 0.8),
      brightYellow: ansi(44, 0.8),
      brightBlue: ansi(212, 0.8),
      brightMagenta: ansi(322, 0.8),
      brightCyan: ansi(176, 0.8),
      brightWhite: text(0.97)
    },
    vars: {
      '--signal-rgb': signal.join(' '),
      '--island-rgb': islandRgb.join(' '),
      '--color-void': hex(voidRgb),
      '--color-zinc-950': hex(voidRgb),
      '--color-signal-soft': hex(hslToRgb(signalHue, 0.7, 0.82)),
      '--color-zinc-50': text(0.93),
      '--color-zinc-100': text(0.93),
      '--color-zinc-200': text(0.89),
      '--color-zinc-300': text(0.8),
      '--color-zinc-400': text(0.68),
      '--color-zinc-500': text(0.63),
      '--color-zinc-600': text(0.6)
    }
  }
}
