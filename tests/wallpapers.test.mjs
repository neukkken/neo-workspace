import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { MAX_WALLPAPER_BYTES, WallpaperStore } from '../src/main/wallpapers.ts'
import { contrast, derivePalette } from '../src/renderer/src/utils/palette.ts'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const store = () => new WallpaperStore(join(mkdtempSync(join(tmpdir(), 'nws-')), 'wallpapers'))
const channels = (value) => value.split(' ').map(Number)
const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

const solid = (r, g, b, n = 400) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4])

test('imports by content and lists what it stored', () => {
  const s = store()
  const id = s.importBytes(JPEG)
  assert.match(id, /\.jpg$/)
  assert.deepEqual(s.list(), [id])
  assert.ok(s.resolve(id))
})

test('rejects non-images, empty and oversized files, whatever their name', () => {
  const s = store()
  assert.equal(s.importBytes(Buffer.from('<script>alert(1)</script>')), null)
  assert.equal(s.importBytes(Buffer.alloc(0)), null)
  assert.equal(s.importBytes(Buffer.concat([JPEG, Buffer.alloc(MAX_WALLPAPER_BYTES)])), null)

  const fake = join(mkdtempSync(join(tmpdir(), 'nws-')), 'fake.jpg')
  writeFileSync(fake, 'not an image')
  assert.equal(s.importFile(fake), null)
  assert.equal(s.importFile(join(tmpdir(), 'does-not-exist.jpg')), null)
})

test('ids cannot escape the wallpaper folder', () => {
  const s = store()
  s.importBytes(JPEG)
  for (const id of ['../neo-workspaces.json', '..\\neo-workspaces.json', '../../secret.jpg', '']) {
    assert.equal(s.resolve(id), null)
    assert.equal(s.remove(id), false)
  }
})

test('remove deletes the file', () => {
  const s = store()
  const id = s.importBytes(JPEG)
  assert.equal(s.remove(id), true)
  assert.deepEqual(s.list(), [])
})

test('palette follows the image hue', () => {
  const blue = derivePalette(solid(30, 70, 200))
  const red = derivePalette(solid(200, 50, 30))
  const [br, , bb] = channels(blue.vars['--signal-rgb'])
  const [rr, , rb] = channels(red.vars['--signal-rgb'])
  assert.ok(bb > br, 'blue image gives a blue signal')
  assert.ok(rr > rb, 'red image gives a red signal')
})

test('palette stays legible on any image', () => {
  for (const [r, g, b] of [[255, 255, 255], [0, 0, 0], [240, 230, 40], [20, 20, 120], [200, 30, 200], [128, 128, 128]]) {
    const p = derivePalette(solid(r, g, b))
    const island = channels(p.vars['--island-rgb'])
    const base = fromHex(p.vars['--color-void'])
    const signal = channels(p.vars['--signal-rgb'])
    assert.ok(contrast(signal, island) >= 4.5, `signal on island for ${[r, g, b]}`)
    assert.ok(contrast(signal, base) >= 4.5, `dark text on signal for ${[r, g, b]}`)
    for (const key of ['--color-zinc-100', '--color-zinc-400', '--color-zinc-600']) {
      assert.ok(contrast(fromHex(p.vars[key]), island) >= 4.5, `${key} on island for ${[r, g, b]}`)
    }
  }
})

test('terminal colours follow the image and stay legible', () => {
  const images = [[255, 255, 255], [0, 0, 0], [240, 230, 40], [20, 20, 120], [30, 70, 200], [200, 30, 200], [128, 128, 128]]
  const hues = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
  const bright = (name) => `bright${name[0].toUpperCase()}${name.slice(1)}`
  for (const [r, g, b] of images) {
    const p = derivePalette(solid(r, g, b))
    const island = channels(p.vars['--island-rgb'])
    assert.equal(p.terminal.background, undefined, 'the card surface shows through')
    for (const key of ['foreground', 'white', 'brightBlack', 'brightWhite', ...hues, ...hues.map(bright)]) {
      assert.ok(contrast(fromHex(p.terminal[key]), island) >= 4.5, `${key} on island for ${[r, g, b]}`)
    }
    // Errors and successes must still read as such, whatever the wallpaper
    const [redR, redG, redB] = fromHex(p.terminal.red)
    const [greenR, greenG, greenB] = fromHex(p.terminal.green)
    assert.ok(redR > redG && redR > redB, `red stays red for ${[r, g, b]}`)
    assert.ok(greenG > greenR && greenG > greenB, `green stays green for ${[r, g, b]}`)
  }
  const blue = derivePalette(solid(30, 70, 200)).terminal
  const red = derivePalette(solid(200, 50, 30)).terminal
  assert.notEqual(blue.foreground, red.foreground)
  assert.notEqual(blue.green, red.green)
})

test('monochrome image keeps the house ochre', () => {
  const [r, g, b] = channels(derivePalette(solid(128, 128, 128)).vars['--signal-rgb'])
  assert.ok(r > g && g > b)
})

test('empty or transparent image yields no palette', () => {
  assert.equal(derivePalette(new Uint8ClampedArray(0)), null)
  assert.equal(derivePalette(new Uint8ClampedArray(400)), null)
})
