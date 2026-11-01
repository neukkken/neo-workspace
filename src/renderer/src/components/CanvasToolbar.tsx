import React from 'react'
import {
  Activity,
  Code2,
  FileText,
  FolderOpen,
  GitBranch,
  GitCompare,
  Globe,
  MapPin,
  RotateCcw,
  Scan,
  Sparkles,
  Terminal,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { NodeKind } from '../types'
import { Tooltip } from './Tooltip'

const NEW_CARDS: { kind: NodeKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'browser', label: 'Nuevo navegador', icon: <Globe size={14} /> },
  { kind: 'vscode', label: 'Nuevo VS Code', icon: <Code2 size={14} /> },
  { kind: 'note', label: 'Nueva nota', icon: <FileText size={14} /> },
  { kind: 'explorer', label: 'Nuevo explorador', icon: <FolderOpen size={14} /> },
  { kind: 'port-monitor', label: 'Nuevo monitor de puertos', icon: <Activity size={14} /> },
  { kind: 'git', label: 'Cambios de la sesión (git)', icon: <GitCompare size={14} /> }
]

const viewButton =
  'p-1.5 rounded-control hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer'

interface CanvasToolbarProps {
  zoom: number
  isConnectMode: boolean
  connectStartId: string | null
  showMinimap: boolean
  onAddCard: (kind: NodeKind) => void
  onToggleConnect: () => void
  onToggleMinimap: () => void
  onFitAll: () => void
  onArrange: () => void
  onZoom: (factor: number) => void
  onResetView: () => void
}

// The one violet fill is the primary action
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  zoom,
  isConnectMode,
  connectStartId,
  showMinimap,
  onAddCard,
  onToggleConnect,
  onToggleMinimap,
  onFitAll,
  onArrange,
  onZoom,
  onResetView
}) => (
  <div
    onWheel={(e) => e.stopPropagation()}
    style={{ zoom: 'var(--island-scale)' } as React.CSSProperties}
    className="canvas-toolbar absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center space-x-1 island rounded-full px-2 py-1.5 text-xs whitespace-nowrap"
  >
    <Tooltip label="Nueva consola" side="top">
      <button onClick={() => onAddCard('terminal')} className="p-1.5 rounded-full bg-signal hover:bg-signal/85 text-zinc-950 transition-colors cursor-pointer">
        <Terminal size={14} />
      </button>
    </Tooltip>

    {NEW_CARDS.map(({ kind, label, icon }) => (
      <Tooltip key={kind} label={label} side="top">
        <button onClick={() => onAddCard(kind)} className="p-1.5 rounded-button text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer">
          {icon}
        </button>
      </Tooltip>
    ))}

    <div className="h-4 w-px bg-zinc-800 mx-1" />

    <Tooltip
      label={
        isConnectMode
          ? connectStartId
            ? 'Conectar: elige destino (clic en otra tarjeta)'
            : 'Conectar: elige origen'
          : 'Modo conectar / desconectar tarjetas'
      }
      side="top"
    >
      <button
        onClick={onToggleConnect}
        className={`p-1.5 rounded-button transition-colors cursor-pointer ${
          isConnectMode ? 'bg-zinc-100 text-zinc-950 ' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
        }`}
      >
        <GitBranch size={14} />
      </button>
    </Tooltip>

    <Tooltip label={showMinimap ? 'Ocultar minimapa' : 'Mostrar minimapa'} side="top">
      <button
        onClick={onToggleMinimap}
        className={`p-1.5 rounded-control transition-colors cursor-pointer ${
          showMinimap ? 'text-zinc-100 bg-zinc-800' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
        }`}
      >
        <MapPin size={14} />
      </button>
    </Tooltip>

    <Tooltip label="Ver todas las tarjetas" side="top">
      <button onClick={onFitAll} className={viewButton}>
        <Scan size={14} />
      </button>
    </Tooltip>

    <Tooltip label="Auto-organizar cuadrícula" side="top">
      <button onClick={onArrange} className={viewButton}>
        <Sparkles size={14} />
      </button>
    </Tooltip>

    <Tooltip label="Acercar (Ctrl + rueda)" side="top">
      <button onClick={() => onZoom(1.15)} className={viewButton}>
        <ZoomIn size={14} />
      </button>
    </Tooltip>

    <Tooltip label="Alejar (Ctrl + rueda)" side="top">
      <button onClick={() => onZoom(0.85)} className={viewButton}>
        <ZoomOut size={14} />
      </button>
    </Tooltip>

    <Tooltip label={`Restablecer vista a 100% (actual ${Math.round(zoom * 100)}%)`} side="top">
      <button onClick={onResetView} className={viewButton}>
        <RotateCcw size={14} />
      </button>
    </Tooltip>
  </div>
)
