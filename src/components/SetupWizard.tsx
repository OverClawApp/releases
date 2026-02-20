import { useState, useEffect, useRef } from 'react'
import { Zap, CheckCircle2, Loader2, Download, HardDrive, Cpu } from 'lucide-react'
import { getOrCreateGatewayPort } from '../lib/gatewayPort'

interface SetupWizardProps {
  onComplete: () => void
}

interface ModelTier {
  id: string
  name: string
  role: 'fast' | 'balanced' | 'smart'
  size: string
}

function getModelsForRam(ramGB: number): ModelTier[] {
  if (ramGB >= 32) {
    return [
      { id: 'qwen3:1.7b', name: 'Qwen 3 1.7B', role: 'fast', size: '~1.1 GB' },
      { id: 'qwen3:8b', name: 'Qwen 3 8B', role: 'balanced', size: '~4.9 GB' },
      { id: 'qwen3:32b', name: 'Qwen 3 32B', role: 'smart', size: '~20 GB' },
    ]
  }
  if (ramGB >= 16) {
    return [
      { id: 'qwen3:1.7b', name: 'Qwen 3 1.7B', role: 'fast', size: '~1.1 GB' },
      { id: 'qwen3:4b', name: 'Qwen 3 4B', role: 'balanced', size: '~2.6 GB' },
      { id: 'qwen3:14b', name: 'Qwen 3 14B', role: 'smart', size: '~9 GB' },
    ]
  }
  // 8GB or less
  return [
    { id: 'qwen3:1.7b', name: 'Qwen 3 1.7B', role: 'fast', size: '~1.1 GB' },
    { id: 'qwen3:4b', name: 'Qwen 3 4B', role: 'balanced', size: '~2.6 GB' },
    { id: 'qwen3', name: 'Qwen 3 8B', role: 'smart', size: '~4.9 GB' },
  ]
}

const isElectron = !!window.electronAPI?.isElectron
const isWin = (window.electronAPI?.platform || navigator.platform) === 'win32'

async function sh(command: string): Promise<string> {
  if (!isElectron) throw new Error('Not in Electron')
  // On Windows, strip Unix-isms from commands
  if (isWin) {
    command = command.replace(/ 2>\/dev\/null/g, ' 2>nul')
    command = command.replace(/ >\/dev\/null/g, ' >nul')
    command = command.replace(/ 2>&1/g, '')
    command = command.replace(/ \|\| true/g, '')
  }
  return window.electronAPI!.exec(command, [])
}

async function getHome(): Promise<string> {
  return window.electronAPI!.getHomedir()
}

