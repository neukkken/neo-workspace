import React, { useEffect, useSyncExternalStore } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'

// House replacements for window.alert / window.confirm: callable from anywhere, rendered once in App
interface Toast {
  id: number
  message: string
  kind: 'ok' | 'error'
}

interface PendingConfirm {
  message: string
  resolve: (ok: boolean) => void
}

const VISIBLE_MS = 5000

let toasts: Toast[] = []
let pending: PendingConfirm | null = null
let nextId = 1
const listeners = new Set<() => void>()

const emit = (): void => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const dismiss = (id: number): void => {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export const notify = (message: string, kind: Toast['kind'] = 'ok'): void => {
  const id = nextId++
  toasts = [...toasts, { id, message, kind }]
  emit()
  setTimeout(() => dismiss(id), VISIBLE_MS)
}

export const confirmDialog = (message: string): Promise<boolean> =>
  new Promise((resolve) => {
    pending?.resolve(false)
    pending = { message, resolve }
    emit()
  })

const answer = (ok: boolean): void => {
  pending?.resolve(ok)
  pending = null
  emit()
}

export const Dialogs: React.FC = () => {
  const visibleToasts = useSyncExternalStore(subscribe, () => toasts)
  const confirm = useSyncExternalStore(subscribe, () => pending)

  useEffect(() => {
    if (!confirm) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Capture + stopImmediate: Escape answers this dialog only, not the modal underneath
      e.stopImmediatePropagation()
      answer(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [confirm])

  return (
    <>
      {visibleToasts.length > 0 && (
        <div role="status" className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-1.5">
          {visibleToasts.map((toast) => (
            <div
              key={toast.id}
              className="island flex items-start gap-2.5 p-3 max-w-md text-xs text-zinc-100 select-none"
            >
              {toast.kind === 'error' ? (
                <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Check size={14} className="text-signal shrink-0 mt-0.5" />
              )}
              <span className="flex-1 min-w-0 break-words">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Descartar aviso"
                className="p-0.5 rounded-control text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xs select-none"
          onClick={() => answer(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-describedby="confirm-dialog-message"
            className="bg-void border border-zinc-700/80 rounded-button w-full max-w-md p-5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="confirm-dialog-message" className="text-zinc-200 leading-relaxed pb-4">
              {confirm.message}
            </p>
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => answer(false)}
                className="px-3 py-1.5 rounded-control border border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => answer(true)}
                className="px-3.5 py-1.5 rounded-control bg-signal hover:bg-signal/85 text-zinc-950 font-medium transition-colors cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
