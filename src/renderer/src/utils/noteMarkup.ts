export type NoteBlock =
  | { kind: 'heading'; line: number; level: number; text: string }
  | { kind: 'task'; line: number; checked: boolean; text: string }
  | { kind: 'bullet'; line: number; text: string }
  | { kind: 'code'; line: number; language: string; text: string }
  | { kind: 'text'; line: number; text: string }
  | { kind: 'blank'; line: number }

export type InlinePart =
  | { kind: 'text' | 'bold' | 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

const TASK = /^\s*- \[([ xX])\] (.*)$/
const FENCE = '```'

export const parseNote = (content: string): NoteBlock[] => {
  const lines = content.split('\n')
  const blocks: NoteBlock[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith(FENCE)) {
      const start = i
      const body: string[] = []
      for (i++; i < lines.length && !lines[i].startsWith(FENCE); i++) body.push(lines[i])
      blocks.push({ kind: 'code', line: start, language: line.slice(FENCE.length).trim(), text: body.join('\n') })
      continue
    }
    const task = line.match(TASK)
    const heading = line.match(/^(#{1,3}) (.*)$/)
    const bullet = line.match(/^\s*[-*] (.*)$/)
    if (task) blocks.push({ kind: 'task', line: i, checked: task[1] !== ' ', text: task[2] })
    else if (heading) blocks.push({ kind: 'heading', line: i, level: heading[1].length, text: heading[2] })
    else if (bullet) blocks.push({ kind: 'bullet', line: i, text: bullet[1] })
    else if (line.trim()) blocks.push({ kind: 'text', line: i, text: line })
    else blocks.push({ kind: 'blank', line: i })
  }
  return blocks
}

// Only http(s) becomes a link: note text must never turn into a file: or javascript: target
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g

export const parseInline = (text: string): InlinePart[] => {
  const parts: InlinePart[] = []
  let cursor = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > cursor) parts.push({ kind: 'text', text: text.slice(cursor, match.index) })
    const [whole, bold, code, label, target, bare] = match
    if (bold) parts.push({ kind: 'bold', text: bold })
    else if (code) parts.push({ kind: 'code', text: code })
    else parts.push({ kind: 'link', text: label ?? bare, href: target ?? bare })
    cursor = match.index + whole.length
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) })
  return parts
}

const editLine = (content: string, line: number, edit: (text: string) => string[]): string => {
  const lines = content.split('\n')
  if (line < 0 || line >= lines.length) return content
  lines.splice(line, 1, ...edit(lines[line]))
  return lines.join('\n')
}

export const toggleTask = (content: string, line: number): string =>
  editLine(content, line, (text) => [
    TASK.test(text) ? text.replace(/\[([ xX])\]/, (_box, mark) => (mark === ' ' ? '[x]' : '[ ]')) : text
  ])

export const removeLine = (content: string, line: number): string => editLine(content, line, () => [])

const appendLines = (content: string, text: string): string =>
  `${content}${content && !content.endsWith('\n') ? '\n' : ''}${text}`

export const addTask = (content: string, text: string): string => appendLines(content, `- [ ] ${text}`)

// Terminal output may contain a fence of its own, which would end the block early
export const addCodeBlock = (content: string, text: string): string =>
  appendLines(content, `${FENCE}\n${text.split(FENCE).join("'''")}\n${FENCE}`)

export const taskProgress = (content: string): { done: number; total: number } => {
  const tasks = parseNote(content).filter((b) => b.kind === 'task')
  return { done: tasks.filter((t) => t.checked).length, total: tasks.length }
}

export const nextTask = (content: string, alreadySent: string[] = []): string | null => {
  for (const block of parseNote(content)) {
    if (block.kind === 'task' && !block.checked && block.text.trim() && !alreadySent.includes(block.text)) {
      return block.text
    }
  }
  return null
}
