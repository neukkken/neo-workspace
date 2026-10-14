import React, { useState, useEffect } from 'react'
import {
  Smartphone,
  X,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Wifi,
  Globe,
  ShieldCheck,
  Power
} from 'lucide-react'
import { openExternalUrl } from '../utils/url'

interface NetworkInterface {
  name: string
  ip: string
  type: 'lan' | 'tailscale' | 'other'
}

interface RemoteStatus {
  enabled: boolean
  port: number
  token: string
  interfaces: NetworkInterface[]
  primaryUrl: string
  tailscaleUrl?: string
  qrCodeDataUrl: string
  clientCount: number
}

interface MobileConnectModalProps {
  isOpen: boolean
  onClose: () => void
}

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [selectedType, setSelectedType] = useState<'lan' | 'tailscale'>('lan')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchStatus = async (): Promise<void> => {
    try {
      const res = await window.neoAPI.getRemoteStatus()
      setStatus(res)
      if (res.tailscaleUrl && !res.primaryUrl) {
        setSelectedType('tailscale')
      }
    } catch (e) {
      console.error('Error fetching remote gateway status:', e)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStatus()
    }
  }, [isOpen])

  useEffect(() => {
    const unsub = window.neoAPI.onRemoteStatus((newStatus) => {
      setStatus(newStatus)
    })
    return () => unsub()
  }, [])

  if (!isOpen) return null

  const handleToggle = async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await window.neoAPI.toggleRemote()
      setStatus(res)
    } catch (e) {
      console.error('Failed to toggle remote gateway:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateToken = async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await window.neoAPI.regenerateRemoteToken()
      setStatus(res)
    } catch (e) {
      console.error('Failed to regenerate token:', e)
    } finally {
      setLoading(false)
    }
  }

  const currentUrl =
    selectedType === 'tailscale' && status?.tailscaleUrl
      ? status.tailscaleUrl
      : status?.primaryUrl || ''

  const handleCopyUrl = async (): Promise<void> => {
    if (!currentUrl) return
    await window.neoAPI.writeClipboard(currentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#0e1117] border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-[#12161f] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Smartphone size={17} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>NeoWork Mobile Gateway</span>
                {status?.enabled && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    ONLINE
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-zinc-400">
                Conecta tu teléfono para ver workspaces y enviar prompts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto font-mono text-xs">
          {/* Toggle Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#090b0f] border border-zinc-800/80">
            <div className="flex items-center space-x-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  status?.enabled ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-zinc-600'
                }`}
              />
              <div>
                <p className="text-zinc-200 font-medium">Servidor Remoto Embebido</p>
                <p className="text-[10px] text-zinc-500">
                  {status?.enabled
                    ? `Puerto ${status.port} • ${status.clientCount} móvil(es) conectado(s)`
                    : 'Servidor detenido'}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={loading}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                status?.enabled
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              <Power size={12} />
              <span>{status?.enabled ? 'Detener' : 'Iniciar'}</span>
            </button>
          </div>

          {status?.enabled ? (
            <>
              {/* Network Selector Tabs if Tailscale is present */}
              {status.tailscaleUrl && (
                <div className="flex rounded-lg bg-zinc-900/80 p-1 border border-zinc-800 text-[11px]">
                  <button
                    onClick={() => setSelectedType('lan')}
                    className={`flex-1 py-1.5 rounded-md flex items-center justify-center space-x-1.5 transition-colors cursor-pointer ${
                      selectedType === 'lan'
                        ? 'bg-zinc-800 text-zinc-100 font-semibold shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Wifi size={12} className="text-emerald-400" />
                    <span>Red Local (WiFi)</span>
                  </button>
                  <button
                    onClick={() => setSelectedType('tailscale')}
                    className={`flex-1 py-1.5 rounded-md flex items-center justify-center space-x-1.5 transition-colors cursor-pointer ${
                      selectedType === 'tailscale'
                        ? 'bg-zinc-800 text-zinc-100 font-semibold shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Globe size={12} className="text-cyan-400" />
                    <span>Tailscale (4G / 5G)</span>
                  </button>
                </div>
              )}

              {/* QR Code Center Box */}
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#07080b] border border-zinc-800/80 space-y-3">
                {status.qrCodeDataUrl ? (
                  <div className="p-2.5 bg-white rounded-lg shadow-lg">
                    <img
                      src={status.qrCodeDataUrl}
                      alt="Código QR de conexión"
                      className="w-48 h-48 block"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                    Generando QR...
                  </div>
                )}
                <p className="text-[11px] text-zinc-400 text-center">
                  Escanea con la cámara de tu teléfono para abrir la interfaz móvil
                </p>
              </div>

              {/* URL & Copy Row */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                  URL de Acceso Directo:
                </label>
                <div className="flex items-center space-x-2 bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                  <span className="text-[11px] text-emerald-400 truncate flex-1 select-all font-mono">
                    {currentUrl}
                  </span>
                  <button
                    onClick={handleCopyUrl}
                    className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0"
                    title="Copiar URL al portapapeles"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={() => openExternalUrl(currentUrl)}
                    className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0"
                    title="Abrir en navegador de escritorio"
                  >
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>

              {/* Token & Security Controls */}
              <div className="flex items-center justify-between text-[11px] p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800/60">
                <div className="flex items-center space-x-2 text-zinc-400">
                  <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
                  <span>Token:</span>
                  <span className="text-zinc-200 font-mono tracking-wider">{status.token}</span>
                </div>
                <button
                  onClick={handleRegenerateToken}
                  disabled={loading}
                  className="flex items-center space-x-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                  title="Regenerar token para desconectar sesiones anteriores"
                >
                  <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                  <span>Regenerar</span>
                </button>
              </div>

              {/* Tips & Instructions */}
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-zinc-300 space-y-1.5">
                <p className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span>💡 Consejos de uso:</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-zinc-400 text-[10.5px]">
                  <li>
                    Tu móvil debe estar conectado a tu <strong>misma red WiFi</strong> (o tener <strong>Tailscale</strong> activo si estás fuera de casa con datos 4G/5G).
                  </li>
                  <li>
                    En el navegador del móvil, pulsa en <em>"Añadir a la pantalla de inicio"</em> para instalarlo como app nativa a pantalla completa.
                  </li>
                  <li>
                    En la barra inferior del móvil puedes escribir órdenes como <code>npm test</code> o prompts directos para tus agentes y presionar <strong>Enviar</strong>.
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-zinc-500 space-y-2">
              <Smartphone size={36} className="mx-auto text-zinc-600 mb-2" />
              <p className="text-zinc-300 font-semibold text-sm">El servidor remoto está apagado</p>
              <p className="text-[11px]">
                Haz clic en "Iniciar" para activar la conexión móvil y generar el código QR.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