function roleBadge(role: string) {
  if (role === 'smart') return { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', label: '🧠 Smart' }
  if (role === 'balanced') return { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: '⚖️ Balanced' }
  return { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', label: '⚡ Fast' }
}

type Phase = 'ollama-check' | 'downloading' | 'configuring' | 'done' | 'error'

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [phase, setPhase] = useState<Phase>('ollama-check')
  const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null)
  const [installingOllama, setInstallingOllama] = useState(false)
  const [ramGB, setRamGB] = useState(8)
  const [models, setModels] = useState<ModelTier[]>([])
  const [downloadStatus, setDownloadStatus] = useState<Record<string, string>>({})
  const [downloadDone, setDownloadDone] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [configStatus, setConfigStatus] = useState('')
  const abortRef = useRef(false)

  // Detect RAM + check Ollama on mount
  useEffect(() => {
    (async () => {
      try {
        if (window.electronAPI?.getSystemInfo) {
          const info = await window.electronAPI.getSystemInfo()
          const gb = Math.round(info.totalMem / 1073741824)
          setRamGB(gb)
          setModels(getModelsForRam(gb))
        } else {
          const mem = (await sh('sysctl -n hw.memsize')).trim()
          const gb = Math.round(parseInt(mem) / 1073741824)
          setRamGB(gb)
          setModels(getModelsForRam(gb))
        }
      } catch {
        setModels(getModelsForRam(8))
      }
      try {
        const resp = await fetch('http://127.0.0.1:11434/api/tags')
        if (resp.ok) { setOllamaInstalled(true); return }
      } catch {}
      try {
        if (window.electronAPI?.isCommandAvailable) {
          const found = await window.electronAPI.isCommandAvailable('ollama')
          setOllamaInstalled(found)
        } else {
          await sh(isWin ? 'where ollama' : 'which ollama')
          setOllamaInstalled(true)
        }
      } catch {
        setOllamaInstalled(false)
      }
    })()
  }, [])

  const installOllama = async () => {
    setInstallingOllama(true)
    setError('')
    try {
      const platform = window.electronAPI?.platform || 'darwin'
      if (platform === 'win32' || platform === 'linux') {
        // Windows/Linux: open download page
        window.open('https://ollama.com/download', '_blank')
        setError('Opening the Ollama download page — please install it, then click "Check again".')
        setInstallingOllama(false)
        return
      }
      // macOS: try brew
      let hasBrew = false
      try { await sh('which brew || /opt/homebrew/bin/brew --version'); hasBrew = true } catch {}
      if (!hasBrew) {
        try {
          await sh('NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"')
          hasBrew = true
        } catch {
          try { await sh('open https://ollama.com/download') } catch {}
          setError('Automatic install failed. Opening the download page — please install manually, then click "Check again".')
          setInstallingOllama(false)
          return
        }
      }
      await sh('/opt/homebrew/bin/brew install ollama || brew install ollama')
      try { await sh('ollama serve > /dev/null 2>&1 &') } catch {}
      await new Promise(r => setTimeout(r, 3000))
      setOllamaInstalled(true)
    } catch (err: any) {
      setError(`Failed to install AI engine: ${err.message}`)
    } finally {
      setInstallingOllama(false)
    }
  }

  const checkOllama = async () => {
    try {
      const resp = await fetch('http://127.0.0.1:11434/api/tags')
      if (resp.ok) { setOllamaInstalled(true); return }
    } catch {}
    try {
      if (window.electronAPI?.isCommandAvailable) {
        const found = await window.electronAPI.isCommandAvailable('ollama')
        setOllamaInstalled(found)
      } else {
        await sh(isWin ? 'where ollama' : 'which ollama')
        setOllamaInstalled(true)
      }
    } catch {
      setOllamaInstalled(false)
    }
  }

  const ensureOllamaServing = async () => {
    try {
      const resp = await fetch('http://127.0.0.1:11434/api/tags')
      if (resp.ok) return
    } catch {}
    try {
      if (isWin) {
        sh('start "" ollama serve')
      } else {
        sh('ollama serve > /dev/null 2>&1 &')
      }
    } catch {}
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500))
      try {
        const resp = await fetch('http://127.0.0.1:11434/api/tags')
        if (resp.ok) return
      } catch {}
    }
    throw new Error('Could not start the AI engine. Try opening it manually.')
  }

  const pullModel = async (modelId: string): Promise<void> => {
    setDownloadStatus(s => ({ ...s, [modelId]: 'Starting...' }))

    const response = await fetch('http://127.0.0.1:11434/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId }),
    })
    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`)

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (reader) {
      while (true) {
        if (abortRef.current) break
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line)
            if (data.total && data.completed) {
              const pct = Math.round((data.completed / data.total) * 100)
              const totalGB = (data.total / 1e9).toFixed(1)
              const doneGB = (data.completed / 1e9).toFixed(1)
              setDownloadStatus(s => ({ ...s, [modelId]: `${pct}% (${doneGB}/${totalGB} GB)` }))
            } else if (data.status) {
              setDownloadStatus(s => ({ ...s, [modelId]: data.status }))
            }
          } catch {}
        }
      }
    }
    setDownloadStatus(s => ({ ...s, [modelId]: 'Ready' }))
    setDownloadDone(s => ({ ...s, [modelId]: true }))
  }

  const startInstall = async () => {
    setPhase('downloading')
    setError('')
    abortRef.current = false

    try {
      await ensureOllamaServing()

      // Download models sequentially
      for (const model of models) {
        if (abortRef.current) return
        await pullModel(model.id)
      }

      // Configure
      setPhase('configuring')
      await configureGateway()
      setPhase('done')
    } catch (err: any) {
      setError(err.message || 'Setup failed')
      setPhase('error')
    }
  }

  const findOpenClaw = async (): Promise<string> => {
    const platform = window.electronAPI?.platform || 'darwin'
    const homedir = await getHome()
    
    // Try simple command first (works cross-platform if in PATH)
    try { await sh('openclaw --version'); return 'openclaw' } catch {}
    
    if (platform === 'win32') {
      // Windows-specific paths
      const winPaths = [
        `${process.env.APPDATA || homedir + '/AppData/Roaming'}/npm/openclaw.cmd`,
        `${homedir}/AppData/Roaming/npm/openclaw.cmd`,
      ]
      for (const p of winPaths) {
        try { await sh(`"${p}" --version`); return `"${p}"` } catch {}
      }
    } else {
      // Unix paths
      const unixPaths = [
        '/usr/local/bin/openclaw',
        '/opt/homebrew/bin/openclaw',
        `${homedir}/.npm-global/bin/openclaw`,
        `${homedir}/.volta/bin/openclaw`,
      ]
      for (const p of unixPaths) {
        try { await sh(`${p} --version 2>/dev/null`); return p } catch {}
      }
      try {
        const npmPrefix = (await sh('npm prefix -g 2>/dev/null')).trim()
        const fp = `${npmPrefix}/bin/openclaw`
        await sh(`${fp} --version 2>/dev/null`); return fp
      } catch {}
      try {
        const resolved = (await sh('zsh -ilc "which openclaw" 2>/dev/null')).trim()
        if (resolved && !resolved.includes('not found') && resolved.startsWith('/')) return resolved
      } catch {}
    }
    
    try {
      await sh('npx openclaw --version')
      return 'npx openclaw'
    } catch {}
    throw new Error('OpenClaw binary not found')
  }

  const configureGateway = async () => {
    const homedir = await getHome()
    const openclawDir = `${homedir}/.overclaw/local`
    const envPrefix = `OPENCLAW_STATE_DIR="${openclawDir}"`

    const ea = window.electronAPI!

    setConfigStatus('Installing components...')
    try { await findOpenClaw() } catch {
      const installArgs = ['install', '-g', 'openclaw', 'clawhub']
      if (isWin) installArgs.push('--ignore-scripts')
      await ea.exec('npm', installArgs)
    }
    const oc = await findOpenClaw()

    setConfigStatus('Creating config...')
    await ea.mkdirp(`${openclawDir}/workspace/memory`)
    await ea.mkdirp(`${openclawDir}/agents/main/agent`)

    // Create starter workspace files for agent context
    const agentsMd = `# AGENTS.md

