import { useState, useEffect, useCallback, useRef } from 'react'
import { useOpenClawContext } from '../context/OpenClawContext'
import Terminal from '../components/Terminal'
import SetupWizard from '../components/SetupWizard'
import GatewayChat from '../components/GatewayChat'
import { gatewayRefs } from '../App'
import TasksPanel from '../components/TasksPanel'
import { Download, Loader2, Trash2, X, Info, Zap, Plus, HardDrive, Monitor } from 'lucide-react'
import { getOrCreateGatewayPort } from '../lib/gatewayPort'

type FlowState = 'loading' | 'install' | 'installing' | 'uninstalling' | 'setup' | 'ready'

// --- Uninstall Menu ---
function UninstallMenu({ onDeleteAll, onManageModels, onClose }: {
  onDeleteAll: () => void
  onManageModels: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-[340px] rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Manage Installation</span>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <div className="p-3 space-y-2">
          <button
            onClick={onManageModels}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:opacity-80"
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}
          >
            <HardDrive size={16} style={{ color: 'var(--accent-blue)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Manage models</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Delete individual models to free up space</p>
            </div>
          </button>
          <button
            onClick={onDeleteAll}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:opacity-80"
            style={{ background: 'rgba(248,81,73,0.05)', border: '1px solid rgba(248,81,73,0.2)' }}
          >
            <Trash2 size={16} style={{ color: '#f85149' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#f85149' }}>Delete everything</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Remove all models, config, and components</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Confirm Dialog ---
function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onCancel}>
      <div className="w-[360px] rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-lg"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-medium rounded-lg"
            style={{ background: danger ? '#f85149' : 'var(--accent-blue)', color: '#fff' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Model Manager ---
interface OllamaModel { name: string; size: number }

function ModelManager({ onClose, onModelDeleted }: { onClose: () => void; onModelDeleted: () => void }) {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const loadModels = async () => {
    setLoading(true)
    try {
      const resp = await fetch('http://127.0.0.1:11434/api/tags')
      const data = await resp.json()
      setModels((data.models || []).map((m: any) => ({ name: m.name, size: m.size || 0 })))
    } catch {
      setModels([])
    }
    setLoading(false)
  }

  useEffect(() => { loadModels() }, [])

  const deleteModel = async (name: string) => {
    setDeleting(name)
    setConfirmDelete(null)
    try {
      await fetch('http://127.0.0.1:11434/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      onModelDeleted()
    } catch {}
    await loadModels()
    setDeleting(null)
  }

  const formatSize = (bytes: number) => {
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
    return `${bytes} B`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-[420px] max-h-[70vh] rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <HardDrive size={14} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Installed Models</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 size={20} className="animate-spin mx-auto mb-2" style={{ color: 'var(--accent-blue)' }} />
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No models installed</p>
            </div>
          ) : models.map(m => (
            <div key={m.name} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatSize(m.size)}</p>
              </div>
              {deleting === m.name ? (
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <button
                  onClick={() => setConfirmDelete(m.name)}
                  className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                  style={{ color: '#f85149' }}
                  title="Delete model"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {confirmDelete && (
          <ConfirmDialog
            title="Delete model?"
            message={`This will remove "${confirmDelete}" from your device. You can re-download it later.`}
            confirmLabel="Delete"
            danger
            onConfirm={() => deleteModel(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </div>
    </div>
  )
}

const isElectron = !!window.electronAPI?.isElectron
const isWin = (window.electronAPI?.platform || navigator.platform) === 'win32'
const LOCAL_SUBDIR = '.overclaw/local'

async function sh(command: string): Promise<string> {
  if (!isElectron) throw new Error('Not in Electron')
  if (isWin) {
    command = command.replace(/ 2>\/dev\/null/g, ' 2>nul')
    command = command.replace(/ >\/dev\/null/g, ' >nul')
    command = command.replace(/ 2>&1/g, '')
    command = command.replace(/ \|\| true/g, '')
  }
  return window.electronAPI!.exec(command, [])
}

async function getHome(): Promise<string> {
  if (isElectron) return window.electronAPI!.getHomedir()
  throw new Error('Not in Electron')
}

function localDir(homedir: string) { return `${homedir}/${LOCAL_SUBDIR}` }
function ocEnv(homedir: string) { return `OPENCLAW_STATE_DIR="${localDir(homedir)}"` }

// --- Performance Info Popup ---
function PerformancePopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-[440px] rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Info size={18} style={{ color: 'var(--accent-blue)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Running AI Locally</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="space-y-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p>
            Local AI models run entirely on your device — your conversations never leave this machine. The speed of responses depends purely on your hardware (CPU, RAM, and GPU).
          </p>
          <p>
            If you find responses too slow, you have a few options:
          </p>
          <ul className="space-y-1.5 ml-4">
            <li className="flex items-start gap-2">
              <Zap size={12} className="mt-1 shrink-0" style={{ color: '#22c55e' }} />
              <span>Switch to the <strong>Fast</strong> model for quicker replies on simpler tasks</span>
            </li>
            <li className="flex items-start gap-2">
              <Zap size={12} className="mt-1 shrink-0" style={{ color: 'var(--accent-blue)' }} />
              <span>Use the <strong>Cloud</strong> tab for instant responses powered by cloud AI — much faster and more capable, with a small per-message cost</span>
            </li>
          </ul>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 px-4 py-2.5 text-sm font-medium rounded-lg"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

export default function LocalPage() {
  const { status, loading, fetchStatus } = useOpenClawContext()
  const [flow, setFlow] = useState<FlowState>('loading')
  const [installLines, setInstallLines] = useState<{ type: 'output' | 'error' | 'complete'; data: string; command: string }[]>([])
  const [localPort] = useState<number>(() => getOrCreateGatewayPort('overclaw-local-port'))
  const [gatewayUrl, setGatewayUrl] = useState(`ws://localhost:${localPort}`)
  const [gatewayToken, setGatewayToken] = useState('')
  const [localStateDir, setLocalStateDir] = useState('')
  const [showPerfPopup, setShowPerfPopup] = useState(false)
  const [showUninstallMenu, setShowUninstallMenu] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showModelManager, setShowModelManager] = useState(false)
  const [showAddModels, setShowAddModels] = useState(false)
  const wsRequestRef = useRef<((method: string, params: any) => Promise<any>) | null>(null)
  const clearChatRef = useRef<(() => void) | null>(null)

  const initialCheckDone = useRef(false)
  useEffect(() => {
    if (loading && !status) return
    if (initialCheckDone.current) return
    initialCheckDone.current = true

    const checkState = async () => {
      const homedir = await getHome()
      const dir = localDir(homedir)
      const env = ocEnv(homedir)
      setLocalStateDir(dir)

      // Check if config exists (primary source of truth)
      let configExists = false
      try {
        if (window.electronAPI?.fileExists) {
          configExists = await window.electronAPI.fileExists(`${dir}/openclaw.json`)
        } else {
          await sh(`cat "${dir}/openclaw.json"`)
          configExists = true
        }
      } catch {}

      if (!configExists) {
        localStorage.removeItem('overclaw-setup-complete')
        setFlow('install')
        return
      }

      // Config exists — check if gateway is running
      let gatewayReachable = false
      try {
        const raw = window.electronAPI?.readFile ? await window.electronAPI.readFile(`${dir}/openclaw.json`) : await sh(`cat "${dir}/openclaw.json"`)
        const config = JSON.parse(raw)
        const port = config?.gateway?.port || localPort
        const resp = await fetch(`http://127.0.0.1:${port}/`)
        if (resp.ok || resp.status < 500) gatewayReachable = true
      } catch {}

      if (gatewayReachable) {
        await loadGatewayAuth()
        setFlow('ready')
      } else {
        try {
          if (window.electronAPI?.killPort) {
            try { await window.electronAPI.killPort(localPort) } catch {}
          } else {
            try { await sh('lsof -ti:${localPort} | xargs kill -9 2>/dev/null || true') } catch {}
          }
          if (window.electronAPI?.startGatewayDetached) {
            await window.electronAPI.startGatewayDetached('openclaw', ['gateway', 'run', '--port', String(localPort)], { OPENCLAW_STATE_DIR: dir }, `${dir}/gateway.log`)
          } else {
            await sh(`${env} nohup openclaw gateway run --port ${localPort} > "${dir}/gateway.log" 2>&1 &`)
          }
          await new Promise(r => setTimeout(r, 3000))
          await loadGatewayAuth()
          setFlow('ready')
        } catch {
          localStorage.removeItem('overclaw-setup-complete')
          setFlow('install')
        }
      }
    }

    checkState()
  }, [loading, status])

  // Show performance popup once per session when entering ready state
  const perfShownRef = useRef(false)
  useEffect(() => {
    if (flow === 'ready' && !perfShownRef.current) {
      perfShownRef.current = true
      setShowPerfPopup(true)
    }
  }, [flow])

  const loadGatewayAuth = useCallback(async () => {
    try {
      const homedir = await getHome()
      const dir = localDir(homedir)
      const env = ocEnv(homedir)
      const ea = window.electronAPI!
      const raw = ea.readFile ? await ea.readFile(`${dir}/openclaw.json`) : await sh(`cat "${dir}/openclaw.json"`)
      const config = JSON.parse(raw)
      const token = config?.gateway?.auth?.token || ''
      const port = config?.gateway?.port || localPort
      setGatewayUrl(`ws://localhost:${port}`)
      setGatewayToken(token)

      if (!config?.gateway?.controlUi?.allowInsecureAuth) {
        if (!config.gateway) config.gateway = {}
        if (!config.gateway.controlUi) config.gateway.controlUi = {}
        config.gateway.controlUi.allowInsecureAuth = true
        const configJson = JSON.stringify(config, null, 2)
        if (ea.writeFileSafe) {
          await ea.writeFileSafe(`${dir}/openclaw.json`, configJson)
        } else {
          const tmpConfig = `/tmp/overclaw-local-config-patch-${Date.now()}.json`
          await sh(`cat > ${tmpConfig} << 'OCEOF'\n${configJson}\nOCEOF`)
          await sh(`mv ${tmpConfig} "${dir}/openclaw.json"`)
        }
        if (ea.killPort) {
          try { await ea.killPort(localPort) } catch {}
        } else {
          try { await sh('lsof -ti:${localPort} | xargs kill -9 2>/dev/null || true') } catch {}
        }
        if (ea.startGatewayDetached) {
          try { await ea.startGatewayDetached('openclaw', ['gateway', 'run', '--port', String(localPort)], { OPENCLAW_STATE_DIR: dir }, `${dir}/gateway.log`) } catch {}
        } else {
          try { await sh(`${env} nohup openclaw gateway run --port ${localPort} > "${dir}/gateway.log" 2>&1 &`) } catch {}
        }
        await new Promise(r => setTimeout(r, 3000))
      }
    } catch {
      setGatewayUrl(`ws://localhost:${localPort}`)
      setGatewayToken('')
    }
  }, [])

  const handleInstall = useCallback(async () => {
    setFlow('installing')
    setInstallLines([])

    const addLine = (type: string, data: string) => {
      setInstallLines(prev => [...prev, { type: type as 'output' | 'error' | 'complete', data, command: 'install' }])
    }

    if (!isElectron) {
      addLine('error', 'Install only available in the desktop app')
      return
    }

    try {
      addLine('output', '🗑️  Removing existing installation...')
      const homedir = await getHome()
      const dir = localDir(homedir)
      const env = ocEnv(homedir)
      try { await sh(`${env} openclaw gateway stop`) } catch {}
      try { await sh(`rm -rf "${dir}"`) } catch {}
      addLine('output', '✅ Clean slate ready')

      localStorage.removeItem('overclaw-setup-complete')

      addLine('output', '')
      addLine('output', '📦 Installing components...')

      const api = window.electronAPI!
      const streamId = `install-${Date.now()}`

      await new Promise<void>((resolve, reject) => {
        const cleanup = api.onExecData((id: string, type: string, data: string) => {
          if (id !== streamId) return
          addLine(type, data)
          if (type === 'complete') {
            cleanup()
            if (data.includes('code 0') || data.includes('exit code 0')) resolve()
            else reject(new Error(data))
          }
        })
        api.execStream(streamId, 'bash', ['-c', 'curl -fsSL https://openclaw.ai/install.sh | bash'])
      })

      addLine('output', '')
      addLine('output', '✅ Installation complete!')

      await fetchStatus()
      setTimeout(() => setFlow('setup'), 1000)
    } catch (err: any) {
      addLine('error', `❌ Installation failed: ${err.message}`)
      setTimeout(() => setFlow('install'), 3000)
    }
  }, [fetchStatus])

  const handleSetupComplete = useCallback(async () => {
    localStorage.setItem('overclaw-setup-complete', 'true')
    await fetchStatus()
    await loadGatewayAuth()
    setFlow('ready')
  }, [fetchStatus, loadGatewayAuth])

  const handleUninstall = useCallback(async () => {
    setFlow('uninstalling')
    setInstallLines([])

    const addLine = (type: string, data: string) => {
      setInstallLines(prev => [...prev, { type: type as 'output' | 'error' | 'complete', data, command: 'uninstall' }])
    }

    try {
      const homedir = await getHome()
      const dir = localDir(homedir)
      const env = ocEnv(homedir)
      addLine('output', '🛑 Stopping local agent...')
      if (window.electronAPI?.killPort) {
        try { await window.electronAPI.killPort(localPort) } catch {}
      } else {
        try { await sh('lsof -ti:${localPort} | xargs kill -9 2>/dev/null || true') } catch {}
      }

      addLine('output', '🗑️  Removing configuration...')
      try { await sh(`rm -rf "${dir}"`) } catch {}

      addLine('output', '📦 Cleaning up...')

      localStorage.removeItem('overclaw-setup-complete')

      addLine('output', '')
      addLine('output', '✅ Uninstalled successfully!')

      await fetchStatus()
      setTimeout(() => setFlow('install'), 1500)
    } catch (err: any) {
      addLine('error', `❌ Uninstall failed: ${err.message}`)
      setTimeout(() => setFlow('ready'), 3000)
    }
  }, [fetchStatus])

  // Windows: Local AI requires bash (via WSL2) — block with a clear message
  if (isWin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <Monitor size={28} style={{ color: 'var(--accent-red)' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Not Yet Available on Windows</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Local AI requires a Unix shell to run. Native Windows support is coming soon.
          </p>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
            In the meantime, try <strong>Cloud AI</strong> — it works on all platforms with no local setup.
          </p>
          <a
            href="https://learn.microsoft.com/en-us/windows/wsl/install"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
            style={{ color: 'var(--accent-blue)' }}
          >
            Learn about WSL2 →
          </a>
        </div>
      </div>
    )
  }

  if (flow === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-3" style={{ color: 'var(--accent-blue)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Checking status...</p>
        </div>
      </div>
    )
  }

  if (flow === 'install') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'var(--accent-bg-strong)' }}>
            <Download size={28} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Set Up Local AI</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Run AI models privately on this device. No API keys, no cloud costs — everything stays on your machine.
          </p>
          <button
            onClick={handleInstall}
            className="px-6 py-3 text-sm font-medium rounded-xl transition-all hover:opacity-90"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            <Download size={16} className="inline mr-2 -mt-0.5" />
            Install
          </button>
        </div>
      </div>
    )
  }

  if (flow === 'installing') {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <div className="text-center mb-4">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" style={{ color: 'var(--accent-blue)' }} />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Installing components...</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>This may take a minute</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Terminal lines={installLines} />
        </div>
      </div>
    )
  }

  if (flow === 'uninstalling') {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <div className="text-center mb-4">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" style={{ color: 'var(--accent-red, #ef4444)' }} />
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Uninstalling...</h2>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Terminal lines={installLines} />
        </div>
      </div>
    )
  }

  if (flow === 'setup') {
    return (
      <div className="max-w-lg mx-auto py-8 space-y-4">
        <SetupWizard onComplete={handleSetupComplete} />
      </div>
    )
  }

  // Ready — chat left, tasks + quick actions right
  return (
    <div className="flex flex-col h-full">
      {showPerfPopup && <PerformancePopup onClose={() => setShowPerfPopup(false)} />}
      {showUninstallMenu && (
        <UninstallMenu
          onDeleteAll={() => { setShowUninstallMenu(false); setShowConfirmDelete(true) }}
          onManageModels={() => { setShowUninstallMenu(false); setShowModelManager(true) }}
          onClose={() => setShowUninstallMenu(false)}
        />
      )}
      {showConfirmDelete && (
        <ConfirmDialog
          title="Delete everything?"
          message="This will remove all models, configuration, and components. You'll need to set up again from scratch."
          confirmLabel="Delete everything"
          danger
          onConfirm={() => { setShowConfirmDelete(false); handleUninstall() }}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
      {showModelManager && (
        <ModelManager
          onClose={() => setShowModelManager(false)}
          onModelDeleted={() => setShowAddModels(true)}
        />
      )}
      <div className="flex flex-1 gap-3 p-3 min-h-0">
        <div className="flex flex-col w-1/2 min-w-0">
          <GatewayChat
            gatewayUrl={gatewayUrl}
            gatewayToken={gatewayToken}
            sessionKey="webchat"
            onWsReady={(req) => { wsRequestRef.current = req; gatewayRefs.local = req }}
            clearRef={clearChatRef}
            stateDir={localStateDir}
            messagePrefix="[System: Use the read tool to read MEMORY.md for context. Do NOT use memory_search. Auto-install missing dependencies silently (pip3 install --break-system-packages, brew install, etc). NEVER show terminal commands, shell output, or CLI instructions to the user. NEVER send messages via WhatsApp/Signal/Telegram/email or any messaging platform. Present everything in a clean, user-friendly way. You are a desktop app assistant.]"
          />
        </div>
        <div className="flex flex-col w-1/2 min-w-0">
          <TasksPanel gatewayUrl={gatewayUrl} gatewayToken={gatewayToken} wsRequest={(m, p) => wsRequestRef.current ? wsRequestRef.current(m, p) : Promise.reject(new Error('Not connected'))} onClearChat={() => clearChatRef.current?.()} stateDir={localStateDir} hideSkills />
        </div>
      </div>
      <div className="flex justify-end gap-2 px-3 pb-3">
        {showAddModels && (
          <button
            onClick={() => { setShowAddModels(false); setFlow('setup') }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all hover:opacity-80"
            style={{ color: 'var(--accent-blue)', background: 'var(--accent-bg-strong)', border: '1px solid var(--accent-blue)' }}
          >
            <Plus size={12} /> Add models
          </button>
        )}
        <button
          onClick={() => setShowUninstallMenu(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all hover:opacity-80"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-color)' }}
        >
          <Trash2 size={12} /> Uninstall
        </button>
      </div>
    </div>
  )
}
