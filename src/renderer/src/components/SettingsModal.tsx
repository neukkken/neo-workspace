import React from 'react'
import {
  X,
  Sliders,
  ShieldCheck,
  Terminal,
  RotateCcw,
  PanelLeft,
  PanelRight,
  PanelTop,
  PanelBottom,
  LayoutGrid
} from 'lucide-react'
import { SidebarPosition } from '../types'

interface SettingsModalProps {
  isOpen: boolean
  sidebarPosition: SidebarPosition
  onClose: () => void
  onPositionChange: (pos: SidebarPosition) => void
  onResetDefaults: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  sidebarPosition,
  onClose,
  onPositionChange,
  onResetDefaults
}) => {
  if (!isOpen) return null

  const positions: {
    id: SidebarPosition
    label: string
    desc: string
    icon: React.ComponentType<{ size?: number; className?: string }>
  }[] = [
    {
      id: 'left',
      label: 'Izquierda',
      desc: 'Barra lateral izquierda clásica',
      icon: PanelLeft
    },
    {
      id: 'right',
      label: 'Derecha',
      desc: 'Barra lateral a la derecha',
      icon: PanelRight
    },
    {
      id: 'top',
      label: 'Arriba',
      desc: 'Barra superior (100% ancho para terminales)',
      icon: PanelTop
    },
    {
      id: 'bottom',
      label: 'Abajo',
      desc: 'Barra inferior estilo dock (100% ancho)',
      icon: PanelBottom
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none">
      <div className="bg-[#0f1115] border border-zinc-700/80 rounded-lg w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#14171d] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-mono font-semibold text-zinc-100">
            <Sliders size={15} className="text-emerald-400" />
            <span>ORCHESTRATOR SETTINGS</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 font-mono text-xs">
          {/* Position Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2 text-zinc-200 font-semibold">
              <LayoutGrid size={13} className="text-emerald-400" />
              <span>POSICIÓN DEL LAUNCHPAD (WORKSPACES)</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Elige dónde ubicar el panel de workspaces. Colocarlo arriba o abajo libera el 100%
              del ancho de la pantalla para las terminales.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {positions.map((pos) => {
                const IconComponent = pos.icon
                const isSelected = sidebarPosition === pos.id

                return (
                  <button
                    key={pos.id}
                    onClick={() => onPositionChange(pos.id)}
                    className={`flex items-start space-x-3 p-3 rounded-md text-left transition-all border ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-zinc-100 shadow-sm'
                        : 'bg-[#0b0d10] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded mt-0.5 ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      <IconComponent size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-xs text-zinc-200">{pos.label}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">{pos.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Environment Info */}
          <div className="bg-[#0b0d10] border border-zinc-800 rounded-md p-3 space-y-1.5 text-[11px]">
            <div className="flex items-center space-x-1.5 text-zinc-300 font-semibold mb-1">
              <ShieldCheck size={12} className="text-emerald-400" />
              <span>Runtime Environment</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Terminal Engine:</span>
              <span className="text-zinc-200">node-pty / xterm.js v6</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Color Mode:</span>
              <span className="text-zinc-200">24-bit TrueColor</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Telemetry:</span>
              <span className="text-zinc-200">Process PID polling (1.8s)</span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
            <button
              onClick={() => {
                if (confirm('¿Estás seguro de que quieres restablecer los workspaces por defecto?')) {
                  onResetDefaults()
                  onClose()
                }
              }}
              className="flex items-center space-x-1 px-3 py-1.5 rounded border border-red-900/50 hover:border-red-600 bg-red-950/20 hover:bg-red-950/40 text-red-300 transition-colors"
            >
              <RotateCcw size={11} />
              <span>Restablecer Workspaces</span>
            </button>

            <button
              onClick={onClose}
              className="px-5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
