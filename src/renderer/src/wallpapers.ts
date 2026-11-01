import { derivePalette, DerivedPalette } from './utils/palette'
import canyon from './assets/wallpapers/canyon.jpg'
import desertNight from './assets/wallpapers/desert-night.jpg'
import glenCanyon from './assets/wallpapers/glen-canyon.jpg'
import sandDunes from './assets/wallpapers/sand-dunes.jpg'
import kelsoDunes from './assets/wallpapers/kelso-dunes.jpg'
import canvassing from './assets/wallpapers/engraving-canvassing.jpg'
import carceri from './assets/wallpapers/engraving-carceri.jpg'
import tivoli from './assets/wallpapers/engraving-tivoli.jpg'
import padua from './assets/wallpapers/engraving-padua.jpg'
// Inlined: data URLs stay readable by canvas under the file:// origin of packaged builds
import canyonThumb from './assets/wallpapers/canyon.thumb.jpg?inline'
import desertNightThumb from './assets/wallpapers/desert-night.thumb.jpg?inline'
import glenCanyonThumb from './assets/wallpapers/glen-canyon.thumb.jpg?inline'
import sandDunesThumb from './assets/wallpapers/sand-dunes.thumb.jpg?inline'
import kelsoDunesThumb from './assets/wallpapers/kelso-dunes.thumb.jpg?inline'
import canvassingThumb from './assets/wallpapers/engraving-canvassing.thumb.jpg?inline'
import carceriThumb from './assets/wallpapers/engraving-carceri.thumb.jpg?inline'
import tivoliThumb from './assets/wallpapers/engraving-tivoli.thumb.jpg?inline'
import paduaThumb from './assets/wallpapers/engraving-padua.thumb.jpg?inline'

export const NO_WALLPAPER = 'none'
export const DEFAULT_WALLPAPER = 'builtin:canyon'

export const BUILTIN_WALLPAPERS = [
  { id: DEFAULT_WALLPAPER, label: 'Gran Cañón · Ashley St. John (CC0)', url: canyon, thumb: canyonThumb },
  { id: 'builtin:desert-night', label: 'Desierto de noche · Jared Evans (CC0)', url: desertNight, thumb: desertNightThumb },
  { id: 'builtin:glen-canyon', label: 'Glen Canyon · Romain Guy (CC0)', url: glenCanyon, thumb: glenCanyonThumb },
  { id: 'builtin:sand-dunes', label: 'Great Sand Dunes · 420 Photography (CC0)', url: sandDunes, thumb: sandDunesThumb },
  { id: 'builtin:kelso-dunes', label: 'Dunas de Kelso · NPS (dominio público)', url: kelsoDunes, thumb: kelsoDunesThumb },
  { id: 'builtin:canvassing', label: 'Grabado · William Hogarth, 1757', url: canvassing, thumb: canvassingThumb },
  { id: 'builtin:carceri', label: 'Grabado · Piranesi, Carceri', url: carceri, thumb: carceriThumb },
  { id: 'builtin:tivoli', label: 'Grabado · Piranesi, Tívoli, 1766', url: tivoli, thumb: tivoliThumb },
  { id: 'builtin:padua', label: 'Grabado · Canaletto, Padua', url: padua, thumb: paduaThumb }
]

export const userWallpaperId = (file: string): string => `user:${file}`
const userUrl = (id: string): string => `nws-wallpaper://local/${id.slice('user:'.length)}`

const builtin = (id: string): (typeof BUILTIN_WALLPAPERS)[number] =>
  BUILTIN_WALLPAPERS.find((w) => w.id === id) ?? BUILTIN_WALLPAPERS[0]

export const wallpaperUrl = (id = DEFAULT_WALLPAPER): string | undefined => {
  if (id === NO_WALLPAPER) return undefined
  return id.startsWith('user:') ? userUrl(id) : builtin(id).url
}

const SAMPLE_SIZE = 48

export const readWallpaperPalette = async (id = DEFAULT_WALLPAPER): Promise<DerivedPalette | null> => {
  if (id === NO_WALLPAPER) return null
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = id.startsWith('user:') ? userUrl(id) : builtin(id).thumb
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  return derivePalette(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data)
}

const applied = new Set<string>()

// On <html> so portaled menus and modals pick the palette up too
export const applyPalette = (palette: DerivedPalette | null): void => {
  const root = document.documentElement.style
  applied.forEach((name) => root.removeProperty(name))
  applied.clear()
  for (const [name, value] of Object.entries(palette?.vars ?? {})) {
    root.setProperty(name, value)
    applied.add(name)
  }
}
