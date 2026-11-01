import React from 'react'
import { X, Keyboard, Command } from 'lucide-react'

interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutItem {
  keys: string[]
  description: string
  category: 'Navegación & Workspaces' | 'Terminal & Consola' | 'Vistas & Layout'
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  const shortcuts: ShortcutItem[] = [
    {
      keys: ['Ctrl', 'K'],
      description: 'Abrir Paleta de Comandos y Búsqueda global',
      category: 'Navegación & Workspaces'
    },
    {
      keys: ['Ctrl', 'N'],
      description: 'Crear un nuevo Workspace',
      category: 'Navegación & Workspaces'
    },
    {
      keys: ['Ctrl', 'B'],
      description: 'Alternar barra lateral (Launchpad)',
      category: 'Navegación & Workspaces'
    },
    {
      keys: ['Ctrl', '1..9'],
      description: 'Cambiar rápidamente al Workspace del 1 al 9',
      category: 'Navegación & Workspaces'
    },
    {
      keys: ['Ctrl', 'S'],
      description: 'Guardar configuración de workspaces en disco',
      category: 'Navegación & Workspaces'
    },
    {
      keys: ['Doble clic', 'cabecera'],
      description: 'Enfocar una tarjeta; repetir vuelve a la vista anterior',
      category: 'Vistas & Layout'
    },
    {
      keys: ['Shift', 'clic'],
      description: 'Añadir o quitar una tarjeta de la selección',
      category: 'Vistas & Layout'
    },
    {
      keys: ['Shift', 'arrastrar'],
      description: 'Seleccionar varias tarjetas desde el lienzo',
      category: 'Vistas & Layout'
    },
    {
      keys: ['Supr'],
      description: 'Eliminar las tarjetas seleccionadas',
      category: 'Vistas & Layout'
    },
    {
      keys: ['Ctrl', 'Shift', 'R'],
      description: 'Reiniciar todas las terminales del Workspace actual',
      category: 'Terminal & Consola'
    },
    {
      keys: ['Ctrl', 'Shift', 'C'],
      description: 'Copiar texto seleccionado en la terminal',
      category: 'Terminal & Consola'
    },
    {
      keys: ['Ctrl', 'Shift', 'V'],
      description: 'Pegar portapapeles en la consola activa',
      category: 'Terminal & Consola'
    },
    {
      keys: ['Ctrl', 'Shift', 'A'],
      description: 'Seleccionar todo el texto de la terminal',
      category: 'Terminal & Consola'
    },
    {
      keys: ['Ctrl', 'F'],
      description: 'Buscar en el buffer de la terminal activa',
      category: 'Terminal & Consola'
    },
    {
      keys: ['?'],
      description: 'Abrir esta guía de atajos de teclado',
      category: 'Navegación & Workspaces'
    },
    {
      keys: ['Esc'],
      description: 'Cerrar ventanas modales activas',
      category: 'Navegación & Workspaces'
    }
  ]

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none">
      <div className="bg-void border border-zinc-700/80 rounded-button w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 bg-white/[0.04] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-medium text-zinc-100">
            <Keyboard size={16} className="text-zinc-100" />
            <span>KEYBOARD SHORTCUTS // GUÍA DE ATAJOS</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {categories.map((cat) => (
            <div key={cat} className="space-y-2">
              <span className="text-[11px] text-zinc-100 stamp">
                {cat}
              </span>
              <div className="space-y-1.5 bg-void border border-zinc-800/80 rounded-button p-2.5">
                {shortcuts
                  .filter((s) => s.category === cat)
                  .map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1 px-1.5 rounded-control hover:bg-zinc-900/60"
                    >
                      <span className="text-zinc-300 text-xs">{item.description}</span>
                      <div className="flex items-center space-x-1">
                        {item.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-0.5 rounded-control bg-zinc-800 border border-zinc-700/70 text-zinc-200 text-[10px] font-medium"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-void border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Pulsa Escape para cerrar en cualquier momento</span>
          <button
            onClick={onClose}
            className="px-4 py-1 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
