// Moves the item `fromId` into the slot of `toId`, shifting the ones in between
export const moveItem = <T extends { id: string }>(items: T[], fromId: string, toId: string): T[] => {
  const from = items.findIndex((item) => item.id === fromId)
  const to = items.findIndex((item) => item.id === toId)
  if (from < 0 || to < 0 || from === to) return items
  const next = [...items]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
