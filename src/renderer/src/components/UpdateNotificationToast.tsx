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
    <div className="fixed bottom-10 right-4 z-50 max-w-sm w-full bg-void/95 backdrop-blur-md border border-white/15 rounded-card p-4 text-xs text-zinc-200 animate-in slide-in-from-bottom-5 duration-200 select-none">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2 text-zinc-100 font-medium">
          {status.state === 'downloaded' ? (
            <Sparkles size={16} className="text-zinc-100 animate-pulse" />
          ) : status.state === 'downloading' ? (
            <DownloadCloud size={16} className="text-zinc-300 animate-bounce" />
          ) : (
            <ArrowDownCircle size={16} className="text-zinc-100" />
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
          className="p-1 rounded-control text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
          title="Descartar aviso"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-2 text-zinc-300 text-[11px] leading-relaxed">
        {status.state === 'downloaded' ? (
          <p>
            NeoWork <strong className="text-zinc-100 font-medium">v{status.info?.version}</strong> se descargó
            con éxito. Reinicia la aplicación para aplicar las mejoras.
          </p>
        ) : status.state === 'downloading' ? (
          <div>
            <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
              <span>{status.progress ? `${status.progress.transferredMb}MB / ${status.progress.totalMb}MB` : 'Descargando...'}</span>
              <span className="text-zinc-300 font-medium">{status.progress?.percent || 0}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-100 transition-all duration-150"
                style={{ width: `${status.progress?.percent || 0}%` }}
              />
            </div>
          </div>
        ) : (
          <p>
            Está disponible la versión <strong className="text-zinc-100 font-medium">v{status.info?.version}</strong>.
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
            className="flex items-center space-x-1.5 px-3 py-1 rounded-control bg-signal hover:bg-signal/85 text-zinc-950 font-medium text-[11px] transition-colors"
          >
            <DownloadCloud size={13} />
            <span>Descargar</span>
          </button>
        )}

        {status.state === 'downloaded' && (
          <button
            onClick={onRestart}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-control bg-signal hover:bg-signal/85 text-zinc-950 font-medium text-[11px] transition-colors"
          >
            <RotateCw size={13} />
            <span>Reiniciar Ahora</span>
          </button>
        )}
      </div>
    </div>
  )
}