## Memory
- **MEMORY.md** — Your long-term memory. Read it at the start of each conversation.
- **memory/** — Daily notes if needed.

## Guidelines
- Be helpful and concise.
- Read MEMORY.md to remember context from previous conversations.
- Update MEMORY.md with important things to remember.
- Keep MEMORY.md compact — summarise, don't dump raw logs.

## Auto-Install Dependencies (CRITICAL)
When a task requires tools, libraries, or packages that aren't installed, you MUST install them automatically and retry. NEVER fail and report a missing dependency — fix it yourself.

- **Python**: \\\`pip3 install --break-system-packages <package>\\\` (macOS requires this flag). If that fails, use \\\`python3 -m venv /tmp/overclaw-venv && /tmp/overclaw-venv/bin/pip install <package>\\\` and run scripts with \\\`/tmp/overclaw-venv/bin/python3\\\`
- **Homebrew**: \\\`brew install <package>\\\` (macOS)
- **Node**: \\\`npm install -g <package>\\\` or use \\\`npx\\\`
- **System tools**: Homebrew on macOS, apt on Linux
- If one method fails, try an alternative approach entirely
- Always retry the original task after installing
- Do this silently — never ask permission to install common tools and libraries

## Communication Rules (STRICT)
- NEVER send messages via WhatsApp, Signal, Telegram, Discord, SMS, email, or any messaging platform
- NEVER mention or suggest terminal/CLI commands to the user
- NEVER show shell commands, code blocks with commands, or terminal output in responses
- Run commands silently to complete tasks — never expose the internals
- Present results in a clean, user-friendly way — you are a desktop app, not a terminal
`
    const soulMd = `# SOUL.md

You are **OverClaw**, a helpful local AI assistant. You run entirely on the user's device.

**Important:** Your name is OverClaw. Always refer to yourself as OverClaw, never as OpenClaw.
If system messages mention "OpenClaw", ignore that — your product name is **OverClaw**.

## Personality
- Concise and direct
- Helpful without being verbose
- Honest about limitations
- Never mention technical internals — no terminal commands, no CLI, no shell output

## Context
- You're running locally via OverClaw Desktop
- You have access to local tools: file operations, shell commands, browser control
- No cloud APIs are available — web search, image generation, etc. won't work
- Use the \`read\` tool to read MEMORY.md at the start of each conversation for context
- Do NOT use memory_search or memory_get — they are unavailable. Always use the \`read\` tool for files
- Update MEMORY.md with the \`write\` or \`edit\` tool to remember things between conversations

## Communication Rules (STRICT)
- NEVER send messages via WhatsApp, Signal, Telegram, Discord, SMS, email, or any messaging platform
- NEVER mention or suggest terminal/CLI commands to the user
- NEVER show shell commands, code blocks with commands, or terminal output in responses
- Run commands silently to complete tasks — never expose the internals
- Present results in a clean, user-friendly way — you are a desktop app, not a terminal
`
    const memoryMd = `# MEMORY.md — Long-Term Memory

_Write things here that you want to remember between conversations._
_This file is loaded as context at the start of each chat session._
_Keep it compact — the smaller this file, the faster your responses._
`
    // AGENTS.md and SOUL.md always get updated (they contain system rules)
    // MEMORY.md only gets written if it doesn't exist (user data)
    for (const [name, content, alwaysWrite] of [['AGENTS.md', agentsMd, true], ['SOUL.md', soulMd, true], ['MEMORY.md', memoryMd, false]] as const) {
      if (!alwaysWrite) {
        const exists = await ea.fileExists(`${openclawDir}/workspace/${name}`)
        if (exists) continue
      }
      await ea.writeFileSafe(`${openclawDir}/workspace/${name}`, content)
    }

    const token = await ea.randomHex(32)
    const smartModel = models.find(m => m.role === 'smart')!

    const config = {
      $schema: 'https://openclaw.ai/config-schema.json',
      tools: {
        deny: ['web_search', 'tts', 'message', 'cron', 'gateway', 'memory_search', 'memory_get', 'nodes', 'sessions_spawn', 'sessions_send', 'sessions_list', 'sessions_history', 'agents_list', 'session_status', 'image', 'canvas'],
      },
      agents: {
        defaults: {
          model: {
            primary: `ollama/${smartModel.id}`,
          },
          workspace: `${openclawDir}/workspace`,
        },
      },
      models: {
        providers: {
          ollama: {
            baseUrl: 'http://127.0.0.1:11434/v1',
            apiKey: 'ollama-local',
            api: 'openai-completions',
            models: models.map(m => ({
              id: m.id,
              name: m.id,
              reasoning: false,
              input: ['text'] as string[],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 32768,
              maxTokens: 32768,
            })),
          },
        },
      },
      gateway: {
        mode: 'local',
        port: getOrCreateGatewayPort('overclaw-local-port'),
        bind: 'loopback',
        controlUi: { allowInsecureAuth: true },
        auth: { mode: 'token', token },
      },
    }

    const configJson = JSON.stringify(config, null, 2)
    const platform = await ea.getPlatform()
    const writeConfig = async () => {
      if (platform !== 'win32') {
        try { await sh(`chmod 644 "${openclawDir}/openclaw.json" 2>/dev/null || true`) } catch {}
      }
      await ea.writeFileSafe(`${openclawDir}/openclaw.json`, configJson)
      if (platform !== 'win32') {
        try { await sh(`chmod 444 "${openclawDir}/openclaw.json"`) } catch {}
      }
    }
    const writeEnv = async () => {
      await ea.writeFileSafe(`${openclawDir}/.env`, 'OLLAMA_API_KEY=ollama-local\n')
    }

    await writeConfig()
    await writeEnv()
    await ea.writeFileSafe(`${openclawDir}/.risk-accepted`, '')

    // Save model tiers for auto-routing
    const tiersJson = JSON.stringify(models.map(m => ({ id: m.id, role: m.role })))
    await ea.writeFileSafe(`${openclawDir}/model-tiers.json`, tiersJson)

    setConfigStatus('Starting gateway...')
    // Kill any existing gateway on local port
    try { await ea.killPort(getOrCreateGatewayPort('overclaw-local-port')) } catch {}

    // Start gateway in background with state dir
    await ea.startGatewayDetached(oc, ['gateway', 'run', '--port', String(getOrCreateGatewayPort('overclaw-local-port'))], { OPENCLAW_STATE_DIR: openclawDir }, `${openclawDir}/gateway.log`)
    await new Promise(r => setTimeout(r, 2000))
    setConfigStatus('Done!')
  }

  // --- Render ---

  // Windows: Local AI requires WSL2 — OpenClaw gateway depends on bash
  if (isWin) {
    return (
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="text-center py-4">
          <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--accent-red)' }}>
            Windows Not Yet Supported
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Local AI requires WSL2 (Windows Subsystem for Linux) to run the OpenClaw gateway.
            Native Windows support is coming soon.
          </p>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
            In the meantime, try <strong>Cloud AI</strong> — it works on all platforms with no local setup required.
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

  if (phase === 'ollama-check') {
    return (
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1.5 rounded-full flex-1" style={{ background: 'var(--accent-blue)' }} />
          <div className="h-1.5 rounded-full flex-1" style={{ background: 'var(--border-color)' }} />
        </div>

        <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
          <HardDrive size={16} className="inline mr-2" />Local AI Setup
        </h3>
        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
          Run AI models privately on your device. No API keys, no cloud costs — everything stays on your machine.
        </p>

        {/* RAM info */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg mb-4" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <Cpu size={12} className="inline mr-1.5" />System RAM
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ramGB} GB</span>
        </div>

        {/* Models that will be installed */}
        {models.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Models to install:</p>
            <div className="space-y-1.5">
              {models.map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                    <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded-full font-medium" style={{
                      background: roleBadge(m.role).bg,
                      color: roleBadge(m.role).color,
                    }}>
                      {roleBadge(m.role).label}
                    </span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{m.size}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] mt-2 px-1" style={{ color: 'var(--text-muted)' }}>
              Three models optimised for your {ramGB}GB RAM — fast for quick replies, balanced for everyday tasks, smart for complex reasoning. OverClaw picks the right one automatically.
            </p>
          </div>
        )}

        {/* Ollama status */}
        {ollamaInstalled === null ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Checking for AI engine...</span>
          </div>
        ) : ollamaInstalled ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>AI engine ready</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <Download size={16} style={{ color: '#fbbf24' }} />
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>AI engine not found</span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Required to run models locally</p>
              </div>
            </div>
            <button
              onClick={installOllama}
              disabled={installingOllama}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg"
              style={{ background: 'var(--accent-blue)', color: '#fff', opacity: installingOllama ? 0.7 : 1 }}
            >
              {installingOllama
                ? <><Loader2 size={14} className="animate-spin" /> Installing AI engine...</>
                : <><Download size={14} /> Install AI engine</>}
            </button>
            <div className="flex items-center justify-center gap-3">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Or install from <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>ollama.com</a>
              </p>
              <button onClick={checkOllama} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ color: 'var(--accent-blue)', background: 'var(--accent-bg-strong)' }}>
                Check again
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
            {error}
          </div>
        )}

        {/* Install button */}
        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={startInstall}
            disabled={!ollamaInstalled}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg disabled:opacity-40"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            <Download size={16} /> Install Models & Set Up
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'downloading' || phase === 'configuring') {
    const allDone = models.every(m => downloadDone[m.id])
    return (
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1.5 rounded-full flex-1" style={{ background: 'var(--accent-blue)' }} />
          <div className="h-1.5 rounded-full flex-1" style={{ background: phase === 'configuring' ? 'var(--accent-blue)' : 'var(--border-color)' }} />
        </div>

        <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
          <Loader2 size={16} className="inline mr-2 animate-spin" />
          {phase === 'configuring' ? 'Finishing setup...' : 'Downloading models...'}
        </h3>
        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
          {phase === 'configuring' ? configStatus : 'This may take a few minutes depending on your internet speed.'}
        </p>

        <div className="space-y-3">
          {models.map(m => {
            const status = downloadStatus[m.id]
            const done = downloadDone[m.id]
            return (
              <div key={m.id} className="px-4 py-3 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                    ) : status ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full" style={{ border: '2px solid var(--border-color)' }} />
                    )}
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{
                      background: roleBadge(m.role).bg,
                      color: roleBadge(m.role).color,
                    }}>
                      {roleBadge(m.role).label}
                    </span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{m.size}</span>
                </div>
                {status && (
                  <p className="text-xs ml-5" style={{ color: done ? '#22c55e' : 'var(--text-muted)' }}>{status}</p>
                )}
              </div>
            )
          })}
        </div>

        {phase === 'configuring' && (
          <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{configStatus}</span>
          </div>
        )}
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1.5 rounded-full flex-1" style={{ background: 'var(--accent-blue)' }} />
          <div className="h-1.5 rounded-full flex-1" style={{ background: 'var(--accent-blue)' }} />
        </div>

        <div className="text-center py-4">
          <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: '#22c55e' }} />
          <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>All set!</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Your local AI is ready. No API keys, no cloud costs — everything runs on this device.
          </p>

          <div className="space-y-2 mb-6 text-left max-w-xs mx-auto">
            {models.map(m => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{
                  background: roleBadge(m.role).bg,
                  color: roleBadge(m.role).color,
                }}>
                  {roleBadge(m.role).label}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={onComplete}
            className="px-6 py-3 text-sm font-semibold rounded-lg"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            <Zap size={14} className="inline mr-2" />Start chatting
          </button>
        </div>
      </div>
    )
  }

  // Error state
  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="text-center py-4">
        <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--accent-red)' }}>Setup failed</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button
          onClick={() => { setPhase('ollama-check'); setError(''); setDownloadStatus({}); setDownloadDone({}) }}
          className="px-5 py-2.5 text-sm font-medium rounded-lg"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
