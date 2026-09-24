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
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Terminal,
  Type,
  FileDown,
  FileUp,
  Palette
} from 'lucide-react'
import { SidebarPosition, UpdateStatusPayload, TerminalThemeName } from '../types'

interface SettingsModalProps {
  isOpen: boolean
  sidebarPosition: SidebarPosition
  updateStatus: UpdateStatusPayload | null
  terminalTheme?: TerminalThemeName
  terminalFontSize?: number
  onClose: () => void
  onPositionChange: (pos: SidebarPosition) => void
  onThemeChange?: (theme: TerminalThemeName) => void
  onFontSizeChange?: (size: number) => void
  onResetDefaults: () => void
  onCheckForUpdates: () => void
  onDownloadUpdate: () => void
  onQuitAndInstallUpdate: () => void
  onExportWorkspaces?: () => void
  onImportWorkspaces?: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  sidebarPosition,
  updateStatus,
  terminalTheme = 'matrix',
  terminalFontSize = 12.5,
  onClose,
  onPositionChange,
  onThemeChange,
  onFontSizeChange,
  onResetDefaults,
  onCheckForUpdates,
  onDownloadUpdate,
  onQuitAndInstallUpdate,
  onExportWorkspaces,
  onImportWorkspaces
}) => {
  const [appVersion, setAppVersion] = React.useState('1.5.0')

  React.useEffect(() => {
    if (window.neoAPI.getAppVersion) {
      window.neoAPI.getAppVersion().then((ver) => {
        if (ver) setAppVersion(ver)
      }).catch(() => {})
    }
  }, [])

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
      label: 'Superior',
      desc: 'Barra horizontal superior',
      icon: PanelTop
    },
    {
      id: 'bottom',
      label: 'Inferior',
      desc: 'Barra horizontal inferior',
      icon: PanelBottom
    }
  ]

  const themes: { id: TerminalThemeName; label: string; bg: string; accent: string }[] = [
    { id: 'matrix', label: 'Cyber Matrix', bg: '#090a0d', accent: '#10b981' },
    { id: 'dracula', label: 'Dracula Dark', bg: '#1e1f29', accent: '#ff79c6' },
    { id: 'tokyo', label: 'Tokyo Night', bg: '#16161e', accent: '#7aa2f7' },
    { id: 'monokai', label: 'Monokai Pro', bg: '#222328', accent: '#ffd866' },
    { id: 'nord', label: 'Nordic Frost', bg: '#242933', accent: '#88c0d0' }
  ]

  const fontSizes = [11, 12.5, 14, 16]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none">
      <div className="bg-[#0f1115] border border-zinc-700/80 rounded-lg w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-mono text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#14171d] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold text-zinc-100">
            <Sliders size={15} className="text-emerald-400" />
            <span>CONFIGURACIÓN DEL SISTEMA</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Sidebar Position Section */}
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-zinc-200 text-xs tracking-wider">
                POSICIÓN DEL LAUNCHPAD
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Selecciona la orientación de la barra de workspaces en la interfaz.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
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

          {/* Terminal Appearance Section */}
          <div className="bg-[#0b0d10] border border-zinc-800 rounded-md p-3.5 space-y-3">
            <div className="flex items-center space-x-2 text-zinc-200 font-semibold">
              <Palette size={13} className="text-emerald-400" />
              <span>PERSONALIZACIÓN DE TERMINAL</span>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-zinc-400">TEMA DE COLOR DE CONSOLA</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {themes.map((th) => {
                  const isCurrent = terminalTheme === th.id
                  return (
                    <button
                      key={th.id}
                      onClick={() => onThemeChange?.(th.id)}
                      className={`flex items-center space-x-2 p-2 rounded border text-left transition-all ${
                        isCurrent
                          ? 'border-emerald-500 bg-zinc-900 text-zinc-100 ring-1 ring-emerald-500/30'
                          : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-zinc-700 shrink-0"
                        style={{ backgroundColor: th.accent }}
                      />
                      <span className="truncate text-[11px]">{th.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-zinc-400 text-[11px]">
                <Type size={12} className="text-zinc-500" />
                <span>Tamaño de fuente:</span>
              </div>
              <div className="flex items-center space-x-1">
                {fontSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => onFontSizeChange?.(size)}
                    className={`px-2 py-1 rounded text-[10px] transition-colors ${
                      terminalFontSize === size
                        ? 'bg-emerald-500 text-zinc-950 font-bold'
                        : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Backup & Portability Section */}
          <div className="bg-[#0b0d10] border border-zinc-800 rounded-md p-3.5 space-y-3">
            <div className="flex items-center space-x-2 text-zinc-200 font-semibold">
              <FileDown size={13} className="text-cyan-400" />
              <span>RESPALDO Y PORTABILIDAD</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Exporta tu configuración de workspaces en formato JSON para respaldar o compartir con tu equipo, o importa una configuración existente.
            </p>
            <div className="flex items-center space-x-2 pt-1">
              {onExportWorkspaces && (
                <button
                  onClick={onExportWorkspaces}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  <FileDown size={12} />
                  <span>Exportar Workspaces</span>
                </button>
              )}
              {onImportWorkspaces && (
                <button
                  onClick={onImportWorkspaces}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  <FileUp size={12} />
                  <span>Importar Workspaces</span>
                </button>
              )}
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
                v{appVersion}
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
                    <span>Tienes la versión más reciente (v{appVersion})</span>
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
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs transition-colors shadow-md shadow-emerald-500/20"
                    >
                      <Sparkles size={13} />
                      <span>Reiniciar y Actualizar</span>
                    </button>
                  </div>
                </div>
              )}

              {updateStatus?.state === 'error' && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-rose-400">
                    <AlertCircle size={14} />
                    <span>Error al verificar o descargar actualizaciones.</span>
                  </div>
                  {updateStatus.error && (
                    <p className="text-[10px] text-zinc-500 bg-zinc-950 p-2 rounded border border-zinc-800">
                      {updateStatus.error}
                    </p>
                  )}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={onCheckForUpdates}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
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
