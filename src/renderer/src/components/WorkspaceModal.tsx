import React, { useState } from 'react'
import { X, Plus, Trash2, FolderOpen, Terminal, Check, Sparkles } from 'lucide-react'
import { Workspace, PanelConfig } from '../types'

interface PresetTemplate {
  name: string
  description: string
  defaultName: string
  panels: Array<{ title: string; command: string; autoStart: boolean }>
}

const PRESET_TEMPLATES: Record<string, PresetTemplate> = {
  fullstack: {
    name: 'Full-Stack Web',
    defaultName: 'FullStack App',
    description: 'Frontend Vite + Backend Node + Docker',
    panels: [
      { title: 'FRONTEND-DEV', command: 'npm run dev', autoStart: true },
      { title: 'BACKEND-API', command: 'npm run start:dev', autoStart: true },
      { title: 'DB-DOCKER', command: 'docker compose up', autoStart: false }
    ]
  },
  python_ai: {
    name: 'Python & AI',
    defaultName: 'AI Service',
    description: 'FastAPI Server + Worker + Scripts',
    panels: [
      { title: 'API-SERVER', command: 'uvicorn main:app --reload', autoStart: true },
      { title: 'WORKER-TASK', command: 'celery -A tasks worker --loglevel=info', autoStart: false },
      { title: 'SCRIPTS-CLI', command: '', autoStart: false }
    ]
  },
  microservices: {
    name: 'Microservicios',
    defaultName: 'Microservices Cluster',
    description: 'Gateway + Auth + Core + Docker',
    panels: [
      { title: 'API-GATEWAY', command: 'npm run dev', autoStart: true },
      { title: 'AUTH-SERVICE', command: 'npm run dev', autoStart: true },
      { title: 'CORE-SERVICE', command: 'npm run dev', autoStart: true },
      { title: 'DOCKER-INFRA', command: 'docker ps', autoStart: false }
    ]
  },
  mobile: {
    name: 'Mobile App',
    defaultName: 'Mobile Project',
    description: 'React Native / Metro + API',
    panels: [
      { title: 'METRO-BUNDLER', command: 'npx expo start', autoStart: true },
      { title: 'BACKEND-API', command: 'npm run dev', autoStart: true }
    ]
  }
}

