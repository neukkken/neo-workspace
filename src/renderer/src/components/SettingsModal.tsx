import React from 'react'
import {
  X,
  Sliders,
  ShieldCheck,
  RotateCcw,
  PanelLeft,
  PanelRight,
  PanelTop,
  PanelBottom,
  LayoutGrid,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles
} from 'lucide-react'
import { SidebarPosition, UpdateStatusPayload } from '../types'

interface SettingsModalProps {
  isOpen: boolean
  sidebarPosition: SidebarPosition
  updateStatus: UpdateStatusPayload | null
  onClose: () => void
  onPositionChange: (pos: SidebarPosition) => void
  onResetDefaults: () => void
  onCheckForUpdates: () => void
  onDownloadUpdate: () => void
  onQuitAndInstallUpdate: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  sidebarPosition,
  updateStatus,
  onClose,
  onPositionChange,
  onResetDefaults,
  onCheckForUpdates,
  onDownloadUpdate,
  onQuitAndInstallUpdate
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
      <div className="bg-[#0f1115] border border-zinc-700/80 rounded-lg w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#14171d] border-b border-zinc-800 flex items-center justify-between shrink-0">
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

        {/* Content (Scrollable) */}
        <div className="p-5 space-y-5 font-mono text-xs overflow-y-auto flex-1">
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
                    className={`flex items-start space-x-3 p-3 rounded-md border text-left transition-all ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/80 text-zinc-100 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30'
                        : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded mt-0.5 ${
                        isSelected
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      <IconComponent size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs tracking-wide">{pos.label}</span>
                        {isSelected && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            ACTIVO
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">{pos.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Auto-Updater Section */}
          <div className="bg-[#0b0d10] border border-zinc-800 rounded-md p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-zinc-200 font-semibold">
                <DownloadCloud size={13} className="text-emerald-400" />
                <span>ACTUALIZACIONES DEL SISTEMA</span>
              </div>
              <span className="text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                v1.4.0
              </span>
            </div>

            <div className="text-[11px] text-zinc-400 leading-relaxed">
              NeoWork utiliza el servicio gratuito de GitHub Releases para comprobar y descargar
              actualizaciones de forma segura sin costo.
            </div>

            {/* Status box */}
            <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800/90 space-y-2">
              {(!updateStatus || updateStatus.state === 'idle') && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Estado: Listo para verificar</span>
                  <button
                    onClick={onCheckForUpdates}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    <span>Buscar Actualizaciones</span>
                  </button>
                </div>
              )}

              {updateStatus?.state === 'checking' && (
                <div className="flex items-center space-x-2 text-cyan-400 py-1">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Consultando actualizaciones en GitHub...</span>
                </div>
              )}

              {updateStatus?.state === 'not-available' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <CheckCircle2 size={14} />
                    <span>Tienes la versión más reciente (v1.4.0)</span>
                  </div>
                  <button
                    onClick={onCheckForUpdates}
                    className="px-2.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                  >
                    Revisar
                  </button>
                </div>
              )}

              {updateStatus?.state === 'available' && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
                    <Sparkles size={14} />
                    <span>¡Nueva versión disponible: v{updateStatus.info?.version}!</span>
                  </div>
                  {updateStatus.info?.releaseNotes && (
                    <div className="text-[10px] text-zinc-400 bg-zinc-950 p-2 rounded border border-zinc-800 max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {updateStatus.info.releaseNotes}
                    </div>
                  )}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={onDownloadUpdate}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs transition-colors shadow-md shadow-emerald-500/20"
                    >
                      <DownloadCloud size={13} />
                      <span>Descargar Actualización</span>
                    </button>
                  </div>
                </div>
              )}

              {updateStatus?.state === 'downloading' && (
                <div className="space-y-2 py-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-cyan-400 flex items-center space-x-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Descargando nueva versión...</span>
                    </span>
                    <span className="text-zinc-300 font-bold">{updateStatus.progress?.percent || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-150"
                      style={{ width: `${updateStatus.progress?.percent || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>
                      {updateStatus.progress
                        ? `${updateStatus.progress.transferredMb}MB de ${updateStatus.progress.totalMb}MB`
                        : ''}
                    </span>
                    <span>
                      {updateStatus.progress?.bytesPerSecond
                        ? `${Math.round(updateStatus.progress.bytesPerSecond / 1024)} KB/s`
                        : ''}
                    </span>
                  </div>
                </div>
              )}

              {updateStatus?.state === 'downloaded' && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
                    <CheckCircle2 size={14} />
                    <span>¡Descarga completa! Versión v{updateStatus.info?.version} lista para instalar.</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Haz clic en el botón para reiniciar NeoWork y aplicar la actualización automáticamente.
                  </p>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={onQuitAndInstallUpdate}
                      className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs transition-colors shadow-lg shadow-emerald-500/30"
                    >
                      <RotateCcw size={13} />
                      <span>Reiniciar y Actualizar Ahora</span>
                    </button>
                  </div>
                </div>
              )}

              {updateStatus?.state === 'error' && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-amber-400">
                    <AlertCircle size={14} />
                    <span className="font-semibold">Información del actualizador</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-snug">
                    {updateStatus.error || 'No se pudo conectar al servicio de actualizaciones.'}
                  </p>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={onCheckForUpdates}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              )}
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
