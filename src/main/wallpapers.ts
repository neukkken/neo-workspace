import { randomUUID } from 'crypto'
import * as fs from 'fs'
import { join } from 'path'

export const MAX_WALLPAPER_BYTES = 40 * 1024 * 1024

const ID_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|bmp)$/

// Trust the file's bytes, not its extension
const detectExtension = (b: Buffer): string | null => {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'gif'
  if (b.toString('latin1', 0, 2) === 'BM') return 'bmp'
  return null
}

export class WallpaperStore {
  private dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  public list(): string[] {
    if (!fs.existsSync(this.dir)) return []
    return fs
      .readdirSync(this.dir)
      .filter((name) => ID_PATTERN.test(name))
      .map((name) => ({ name, time: fs.statSync(join(this.dir, name)).mtimeMs }))
      .sort((a, b) => a.time - b.time)
      .map((entry) => entry.name)
  }

  public importBytes(bytes: Buffer): string | null {
    if (bytes.length === 0 || bytes.length > MAX_WALLPAPER_BYTES) return null
    const ext = detectExtension(bytes)
    if (!ext) return null
    fs.mkdirSync(this.dir, { recursive: true })
    const id = `${randomUUID()}.${ext}`
    fs.writeFileSync(join(this.dir, id), bytes)
    return id
  }

  public importFile(path: string): string | null {
    try {
      if (fs.statSync(path).size > MAX_WALLPAPER_BYTES) return null
      return this.importBytes(fs.readFileSync(path))
    } catch {
      return null
    }
  }

  // Only ids minted here resolve, so a crafted id can't escape the folder
  public resolve(id: string): string | null {
    if (!ID_PATTERN.test(id)) return null
    const file = join(this.dir, id)
    return fs.existsSync(file) ? file : null
  }

  public remove(id: string): boolean {
    const file = this.resolve(id)
    if (!file) return false
    fs.unlinkSync(file)
    return true
  }
}
