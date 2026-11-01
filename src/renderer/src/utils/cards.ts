import { CanvasCard, NodeKind, PanelConfig, Workspace } from '../types'
import { Box, findSpot, GRID } from './canvasGrid'

// Multiples of the grid, so a card's far edge lands on it too
const SHAPES: Record<NodeKind, { width: number; height: number }> = {
  terminal: { width: 576, height: 416 },
  browser: { width: 576, height: 480 },
  vscode: { width: 832, height: 576 },
  note: { width: 384, height: 320 },
  explorer: { width: 480, height: 416 },
  'port-monitor': { width: 384, height: 352 },
  git: { width: 768, height: 480 }
}

// shortcut: guesses the canvas area from the window, ask the mounted canvas when there is one
export const openingView = (): Box => ({
  x: GRID,
  y: GRID,
  width: window.innerWidth - 8 * GRID,
  height: window.innerHeight - 6 * GRID
})

const kindDefaults = (kind: NodeKind, workspace: Workspace, cards: CanvasCard[]): Partial<CanvasCard> => {
  const baseDir = workspace.panels[0]?.cwd || ''
  switch (kind) {
    case 'terminal':
      return {
        title: `TERMINAL-${cards.filter((c) => c.kind === 'terminal').length + 1}`,
        cwd: baseDir,
        command: '',
        autoStart: true
      }
    case 'browser':
      return { title: 'LOCAL-PREVIEW', url: 'http://localhost:5173' }
    case 'vscode':
      return { title: `VS Code · ${workspace.name || 'Editor'}`, vscodeMode: 'local', vscodePath: baseDir }
    case 'note':
      return { title: 'NOTAS / TAREAS', noteColor: 'zinc', noteContent: '' }
    case 'explorer':
      return { title: 'EXPLORADOR ARCHIVOS', explorerPath: baseDir }
    case 'port-monitor':
      return { title: 'MONITOR DE PUERTOS', monitoredPorts: [3000, 5173, 8000, 8080] }
    case 'git':
      return { title: 'CAMBIOS DE LA SESIÓN' }
  }
}

// `view` is the part of the canvas the user can see
export const createCard = (
  kind: NodeKind,
  workspace: Workspace,
  cards: CanvasCard[],
  view: Box,
  overrides?: Partial<CanvasCard>
): CanvasCard => {
  const { width, height } = SHAPES[kind]
  return {
    id: `canvas-${kind}-${Date.now()}`,
    kind,
    title: '',
    ...findSpot(width, height, cards, view),
    width,
    height,
    zIndex: cards.length + 1,
    ...kindDefaults(kind, workspace, cards),
    ...overrides
  }
}

export const panelCards = (panels: PanelConfig[], cards: CanvasCard[], view: Box): CanvasCard[] => {
  const { width, height } = SHAPES.terminal
  return panels.reduce<CanvasCard[]>((placed, p) => {
    const taken = [...cards, ...placed]
    return [
      ...placed,
      {
        id: p.id,
        kind: 'terminal',
        title: p.title,
        cwd: p.cwd,
        command: p.command,
        commands: p.commands,
        autoStart: p.autoStart,
        env: p.env,
        ...findSpot(width, height, taken, view),
        width,
        height,
        zIndex: taken.length + 1
      }
    ]
  }, [])
}
