import React, { useState, useEffect, useRef } from 'react'
import {
  Search,
  Terminal,
  FolderKanban,
  Settings,
  Layers,
  LayoutGrid,
  Sparkles,
  FileText,
  Globe,
  Activity,
  Folder,
  X,
  Play,
  Download,
  RotateCw
} from 'lucide-react'
import { Workspace, AppState } from '../types'

interface PaletteItem {
  id: string
  title: string
  subtitle?: string
  category: 'Workspaces' | 'Acciones' | 'Canvas'
  icon: React.ReactNode
  action: () => void
}

interface CommandPaletteModalProps {
  isOpen: boolean
  onClose: () => void
  appState: AppState
  onSelectWorkspace: (id: string) => void
  onNewWorkspace: () => void
  onToggleLayoutMode: () => void
  onToggleSidebar: () => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onRestartActiveWorkspace: () => void
  onAddCanvasCard?: (kind: 'terminal' | 'browser' | 'note' | 'explorer' | 'port-monitor') => void
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  appState,
  onSelectWorkspace,
  onNewWorkspace,
  onToggleLayoutMode,
  onToggleSidebar,
  onOpenSettings,
  onOpenShortcuts,
  onRestartActiveWorkspace,
  onAddCanvasCard
}) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  const items: PaletteItem[] = []

  // 1. Workspaces
  appState.workspaces.forEach((ws) => {
    const isActive = ws.id === appState.activeWorkspaceId
    items.push({
      id: `ws-${ws.id}`,
      title: `Workspace: ${ws.name}`,
      subtitle: `${ws.panels.length} terminales [${ws.code || '01'}] ${isActive ? '(Activo)' : ''}`,
      category: 'Workspaces',
      icon: <FolderKanban size={15} className="text-emerald-400" />,
      action: () => {
        onSelectWorkspace(ws.id)
        onClose()
      }
    })
  })

  // 2. Global Actions
  items.push({
    id: 'act-new-ws',
    title: 'Crear nuevo Workspace',
    subtitle: 'Configura un nuevo entorno de trabajo con paneles personalizados',
    category: 'Acciones',
    icon: <Terminal size={15} className="text-emerald-400" />,
    action: () => {
      onNewWorkspace()
      onClose()
    }
  })

  items.push({
    id: 'act-restart-ws',
    title: 'Reiniciar Workspace Activo',
    subtitle: 'Reinicia todas las terminales y aplica cambios pendientes',
    category: 'Acciones',
    icon: <RotateCw size={15} className="text-amber-400" />,
    action: () => {
      onRestartActiveWorkspace()
      onClose()
    }
  })

  items.push({
    id: 'act-toggle-layout',
    title: 'Alternar Cuadrícula / Canvas Libre',
    subtitle: 'Cambia entre vista de terminales fija o lienzo infinito (Ctrl+Shift+F)',
    category: 'Acciones',
    icon: <Layers size={15} className="text-cyan-400" />,
    action: () => {
      onToggleLayoutMode()
      onClose()
    }
  })

  items.push({
    id: 'act-toggle-sidebar',
    title: 'Mostrar / Ocultar Barra Lateral',
    subtitle: 'Alterna visibilidad del Launchpad (Ctrl+B)',
    category: 'Acciones',
    icon: <LayoutGrid size={15} className="text-zinc-400" />,
    action: () => {
      onToggleSidebar()
      onClose()
    }
  })

  items.push({
    id: 'act-settings',
    title: 'Abrir Preferencias y Configuración',
    subtitle: 'Temas, tamaño de fuente, posición de barra, auto-updater',
    category: 'Acciones',
    icon: <Settings size={15} className="text-zinc-300" />,
    action: () => {
      onOpenSettings()
      onClose()
    }
  })

  // 3. Canvas Tools
  if (onAddCanvasCard) {
    items.push({
      id: 'canvas-term',
      title: 'Canvas: Añadir Terminal / Consola',
      subtitle: 'Inserta un nuevo nodo de consola interactiva en el lienzo',
      category: 'Canvas',
      icon: <Terminal size={15} className="text-emerald-400" />,
      action: () => {
        onAddCanvasCard('terminal')
        onClose()
      }
    })

    items.push({
      id: 'canvas-browser',
      title: 'Canvas: Añadir Navegador Web',
      subtitle: 'Inserta una tarjeta de vista previa web interactiva',
      category: 'Canvas',
      icon: <Globe size={15} className="text-cyan-400" />,
      action: () => {
        onAddCanvasCard('browser')
        onClose()
      }
    })

    items.push({
      id: 'canvas-note',
      title: 'Canvas: Añadir Bloc de Notas',
      subtitle: 'Inserta una tarjeta de notas Markdown con listas de tareas',
      category: 'Canvas',
      icon: <FileText size={15} className="text-amber-400" />,
      action: () => {
        onAddCanvasCard('note')
        onClose()
      }
    })

    items.push({
      id: 'canvas-explorer',
      title: 'Canvas: Añadir Explorador de Archivos',
      subtitle: 'Inserta un explorador de carpetas con previsualización rápida',
      category: 'Canvas',
      icon: <Folder size={15} className="text-indigo-400" />,
      action: () => {
        onAddCanvasCard('explorer')
        onClose()
      }
    })

    items.push({
      id: 'canvas-ports',
      title: 'Canvas: Añadir Monitor de Puertos',
      subtitle: 'Inserta un monitor en tiempo real de servicios y puertos locales',
      category: 'Canvas',
      icon: <Activity size={15} className="text-emerald-400" />,
      action: () => {
        onAddCanvasCard('port-monitor')
        onClose()
      }
    })
  }

  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase())) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  )

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-xs select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0f1117] border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 bg-[#13161f] border-b border-zinc-800">
          <Search size={16} className="text-emerald-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando o busca un workspace... (↑↓ para navegar, Enter para ejecutar)"
            className="flex-1 bg-transparent text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-zinc-500">
              No se encontraron comandos coincidentes con "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex

              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-white'
                      : 'hover:bg-zinc-800/60 border border-transparent text-zinc-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div
                      className={`p-1.5 rounded ${
                        isSelected ? 'bg-emerald-500/20' : 'bg-zinc-800/80'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="truncate">
                      <div className="font-mono text-xs font-semibold">{item.title}</div>
                      {item.subtitle && (
                        <div className="font-mono text-[10px] text-zinc-500 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="font-mono text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded shrink-0">
                    {item.category}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-[#0c0e14] border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <div className="flex items-center space-x-3">
            <span>↑↓ Navegar</span>
            <span>↵ Ejecutar</span>
            <span>Esc Cerrar</span>
          </div>
          <span className="text-emerald-400">Ctrl+K / Ctrl+P</span>
        </div>
      </div>
    </div>
  )
}
