import React from 'react'
import { X, Sliders, Info, ShieldCheck, Terminal, RotateCcw } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onResetDefaults: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onResetDefaults
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none">
      <div className="bg-[#0f1115] border border-zinc-700/80 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
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
        <div className="p-5 space-y-4 font-mono text-xs">
          {/* Info block */}
          <div className="bg-[#0b0d10] border border-zinc-800 rounded-md p-3 space-y-2">
            <div className="flex items-center space-x-2 text-zinc-200 font-semibold">
              <Terminal size={13} className="text-emerald-400" />
              <span>NeoWork Core Orchestrator</span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Native multi-console terminal manager designed for developers. Organizes project
              workspaces and automatically boots development processes in target working directories.
            </p>
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
                if (confirm('Are you sure you want to reset workspaces to default?')) {
                  onResetDefaults()
                  onClose()
                }
              }}
              className="flex items-center space-x-1 px-3 py-1.5 rounded border border-red-900/50 hover:border-red-600 bg-red-950/20 hover:bg-red-950/40 text-red-300 transition-colors"
            >
              <RotateCcw size={11} />
              <span>Reset Default Workspaces</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
