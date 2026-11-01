import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GRID,
  alignmentGuides,
  findSpot,
  snapPosition,
  snapSize,
  travelToShow
} from '../src/renderer/src/utils/canvasGrid.ts'

const VIEW = { x: 32, y: 32, width: 1280, height: 800 }
const box = (x, y, width = 576, height = 416) => ({ x, y, width, height })
const place = (cards, width = 576, height = 416, view = VIEW) => [...cards, { ...findSpot(width, height, cards, view), width, height }]
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

test('the first card goes to the corner of the view, on the grid', () => {
  assert.deepEqual(findSpot(576, 416, [], VIEW), { x: 32, y: 32 })
  assert.deepEqual(findSpot(576, 416, [], { ...VIEW, x: 100, y: -50 }), { x: 128, y: -32 })
})

test('a new card sits beside the last one, tops aligned, one gutter away', () => {
  assert.deepEqual(findSpot(576, 416, [box(32, 32)], VIEW), { x: 640, y: 32 })
})

test('a card with no room beside it goes underneath, lefts aligned', () => {
  const cards = [box(32, 32, 576), box(640, 32, 576)]
  assert.deepEqual(findSpot(576, 300, cards, VIEW), { x: 32, y: 480 })
})

test('it lines up with cards that are off the grid instead of the grid', () => {
  assert.deepEqual(findSpot(576, 416, [box(60, 60, 550, 360)], VIEW), { x: 642, y: 60 })
})

test('it fills a hole left by a deleted card', () => {
  const cards = [box(32, 32), box(32, 480), box(640, 480)]
  assert.deepEqual(findSpot(576, 416, cards, VIEW), { x: 640, y: 32 })
})

test('it uses the space to the left when that is the only room in view', () => {
  assert.deepEqual(findSpot(384, 320, [box(640, 32)], { ...VIEW, width: 1184, height: 500 }), { x: 224, y: 32 })
})

test('it ignores cards out of view when the view is empty', () => {
  assert.deepEqual(findSpot(576, 416, [box(32, 32)], { ...VIEW, x: 3200, y: 3200 }), { x: 3200, y: 3200 })
})

test('with no room in view it keeps going, closest to the view first', () => {
  const small = { x: 32, y: 32, width: 700, height: 500 }
  assert.deepEqual(findSpot(576, 416, [box(32, 32)], small), { x: 32, y: 480 })
})

test('past the edge of the view cards grow as a block, not as one long line', () => {
  const narrow = { x: 32, y: 32, width: 700, height: 500 }
  let cards = []
  for (let i = 0; i < 6; i++) cards = place(cards, 576, 416, narrow)
  assert.deepEqual(
    cards.map((c) => [c.x, c.y]),
    [[32, 32], [32, 480], [640, 32], [640, 480], [32, 928], [640, 928]]
  )
})

test('with no room in view it stays near the cards in sight, not the ones far away', () => {
  const far = box(32, 32)
  const here = box(5000, 32)
  const view = { x: 4968, y: 0, width: 700, height: 500 }
  assert.deepEqual(findSpot(576, 416, [far, here], view), { x: 5000, y: 480 })
})

test('cards of any size never overlap, however many are added', () => {
  const sizes = [[576, 416], [384, 320], [832, 576], [768, 480], [480, 416], [384, 352]]
  let cards = []
  for (let i = 0; i < 60; i++) cards = place(cards, ...sizes[i % sizes.length])
  for (const a of cards) for (const b of cards) if (a !== b) assert.equal(overlaps(a, b), false)
})

test('a card that does not fit in the view at all still gets a free spot', () => {
  const tiny = { x: 0, y: 0, width: 100, height: 100 }
  const cards = place(place([], 576, 416, tiny), 576, 416, tiny)
  assert.equal(overlaps(cards[0], cards[1]), false)
})

test('a card with nothing beside it moves freely', () => {
  assert.deepEqual(snapPosition(box(47, 81), [], 8), { x: 47, y: 81 })
  assert.deepEqual(snapPosition(box(-47, -81), [box(4000, 4000)], 8), { x: -47, y: -81 })
})

test('a card lined up with a far one is not pulled towards it', () => {
  assert.equal(snapPosition(box(148, 900), [box(143, 91, 550, 360)], 8).x, 148)
})

test('edges stick to a card beside it', () => {
  const other = box(143, 91, 550, 360)
  assert.equal(snapPosition(box(148, 500), [other], 8).x, 143)
  assert.equal(snapPosition(box(500, 95), [other], 8).y, 91)
})

test('right and bottom edges line up too', () => {
  const other = box(143, 91, 550, 360)
  assert.equal(snapPosition(box(120, 500, 576, 100), [other], 8).x, 117)
  assert.equal(snapPosition(box(500, 345, 100, 100), [other], 8).y, 351)
})

test('a card sticks one gutter beside another on either side', () => {
  const other = box(143, 91, 550, 360)
  assert.equal(snapPosition(box(143 + 550 + GRID + 5, 500), [other], 8).x, 725)
  assert.equal(snapPosition(box(143 - GRID - 576 - 5, 500), [other], 8).x, -465)
})

test('edges further than the tolerance do not pull', () => {
  assert.equal(snapPosition(box(152, 500), [box(143, 91, 550, 360)], 8).x, 152)
})

test('resizing is free until the far edge reaches a card beside it', () => {
  assert.deepEqual(snapSize(box(32, 32, 590, 400), [], 8), { width: 590, height: 400 })
  assert.deepEqual(snapSize(box(32, 32, 590, 400), [box(626, 3000, 100, 100)], 8), { width: 590, height: 400 })
  assert.equal(snapSize(box(32, 32, 590, 400), [box(626, 460, 100, 100)], 8).width, 594)
  assert.equal(snapSize(box(32, 32, 590, 400), [box(100, 460, 526, 100)], 8).width, 594)
  assert.equal(snapSize(box(32, 32, 590, 400), [box(650, 32, 100, 100)], 8).width, 586)
})

test('guides appear only for edges really shared with a card beside it', () => {
  assert.deepEqual(alignmentGuides(box(32, 32, 100, 100), [box(32, 180, 100, 100)]), [
    { x1: 32, y1: 32, x2: 32, y2: 280 },
    { x1: 132, y1: 32, x2: 132, y2: 280 }
  ])
  assert.deepEqual(alignmentGuides(box(32, 32, 100, 100), [box(32, 900, 100, 100)]), [])
  assert.deepEqual(alignmentGuides(box(32, 32, 100, 100), [box(180, 32, 50, 300)]), [
    { x1: 32, y1: 32, x2: 230, y2: 32 }
  ])
  assert.deepEqual(alignmentGuides(box(32, 32, 100, 100), [box(301, 303, 50, 50)]), [])
})

test('the view only travels as far as it has to', () => {
  const view = box(0, 0, 1000, 800)
  assert.deepEqual(travelToShow(box(100, 100, 300, 300), view), { x: 0, y: 0 })
  assert.deepEqual(travelToShow(box(900, 700, 300, 300), view), { x: 200, y: 200 })
  assert.deepEqual(travelToShow(box(-50, -70, 300, 300), view), { x: -50, y: -70 })
})

test('a card bigger than the view keeps its top left corner in sight', () => {
  assert.deepEqual(travelToShow(box(200, 100, 2000, 2000), box(0, 0, 1000, 800)), { x: 200, y: 100 })
})