interface WorkspaceModalProps {
  workspace: Workspace | null
  isOpen: boolean
  isRunning?: boolean
  onClose: () => void
  onSave: (workspace: Workspace) => void
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  workspace,
  isOpen,
  isRunning = false,
  onClose,
  onSave
}) => {
  const isEditing = !!workspace

  const [name, setName] = useState(workspace?.name || '')
  const [code, setCode] = useState(workspace?.code || '01')
  const [panels, setPanels] = useState<PanelConfig[]>(
    workspace?.panels || [
      {
        id: `panel-${Date.now()}-1`,
        title: 'TERMINAL-1',
        cwd: '',
        command: '',
        autoStart: true
      }
    ]
  )

  const [panelSuggestions, setPanelSuggestions] = useState<Record<number, Array<{ label: string; command: string }>>>({})
  const [showEnvMap, setShowEnvMap] = useState<Record<number, boolean>>({})
  const [envInputs, setEnvInputs] = useState<Record<number, string>>({})

  const inspectFolder = async (index: number, folderPath: string): Promise<void> => {
    if (!folderPath || !folderPath.trim()) return
    try {
      const inspection = await window.neoAPI.inspectProject(folderPath.trim())
      if (inspection.suggestedCommands && inspection.suggestedCommands.length > 0) {
        setPanelSuggestions((prev) => ({
          ...prev,
          [index]: inspection.suggestedCommands
        }))
      }
      if (!name.trim() && inspection.name) {
        setName(inspection.name)
      }
    } catch {}
  }

  React.useEffect(() => {
    if (isOpen) {
      setName(workspace?.name || '')
      setCode(workspace?.code || '01')
      const initialPanels =
        workspace?.panels && workspace.panels.length > 0
          ? workspace.panels.map((p) => ({ ...p }))
          : [
              {
                id: `panel-${Date.now()}-1`,
                title: 'TERMINAL-1',
                cwd: '',
                command: '',
                autoStart: true
              }
            ]
      setPanels(initialPanels)
      const initialEnv: Record<number, string> = {}
      initialPanels.forEach((p, i) => {
        if (p.env) {
          initialEnv[i] = Object.entries(p.env)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n')
        }
      })
      setEnvInputs(initialEnv)
    }
  }, [workspace, isOpen])

  if (!isOpen) return null

  const handleApplyPreset = (preset: PresetTemplate): void => {
    if (!name.trim()) {
      setName(preset.defaultName)
    }
    const generatedPanels: PanelConfig[] = preset.panels.map((p, idx) => ({
      id: `panel-${Date.now()}-${idx + 1}`,
      title: p.title,
      cwd: panels[0]?.cwd || '',
      command: p.command,
      autoStart: p.autoStart
    }))
    setPanels(generatedPanels)
  }

  const handleAddPanel = (): void => {
    const newId = `panel-${Date.now()}-${panels.length + 1}`
    setPanels([
      ...panels,
      {
        id: newId,
        title: `PANEL-${panels.length + 1}`,
        cwd: '',
        command: '',
        autoStart: true
      }
    ])
  }

  const handleRemovePanel = (index: number): void => {
    if (panels.length <= 1) return
    setPanels(panels.filter((_, i) => i !== index))
  }

  const handleUpdatePanel = (index: number, field: keyof PanelConfig, value: unknown): void => {
    const updated = [...panels]
    updated[index] = { ...updated[index], [field]: value }
    setPanels(updated)
  }

  const handleBrowseFolder = async (index: number): Promise<void> => {
    const current = panels[index].cwd
    const selected = await window.neoAPI.selectDirectory(current)
    if (selected) {
      handleUpdatePanel(index, 'cwd', selected)
      inspectFolder(index, selected)
    }
  }

  const handleExportNeoworkJson = async (): Promise<void> => {
    const targetDir = panels[0]?.cwd
    if (!targetDir) {
      alert('Configura primero una carpeta para el primer panel para guardar .neowork.json')
      return
    }
    const wsToSave = {
      name: name.trim() || 'My Workspace',
      code: code.trim() || '01',
      panels: panels.map((p) => ({
        title: p.title,
        cwd: '.',
        command: p.command,
        autoStart: p.autoStart
      }))
    }
    const success = await window.neoAPI.writeNeoworkConfig(targetDir, wsToSave)
    if (success) {
      alert(`¡Archivo .neowork.json guardado con éxito en ${targetDir}!`)
    } else {
      alert('No se pudo guardar el archivo .neowork.json')
    }
  }

  const handleImportNeoworkJson = async (): Promise<void> => {
    const targetDir = panels[0]?.cwd
    const selectedDir = targetDir || (await window.neoAPI.selectDirectory())
    if (!selectedDir) return
    const config = await window.neoAPI.readNeoworkConfig(selectedDir)
    if (config) {
      if (config.name) setName(config.name)
      if (config.code) setCode(config.code)
      if (Array.isArray(config.panels)) {
        setPanels(
          config.panels.map((p: any, i: number) => ({
            id: `panel-${Date.now()}-${i + 1}`,
            title: p.title || `PANEL-${i + 1}`,
            cwd: selectedDir,
            command: p.command || '',
            autoStart: p.autoStart ?? true
          }))
        )
      }
      alert('¡Configuración .neowork.json cargada con éxito!')
    } else {
      alert(`No se encontró un archivo .neowork.json en ${selectedDir}`)
    }
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!name.trim()) return

    const finalWorkspace: Workspace = {
      ...workspace,
      id: workspace?.id || `ws-${Date.now()}`,
      name: name.trim(),
      code: code.trim() || '01',
      panels: panels.map((p, idx) => {
        let envObj: Record<string, string> | undefined
        const envStr = envInputs[idx]
        if (envStr && envStr.trim()) {
          envObj = {}
          envStr.split('\n').forEach((line) => {
            const parts = line.split('=')
            if (parts.length >= 2) {
              const k = parts[0].trim()
              const v = parts.slice(1).join('=').trim()
              if (k) envObj![k] = v
            }
          })
        }
        return {
          ...p,
          title: p.title.trim() || 'TERMINAL',
          cwd: p.cwd.trim(),
          env: envObj
        }
      })
    }

    onSave(finalWorkspace)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none">
      <div className="bg-[#0f1115] border border-zinc-700/80 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#14171d] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-mono font-semibold text-zinc-100">
            <Terminal size={15} className="text-emerald-400" />
            <span>{isEditing ? 'EDIT WORKSPACE' : 'CREATE NEW WORKSPACE'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Running workspace notice banner */}
          {isEditing && isRunning && (
            <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200/90 text-xs font-mono flex items-start space-x-2.5">
              <span className="text-amber-400 font-bold shrink-0 mt-0.5">💡</span>
              <div className="leading-relaxed">
                <span className="font-semibold text-amber-300">Workspace en ejecución:</span>{' '}
                Los cambios se guardarán sin reiniciar ni cerrar tus terminales activas para no interrumpir tu trabajo. Se aplicarán la próxima vez que reinicies el workspace.
              </div>
            </div>
          )}

          {/* Template Presets Picker (New Workspaces Only) */}
          {!isEditing && (
            <div className="space-y-1.5 p-3 rounded-lg bg-[#0a0c0f] border border-zinc-800/90">
              <label className="text-[11px] font-mono text-zinc-400 flex items-center space-x-1.5 font-medium">
                <Sparkles size={12} className="text-amber-400" />
                <span>PLANTILLAS PREDEFINIDAS (OPCIONAL)</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {Object.entries(PRESET_TEMPLATES).map(([key, tpl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleApplyPreset(tpl)}
                    className="text-left p-2 rounded bg-zinc-900/80 border border-zinc-800/80 hover:border-emerald-500/60 hover:bg-zinc-800/90 transition-all text-xs group cursor-pointer"
                  >
                    <div className="font-semibold text-zinc-200 group-hover:text-emerald-400 font-mono text-[11px] truncate">
                      {tpl.name}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Workspace General Info */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3 space-y-1">
              <label className="text-[11px] font-mono font-medium text-zinc-400">WORKSPACE NAME</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. EFAStack, BackendAPI"
                className="w-full bg-[#0a0c0e] border border-zinc-800 focus:border-emerald-500 focus:outline-none rounded px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 transition-colors"
              />
            </div>
            <div className="col-span-1 space-y-1">
              <label className="text-[11px] font-mono font-medium text-zinc-400">CODE / TAG</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="01"
                className="w-full bg-[#0a0c0e] border border-zinc-800 focus:border-emerald-500 focus:outline-none rounded px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 transition-colors"
              />
            </div>
          </div>

          {/* Panels Header */}
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
            <div className="text-[11px] font-mono font-medium text-zinc-400 tracking-wider">
              TERMINAL PANELS ({panels.length})
            </div>
            <button
              type="button"
              onClick={handleAddPanel}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
            >
              <Plus size={12} className="text-emerald-400" />
              <span>Add Panel</span>
            </button>
          </div>

          {/* Panels List */}
          <div className="space-y-3">
            {panels.map((p, idx) => (
              <div
                key={p.id || idx}
                className="bg-[#0b0d10] border border-zinc-800 rounded-md p-3 space-y-2.5 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[11px] font-mono font-semibold text-zinc-300">
                      PANEL #{idx + 1}
                    </span>
                  </div>
                  {panels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePanel(idx)}
                      className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove panel"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Panel Title */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-zinc-500">TITLE</label>
                    <input
                      type="text"
                      value={p.title}
                      onChange={(e) => handleUpdatePanel(idx, 'title', e.target.value)}
                      placeholder="e.g. FRONTEND-DEV"
                      className="w-full bg-[#12151a] border border-zinc-800/90 focus:border-zinc-700 rounded px-2.5 py-1 text-xs font-mono text-zinc-200"
                    />
                  </div>

                  {/* Startup Command */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-zinc-500">AUTO-RUN COMMAND</label>
                    <input
                      type="text"
                      value={p.command}
                      onChange={(e) => handleUpdatePanel(idx, 'command', e.target.value)}
                      placeholder="e.g. npm run dev"
                      className="w-full bg-[#12151a] border border-zinc-800/90 focus:border-zinc-700 rounded px-2.5 py-1 text-xs font-mono text-emerald-400 placeholder:text-zinc-600"
                    />
                    {panelSuggestions[idx] && panelSuggestions[idx].length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 items-center">
                        <span className="text-[9px] font-mono text-zinc-500">Sugerencias:</span>
                        {panelSuggestions[idx].slice(0, 5).map((s) => (
                          <button
                            key={s.command}
                            type="button"
                            onClick={() => handleUpdatePanel(idx, 'command', s.command)}
                            className="px-1.5 py-0.2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono transition-colors cursor-pointer"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Directory Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500">WORKING DIRECTORY (PATH)</label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={p.cwd}
                      onChange={(e) => {
                        handleUpdatePanel(idx, 'cwd', e.target.value)
                        inspectFolder(idx, e.target.value)
                      }}
                      placeholder="/home/user/project or C:\dev\project (leave empty for home)"
                      className="flex-1 bg-[#12151a] border border-zinc-800/90 focus:border-zinc-700 rounded px-2.5 py-1 text-xs font-mono text-zinc-200 placeholder:text-zinc-600"
                    />
                    <button
                      type="button"
                      onClick={() => handleBrowseFolder(idx)}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors shrink-0"
                    >
                      <FolderOpen size={12} className="text-amber-400" />
                      <span>Browse</span>
                    </button>
                  </div>
                </div>

                {/* Auto start toggle */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center space-x-2 text-[11px] font-mono text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.autoStart}
                      onChange={(e) => handleUpdatePanel(idx, 'autoStart', e.target.checked)}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-0 bg-zinc-900"
                    />
                    <span>Execute command automatically on workspace load</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowEnvMap((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showEnvMap[idx] ? 'Ocultar ENV ▲' : '+ Variables ENV ▼'}
                  </button>
                </div>

                {/* Environment variables textarea */}
                {showEnvMap[idx] && (
                  <div className="pt-1.5">
                    <label className="text-[10px] font-mono text-zinc-500 block mb-1">
                      VARIABLES DE ENTORNO (KEY=VALUE, un par por línea)
                    </label>
                    <textarea
                      rows={2}
                      value={envInputs[idx] || ''}
                      onChange={(e) => setEnvInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                      placeholder="PORT=3000&#10;NODE_ENV=development"
                      className="w-full bg-[#12151a] border border-zinc-800 rounded p-1.5 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleImportNeoworkJson}
                className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-colors"
                title="Cargar configuración desde archivo .neowork.json"
              >
                Cargar .neowork.json
              </button>
              <button
                type="button"
                onClick={handleExportNeoworkJson}
                className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-colors"
                title="Guardar archivo .neowork.json en la carpeta del proyecto para Git"
              >
                Guardar en repo (.neowork.json)
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded border border-zinc-700/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs font-mono transition-colors cursor-pointer"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>Save Workspace</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
