import React, { useState } from 'react'
import { Sparkles, ArrowDownCircle, RotateCw, X, DownloadCloud } from 'lucide-react'
import { UpdateStatusPayload } from '../types'

interface UpdateNotificationToastProps {
  status: UpdateStatusPayload | null
  onDownload: () => void
  onRestart: () => void
  onOpenSettings: () => void
}

export const UpdateNotificationToast: React.FC<UpdateNotificationToastProps> = ({
  status,
  onDownload,
  onRestart,
  onOpenSettings
}) => {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  if (!status || status.state === 'idle' || status.state === 'checking' || status.state === 'not-available') {
    return null
  }

  // If user dismissed this version's notification
  if (status.info?.version && dismissedVersion === status.info.version && status.state !== 'downloaded') {
    return null
  }

  return (
    <div className="fixed bottom-10 right-4 z-50 max-w-sm w-full bg-[#12151b]/95 backdrop-blur-md border border-emerald-500/40 rounded-xl shadow-2xl p-4 font-mono text-xs text-zinc-200 animate-in slide-in-from-bottom-5 duration-200 select-none">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
          {status.state === 'downloaded' ? (
            <Sparkles size={16} className="text-emerald-400 animate-pulse" />
          ) : status.state === 'downloading' ? (
            <DownloadCloud size={16} className="text-cyan-400 animate-bounce" />
          ) : (
            <ArrowDownCircle size={16} className="text-emerald-400" />
          )}
          <span>
            {status.state === 'downloaded'
              ? 'ACTUALIZACIÓN LISTA'
              : status.state === 'downloading'
                ? 'DESCARGANDO VERSIÓN'
                : 'NUEVA VERSIÓN DETECTADA'}
          </span>
        </div>

        <button
          onClick={() => setDismissedVersion(status.info?.version || 'dismissed')}
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
          title="Descartar aviso"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-2 text-zinc-300 text-[11px] leading-relaxed">
        {status.state === 'downloaded' ? (
          <p>
            NeoWork <strong className="text-emerald-400 font-bold">v{status.info?.version}</strong> se descargó
            con éxito. Reinicia la aplicación para aplicar las mejoras.
          </p>
        ) : status.state === 'downloading' ? (
          <div>
            <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
              <span>{status.progress ? `${status.progress.transferredMb}MB / ${status.progress.totalMb}MB` : 'Descargando...'}</span>
              <span className="text-cyan-400 font-bold">{status.progress?.percent || 0}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-150"
                style={{ width: `${status.progress?.percent || 0}%` }}
              />
            </div>
          </div>
        ) : (
          <p>
            Está disponible la versión <strong className="text-emerald-400 font-bold">v{status.info?.version}</strong>.
            Contiene nuevas características y optimizaciones.
          </p>
        )}
      </div>

      <div className="mt-3.5 pt-2.5 border-t border-zinc-800/80 flex items-center justify-end space-x-2">
        <button
          onClick={onOpenSettings}
          className="px-2.5 py-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Ver detalles
        </button>

        {status.state === 'available' && (
          <button
            onClick={onDownload}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-[11px] transition-colors shadow-md shadow-emerald-500/20"
          >
            <DownloadCloud size={13} />
            <span>Descargar</span>
          </button>
        )}

        {status.state === 'downloaded' && (
          <button
            onClick={onRestart}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-[11px] transition-colors shadow-lg shadow-emerald-500/30"
          >
            <RotateCw size={13} />
            <span>Reiniciar Ahora</span>
          </button>
        )}
      </div>
    </div>
  )
}
