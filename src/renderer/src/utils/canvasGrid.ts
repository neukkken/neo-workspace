export const GRID = 32

// How close, in screen pixels, an edge has to be to stick to another card
export const SNAP_DISTANCE = 12

// Cards closer than this are side by side; it has to reach past the gutter between them
const BESIDE_DISTANCE = 2 * GRID

const MIN_WIDTH = 320
const MIN_HEIGHT = 220

export const MIN_ZOOM = 0.35
export const MAX_ZOOM = 2.2

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Edges {
  top?: boolean
  right?: boolean
  bottom?: boolean
  left?: boolean
}

type Point = Pick<Box, 'x' | 'y'>
type Span = [from: number, to: number]

const spansX = (boxes: Box[]): Span[] => boxes.map((b) => [b.x, b.x + b.width])
const spansY = (boxes: Box[]): Span[] => boxes.map((b) => [b.y, b.y + b.height])

export const within = (a: Box, b: Box, margin: number): boolean =>
  a.x < b.x + b.width + margin &&
  a.x + a.width + margin > b.x &&
  a.y < b.y + b.height + margin &&
  a.y + a.height + margin > b.y

const beside = (box: Box, others: Box[]): Box[] => others.filter((o) => within(box, o, BESIDE_DISTANCE))

// A free spot lined up with a card: beside or below one in `view` if any fits, else the closest to those in sight
export const findSpot = (width: number, height: number, cards: Box[], view: Box): Point => {
  const isFree = ({ x, y }: Point): boolean => !cards.some((c) => within({ x, y, width, height }, c, GRID))
  const isVisible = ({ x, y }: Point): boolean =>
    x >= view.x && y >= view.y && x + width <= view.x + view.width && y + height <= view.y + view.height

  const inSight = cards.filter((c) => within(c, view, 0))
  const group = inSight.length > 0 ? inSight : cards
  const left = Math.min(...group.map((c) => c.x))
  const top = Math.min(...group.map((c) => c.y))
  // Measured from the group's corner so it grows as a block, not as one long line
  const distance = ({ x, y }: Point): number => Math.hypot(x - left, y - top)

  const inReadingOrder = [...cards].sort((a, b) => a.y - b.y || a.x - b.x)
  const corner = { x: Math.ceil(view.x / GRID) * GRID, y: Math.ceil(view.y / GRID) * GRID }
  const onward = [
    ...inReadingOrder.map((c) => ({ x: c.x + c.width + GRID, y: c.y })),
    ...inReadingOrder.map((c) => ({ x: c.x, y: c.y + c.height + GRID }))
  ]
  const backward = [
    ...inReadingOrder.map((c) => ({ x: c.x - GRID - width, y: c.y })),
    ...inReadingOrder.map((c) => ({ x: c.x, y: c.y - GRID - height }))
  ]

  const visible = [...onward, ...backward, corner].filter(isFree).find(isVisible)
  if (visible) return visible
  // Never empty: the spot right of the rightmost card is always free, and with no cards so is the corner
  return [...onward, corner].filter(isFree).reduce((a, b) => (distance(b) < distance(a) ? b : a))
}

// An edge sticks to a card's edge or to one gutter from it; anywhere else it stays where the mouse put it
const snap = (start: number, size: number, spans: Span[], tolerance: number): number => {
  let snapped = start
  let closest = tolerance
  for (const [from, to] of spans) {
    for (const candidate of [from, to - size, to + GRID, from - GRID - size]) {
      const gap = Math.abs(candidate - start)
      if (gap < closest) {
        closest = gap
        snapped = candidate
      }
    }
  }
  return snapped
}

export const snapPosition = (box: Box, others: Box[], tolerance: number): Point => {
  const near = beside(box, others)
  return {
    x: snap(box.x, box.width, spansX(near), tolerance),
    y: snap(box.y, box.height, spansY(near), tolerance)
  }
}

// The dragged edges follow the mouse and stick to cards beside them; the opposite ones stay put
export const resizeBox = (
  start: Box,
  edges: Edges,
  dx: number,
  dy: number,
  others: Box[],
  tolerance: number
): Box => {
  const startRight = start.x + start.width
  const startBottom = start.y + start.height
  const rawLeft = edges.left ? start.x + dx : start.x
  const rawRight = edges.right ? startRight + dx : startRight
  const rawTop = edges.top ? start.y + dy : start.y
  const rawBottom = edges.bottom ? startBottom + dy : startBottom

  const near = beside({ x: rawLeft, y: rawTop, width: rawRight - rawLeft, height: rawBottom - rawTop }, others)
  const x = edges.left ? Math.min(snap(rawLeft, 0, spansX(near), tolerance), startRight - MIN_WIDTH) : start.x
  const y = edges.top ? Math.min(snap(rawTop, 0, spansY(near), tolerance), startBottom - MIN_HEIGHT) : start.y
  const right = edges.right ? Math.max(snap(rawRight, 0, spansX(near), tolerance), x + MIN_WIDTH) : startRight
  const bottom = edges.bottom ? Math.max(snap(rawBottom, 0, spansY(near), tolerance), y + MIN_HEIGHT) : startBottom

  return { x, y, width: right - x, height: bottom - y }
}

export const boundsOf = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  return {
    x: left,
    y: top,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - left,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - top
  }
}

// The pan and zoom that fill a viewport with `box`, centred, with a gutter around it
export const fitCamera = (
  box: Box,
  viewportWidth: number,
  viewportHeight: number
): { pan: Point; zoom: number } => {
  const fit = Math.min((viewportWidth - 2 * GRID) / box.width, (viewportHeight - 2 * GRID) / box.height)
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit))
  return {
    zoom,
    pan: {
      x: viewportWidth / 2 - (box.x + box.width / 2) * zoom,
      y: viewportHeight / 2 - (box.y + box.height / 2) * zoom
    }
  }
}

// One line for every edge `box` shares with a card beside it
export const alignmentGuides = (box: Box, others: Box[]): { x1: number; y1: number; x2: number; y2: number }[] =>
  beside(box, others).flatMap((o) => [
    ...[box.x, box.x + box.width]
      .filter((x) => x === o.x || x === o.x + o.width)
      .map((x) => ({
        x1: x,
        y1: Math.min(box.y, o.y),
        x2: x,
        y2: Math.max(box.y + box.height, o.y + o.height)
      })),
    ...[box.y, box.y + box.height]
      .filter((y) => y === o.y || y === o.y + o.height)
      .map((y) => ({
        x1: Math.min(box.x, o.x),
        y1: y,
        x2: Math.max(box.x + box.width, o.x + o.width),
        y2: y
      }))
  ])

// Keeps the near edge visible when `size` is bigger than the view
const travel = (start: number, size: number, viewStart: number, viewSize: number): number =>
  start < viewStart
    ? start - viewStart
    : Math.max(0, Math.min(start - viewStart, start + size - viewStart - viewSize))

// How far `view` has to move to show `box`: zero when it already does
export const travelToShow = (box: Box, view: Box): Point => ({
  x: travel(box.x, box.width, view.x, view.width),
  y: travel(box.y, box.height, view.y, view.height)
})
