import React, { useState } from 'react'
import { Save, Settings, Check, Terminal } from 'lucide-react'

interface StatusBarProps {
  onSave: () => Promise<void>
  onOpenSettings: () => void
  activePanelsCount: number
}

export const StatusBar: React.FC<StatusBarProps> = ({
  onSave,
  onOpenSettings,
  activePanelsCount
}) => {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    await onSave()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <footer className="h-8 bg-[#090b0e] border-t border-zinc-800/80 px-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none">
      {/* Left Status info */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1 text-emerald-400">
          <Terminal size={11} />
          <span className="font-semibold text-zinc-300">LAUNCHPAD ACTIVE</span>
        </div>
        <span className="text-zinc-600">//</span>
        <span className="text-zinc-400">MULTI-CONSOLE ORCHESTRATOR</span>
        <span className="text-zinc-600">//</span>
        <span className="text-zinc-500">[{activePanelsCount} ACTIVE PTYs]</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-1 px-2.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors"
          title="Save all workspaces configuration to disk"
        >
          {saved ? (
            <>
              <Check size={11} className="text-emerald-400" />
              <span className="text-emerald-400">SAVED</span>
            </>
          ) : (
            <>
              <Save size={11} className="text-zinc-400" />
              <span>SAVE</span>
            </>
          )}
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center space-x-1 px-2.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors"
          title="Open Settings"
        >
          <Settings size={11} className="text-zinc-400" />
          <span>SETTINGS</span>
        </button>
      </div>
    </footer>
  )
}
