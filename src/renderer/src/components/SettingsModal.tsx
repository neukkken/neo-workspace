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
  Palette,
  Plus,
  Trash2,
  Image as ImageIcon
} from 'lucide-react'
import { SidebarPosition, UpdateStatusPayload, TerminalThemeName } from '../types'
import { BUILTIN_WALLPAPERS, NO_WALLPAPER, userWallpaperId, wallpaperUrl } from '../wallpapers'
import { Tooltip } from './Tooltip'

const thumbClass = (selected: boolean): string =>
  `block w-full aspect-video rounded-button overflow-hidden border transition-colors cursor-pointer ${
    selected ? 'border-zinc-100' : 'border-zinc-800 hover:border-zinc-700'
  }`

interface SettingsModalProps {
  isOpen: boolean
  sidebarPosition: SidebarPosition
  updateStatus: UpdateStatusPayload | null
  terminalTheme?: TerminalThemeName
  terminalFontSize?: number
  defaultShell?: string
  wallpaper?: string
  islandScale?: number
  islandOpacity?: number
  islandBlur?: number
  railHeight?: number
  onAppearanceChange?: (patch: {
    islandScale?: number
    islandOpacity?: number
    islandBlur?: number
    railHeight?: number
  }) => void
  onClose: () => void
  onPositionChange: (pos: SidebarPosition) => void
  onThemeChange?: (theme: TerminalThemeName) => void
  onFontSizeChange?: (size: number) => void
  onDefaultShellChange?: (shell: string) => void
  onWallpaperChange?: (wallpaper: string) => void
  onWallpaperRemoved?: (wallpaper: string) => void
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
  terminalTheme = 'midnight',
  terminalFontSize = 12.5,
  defaultShell,
  wallpaper,
  islandScale = 1,
  islandOpacity = 0.7,
  islandBlur = 10,
  railHeight = 200,
  onAppearanceChange,
  onClose,
  onPositionChange,
  onThemeChange,
  onFontSizeChange,
  onDefaultShellChange,
  onWallpaperChange,
  onWallpaperRemoved,
  onResetDefaults,
  onCheckForUpdates,
  onDownloadUpdate,
  onQuitAndInstallUpdate,
  onExportWorkspaces,
  onImportWorkspaces
}) => {
  const [appVersion, setAppVersion] = React.useState('1.5.0')
  const [userWallpapers, setUserWallpapers] = React.useState<string[]>([])
  const [importNotice, setImportNotice] = React.useState('')
  const [shells, setShells] = React.useState<{ id: string; label: string }[]>([])

  React.useEffect(() => {
    if (!isOpen) return
    window.neoAPI.wallpapersList().then(setUserWallpapers)
    window.neoAPI.getShells().then(setShells).catch(() => setShells([]))
  }, [isOpen])

  const handleImportWallpapers = async (): Promise<void> => {
    const { imported, rejected } = await window.neoAPI.wallpapersImport()
    setImportNotice(rejected.length ? `No se pudieron agregar: ${rejected.join(', ')} (imagen válida de hasta 40 MB)` : '')
    if (imported.length === 0) return
    setUserWallpapers(await window.neoAPI.wallpapersList())
    onWallpaperChange?.(userWallpaperId(imported[imported.length - 1]))
  }

  const handleRemoveWallpaper = async (file: string): Promise<void> => {
    if (!(await window.neoAPI.wallpapersRemove(file))) return
    setUserWallpapers((current) => current.filter((f) => f !== file))
    onWallpaperRemoved?.(userWallpaperId(file))
  }

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
      desc: 'Riel vertical a la izquierda',
      icon: PanelLeft
    },
    {
      id: 'right',
      label: 'Derecha',
      desc: 'Riel vertical a la derecha',
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
    { id: 'midnight', label: 'Según el fondo', bg: 'var(--color-void)', accent: 'var(--color-signal)' },
    { id: 'matrix', label: 'Cyber Matrix', bg: '#090a0d', accent: '#10b981' },
    { id: 'dracula', label: 'Dracula Dark', bg: '#1e1f29', accent: '#ff79c6' },
    { id: 'tokyo', label: 'Tokyo Night', bg: '#16161e', accent: '#7aa2f7' },
    { id: 'monokai', label: 'Monokai Pro', bg: '#222328', accent: '#ffd866' },
    { id: 'nord', label: 'Nordic Frost', bg: '#242933', accent: '#88c0d0' }
  ]

  const fontSizes = [11, 12, 13, 14, 16]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none">
      <div className="bg-void border border-zinc-700/80 rounded-button w-[80vw] h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 bg-white/[0.04] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-medium text-zinc-100">
            <Sliders size={15} className="text-zinc-100" />
            <span className="stamp text-[10px]">CONFIGURACIÓN DEL SISTEMA</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-control text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="lg:columns-2 gap-5 space-y-5 [&>*]:break-inside-avoid">
            {/* Sidebar Position Section */}
            <div className="space-y-3">
              <div>
                <h3 className="text-zinc-200 text-xs stamp">
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
                      className={`flex items-start space-x-3 p-3 rounded-button border text-left transition-all ${
                        isSelected
                          ? 'bg-white/5 border-white/15 text-zinc-100 shadow-[0_0_15px_rgb(var(--signal-rgb)/0.15)] ring-1 ring-white/15'
                          : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300'
                      }`}
                    >
                      <div
                        className={`p-1.5 rounded-control mt-0.5 ${
                          isSelected
                            ? 'bg-zinc-100 text-zinc-950'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        <IconComponent size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs stamp">{pos.label}</span>
                          {isSelected && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-control bg-white/10 text-zinc-100 border border-white/15">
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
            <div className="bg-void border border-zinc-800 rounded-button p-3.5 space-y-3">
              <div className="flex items-center space-x-2 text-zinc-200 font-medium">
                <Palette size={13} className="text-zinc-100" />
                <span className="stamp text-[10px]">PERSONALIZACIÓN DE TERMINAL</span>
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
                        className={`flex items-center space-x-2 p-2 rounded-control border text-left transition-all ${
                          isCurrent
                            ? 'border-white/15 bg-zinc-900 text-zinc-100 ring-1 ring-white/15'
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
                      className={`px-2 py-1 rounded-control text-[10px] transition-colors ${
                        terminalFontSize === size
                          ? 'bg-zinc-100 text-zinc-950 font-medium'
                          : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3">
                <div className="flex items-center space-x-1.5 text-zinc-400 text-[11px] shrink-0">
                  <Terminal size={12} className="text-zinc-500" />
                  <span>Motor predeterminado:</span>
                </div>
                <select
                  value={defaultShell ?? shells[0]?.id ?? ''}
                  onChange={(e) => onDefaultShellChange?.(e.target.value)}
                  className="min-w-0 bg-void border border-zinc-700/80 rounded-control px-2 py-1 text-zinc-200 text-[11px] focus:border-white/40 focus:outline-none cursor-pointer"
                >
                  {shells.map((shell) => (
                    <option key={shell.id} value={shell.id}>
                      {shell.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-zinc-500">
                Vale para las terminales nuevas o reiniciadas. Cada terminal puede usar otro motor en su configuración.
              </p>
            </div>

            {/* Appearance Section: island size and liquid-glass tuning */}
            <div className="bg-void border border-zinc-800 rounded-button p-3.5 space-y-3">
              <div className="flex items-center space-x-2 text-zinc-200 font-medium">
                <Sparkles size={13} className="text-zinc-100" />
                <span className="stamp text-[10px]">APARIENCIA</span>
              </div>
              {[
                {
                  key: 'islandScale' as const,
                  label: 'Tamaño de las islas',
                  value: islandScale,
                  min: 0.8,
                  max: 1.4,
                  step: 0.05,
                  format: (v: number) => `${Math.round(v * 100)}%`
                },
                {
                  key: 'railHeight' as const,
                  label: 'Altura del riel del Launchpad',
                  value: railHeight,
                  min: 120,
                  max: 400,
                  step: 10,
                  format: (v: number) => `${v}px`
                },
                {
                  key: 'islandOpacity' as const,
                  label: 'Opacidad del cristal',
                  value: islandOpacity,
                  min: 0.1,
                  max: 0.9,
                  step: 0.02,
                  format: (v: number) => `${Math.round(v * 100)}%`
                },
                {
                  key: 'islandBlur' as const,
                  label: 'Desenfoque del cristal',
                  value: islandBlur,
                  min: 0,
                  max: 48,
                  step: 2,
                  format: (v: number) => `${v}px`
                }
              ].map((slider) => (
                <label key={slider.key} className="block space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{slider.label}</span>
                    <span className="text-zinc-200">{slider.format(slider.value)}</span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={slider.value}
                    onChange={(e) => onAppearanceChange?.({ [slider.key]: Number(e.target.value) })}
                    className="w-full accent-zinc-100 cursor-pointer"
                  />
                </label>
              ))}
            </div>

            {/* Wallpaper gallery: built-ins plus whatever the user imported */}
            <div className="bg-void border border-zinc-800 rounded-button p-3.5 space-y-3">
              <div className="flex items-center justify-between text-zinc-200">
                <div className="flex items-center space-x-2">
                  <ImageIcon size={13} className="text-zinc-100" />
                  <span className="stamp text-[10px]">FONDO DE PANTALLA</span>
                </div>
                <button
                  onClick={handleImportWallpapers}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Agregar</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                La paleta de la app se adapta al fondo. Cada fondo recuerda su opacidad y desenfoque.
              </p>
              <div className="grid grid-cols-3 xl:grid-cols-4 gap-2">
                {BUILTIN_WALLPAPERS.map((w) => (
                  <Tooltip key={w.id} label={w.label}>
                    <button
                      aria-label={w.label}
                      aria-pressed={wallpaper === w.id}
                      onClick={() => onWallpaperChange?.(w.id)}
                      className={thumbClass(wallpaper === w.id)}
                    >
                      <img src={w.thumb} alt="" className="w-full h-full object-cover" draggable={false} />
                    </button>
                  </Tooltip>
                ))}
                {userWallpapers.map((file) => {
                  const id = userWallpaperId(file)
                  return (
                    <div key={file} className="relative group">
                      <button
                        aria-label="Fondo propio"
                        aria-pressed={wallpaper === id}
                        onClick={() => onWallpaperChange?.(id)}
                        className={thumbClass(wallpaper === id)}
                      >
                        <img src={wallpaperUrl(id)} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />
                      </button>
                      <button
                        aria-label="Eliminar fondo"
                        onClick={() => handleRemoveWallpaper(file)}
                        className="absolute top-1 right-1 p-1 rounded-control bg-void/80 text-zinc-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                })}
                <button
                  aria-pressed={wallpaper === NO_WALLPAPER}
                  onClick={() => onWallpaperChange?.(NO_WALLPAPER)}
                  className={`${thumbClass(wallpaper === NO_WALLPAPER)} flex items-center justify-center bg-void text-[11px] text-zinc-400`}
                >
                  Sin fondo
                </button>
              </div>
              {importNotice && <p className="text-[11px] text-rose-400">{importNotice}</p>}
            </div>

            {/* Backup & Portability Section */}
            <div className="bg-void border border-zinc-800 rounded-button p-3.5 space-y-3">
              <div className="flex items-center space-x-2 text-zinc-200 font-medium">
                <FileDown size={13} className="text-zinc-300" />
                <span className="stamp text-[10px]">RESPALDO Y PORTABILIDAD</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Exporta tu configuración de workspaces en formato JSON para respaldar o compartir con tu equipo, o importa una configuración existente.
              </p>
              <div className="flex items-center space-x-2 pt-1">
                {onExportWorkspaces && (
                  <button
                    onClick={onExportWorkspaces}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    <FileDown size={12} />
                    <span>Exportar Workspaces</span>
                  </button>
                )}
                {onImportWorkspaces && (
                  <button
                    onClick={onImportWorkspaces}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    <FileUp size={12} />
                    <span>Importar Workspaces</span>
                  </button>
                )}
              </div>
            </div>

            {/* Auto-Updater Section */}
            <div className="bg-void border border-zinc-800 rounded-button p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-200 font-medium">
                  <DownloadCloud size={13} className="text-zinc-100" />
                  <span className="stamp text-[10px]">ACTUALIZACIONES DEL SISTEMA</span>
                </div>
                <span className="text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-control border border-zinc-800">
                  v{appVersion}
                </span>
              </div>

              <div className="text-[11px] text-zinc-400 leading-relaxed">
                NeoWork utiliza el servicio gratuito de GitHub Releases para comprobar y descargar
                actualizaciones de forma segura sin costo.
              </div>

              {/* Status box */}
              <div className="p-3 rounded-control bg-zinc-900/80 border border-zinc-800/90 space-y-2">
                {(!updateStatus || updateStatus.state === 'idle') && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Estado: Listo para verificar</span>
                    <button
                      onClick={onCheckForUpdates}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      <span>Buscar Actualizaciones</span>
                    </button>
                  </div>
                )}

                {updateStatus?.state === 'checking' && (
                  <div className="flex items-center space-x-2 text-zinc-300 py-1">
                    <Loader2 size={13} className="animate-spin" />
                    <span>Consultando actualizaciones en GitHub...</span>
                  </div>
                )}

                {updateStatus?.state === 'not-available' && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-zinc-100">
                      <CheckCircle2 size={14} />
                      <span>Tienes la versión más reciente (v{appVersion})</span>
                    </div>
                    <button
                      onClick={onCheckForUpdates}
                      className="px-2.5 py-0.5 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                    >
                      Revisar
                    </button>
                  </div>
                )}

                {updateStatus?.state === 'available' && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-zinc-100 font-medium">
                      <Sparkles size={14} />
                      <span>¡Nueva versión disponible: v{updateStatus.info?.version}!</span>
                    </div>
                    {updateStatus.info?.releaseNotes && (
                      <div className="text-[10px] text-zinc-400 bg-zinc-950 p-2 rounded-control border border-zinc-800 max-h-24 overflow-y-auto whitespace-pre-wrap">
                        {updateStatus.info.releaseNotes}
                      </div>
                    )}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={onDownloadUpdate}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-signal hover:bg-signal/85 text-zinc-950 font-medium text-xs transition-colors"
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
                      <span className="text-zinc-300 flex items-center space-x-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Descargando nueva versión...</span>
                      </span>
                      <span className="text-zinc-300 font-medium">{updateStatus.progress?.percent || 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-zinc-100 transition-all duration-150"
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
                    <div className="flex items-center space-x-2 text-zinc-100 font-medium">
                      <CheckCircle2 size={14} />
                      <span>¡Descarga completa! Versión v{updateStatus.info?.version} lista para instalar.</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      Haz clic en el botón para reiniciar NeoWork y aplicar la actualización automáticamente.
                    </p>
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={onQuitAndInstallUpdate}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-signal hover:bg-signal/85 text-zinc-950 font-medium text-xs transition-colors"
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
                      <p className="text-[10px] text-zinc-500 bg-zinc-950 p-2 rounded-control border border-zinc-800">
                        {updateStatus.error}
                      </p>
                    )}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={onCheckForUpdates}
                        className="px-2.5 py-1 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Environment Info */}
            <div className="bg-void border border-zinc-800 rounded-button p-3 space-y-1.5 text-[11px]">
              <div className="flex items-center space-x-1.5 text-zinc-300 font-medium mb-1">
                <ShieldCheck size={12} className="text-zinc-100" />
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
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm('¿Estás seguro de que quieres restablecer los workspaces por defecto?')) {
                onResetDefaults()
                onClose()
              }
            }}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-control border border-red-900/50 hover:border-red-600 bg-red-950/20 hover:bg-red-950/40 text-red-300 transition-colors"
          >
            <RotateCcw size={11} />
            <span>Restablecer Workspaces</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-control bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
