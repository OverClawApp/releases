import { useState, useEffect, useCallback, useRef } from 'react'
import { useOpenClawContext } from '../context/OpenClawContext'
import { useAuth } from '../context/AuthContext'
import { getSubscription } from '../lib/db'
import Terminal from '../components/Terminal'
import GatewayChat from '../components/GatewayChat'
import TasksPanel from '../components/TasksPanel'
import ScreenSaver from '../components/ScreenSaver'
import SubAgentsPanel from '../components/SubAgentsPanel'
import { Download, Loader2, Trash2, X, Cloud, Key, ChevronRight, Check, Crown, ArrowRight, Shield, HardDrive, FolderOpen, AppWindow, Workflow, Wifi, ExternalLink } from 'lucide-react'
import { gatewayRefs } from '../App'
import { AGENT_TEMPLATES, DEFAULT_TEMPLATE_ID, SUBAGENTS_STORAGE_KEY, buildAgentsTeamMarkdown, getTemplateById, orchestratorDelegationBlock, type AgentTemplateId, type SubAgentRecord } from '../lib/agentTemplates'
import { getOrCreateGatewayPort } from '../lib/gatewayPort'
import { DEFAULT_RATE_LIMITS, SECURITY_TIERS, tierToConfigPatch, type RateLimitConfig, type SecurityTier } from '../lib/securityTiers'
import { generateFirewallScript, generateSSHHardeningScript } from '../lib/sshHardening'

// --- Types ---

type FlowState = 'loading' | 'install' | 'installing' | 'setup' | 'permissions' | 'ready'

const PROXY_BASE_URL = import.meta.env.VITE_API_URL || 'https://overclaw-api-production.up.railway.app'

const isElectron = !!window.electronAPI?.isElectron

const CLOUD_SUBDIR = '.overclaw/cloud'

const api = () => window.electronAPI!

const isWin = (window.electronAPI?.platform || navigator.platform) === 'win32'

async function sh(command: string): Promise<string> {
  if (!isElectron) throw new Error('Not in Electron')
  if (isWin) {
    command = command.replace(/ 2>\/dev\/null/g, ' 2>nul')
    command = command.replace(/ >\/dev\/null/g, ' >nul')
    command = command.replace(/ 2>&1/g, '')
    command = command.replace(/ \|\| true/g, '')
  }
  return api().exec(command, [])
}

async function getHome(): Promise<string> {
  if (isElectron) return api().getHomedir()
  throw new Error('Not in Electron')
}

function cloudDir(homedir: string) { return `${homedir}/${CLOUD_SUBDIR}` }
function ocEnv(homedir: string) { return `OPENCLAW_STATE_DIR="${cloudDir(homedir)}"` }

// Cross-platform path separator
const pathSep = navigator.platform.toUpperCase().includes('WIN') ? '\\' : '/'

// --- Cloud Setup Wizard (Keyless) ---

function CloudSetupWizard({ onComplete, selectedTemplateId, onTemplateChange }: { onComplete: () => void; selectedTemplateId: AgentTemplateId; onTemplateChange: (id: AgentTemplateId) => void }) {
  const [setting, setSetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const selectedTemplate = getTemplateById(selectedTemplateId)

  const handleSetup = async () => {
    setSetting(true)
    setError(null)

    try {
      const homedir = await getHome()
      const openclawDir = cloudDir(homedir)
      const env = ocEnv(homedir)
      const cloudPort = getOrCreateGatewayPort('overclaw-cloud-port')

      setStatus('Fetching API key...')
      
      // Get user's Supabase session token
      const { supabase } = await import('../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in. Please sign in first.')

      // Fetch user's proxy API key from backend
      const keyRes = await fetch(`${PROXY_BASE_URL}/api/proxy/apikey`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!keyRes.ok) throw new Error('Failed to fetch API key from server')
      const { apiKey: proxyApiKey } = await keyRes.json()
      if (!proxyApiKey) throw new Error('No API key returned. Please try again.')

      setStatus('Creating workspace...')

      // Create workspace and starter files
      await api().mkdirp(`${openclawDir}/workspace/memory`)
      await api().mkdirp(`${openclawDir}/agents/main/agent`)

      const rawSubAgents = localStorage.getItem(SUBAGENTS_STORAGE_KEY)
      let subAgents: SubAgentRecord[] = []
      try { subAgents = rawSubAgents ? JSON.parse(rawSubAgents) : [] } catch { subAgents = [] }

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

- **Python**: \`pip3 install --break-system-packages <package>\` (macOS requires this flag). If that fails, use \`python3 -m venv /tmp/overclaw-venv && /tmp/overclaw-venv/bin/pip install <package>\` and run scripts with \`/tmp/overclaw-venv/bin/python3\`
- **Homebrew**: \`brew install <package>\` (macOS)
- **Node**: \`npm install -g <package>\` or use \`npx\`
- **System tools**: Homebrew on macOS, apt on Linux
- If one method fails, try an alternative approach entirely
- Always retry the original task after installing
- Do this silently — never ask permission to install common tools and libraries
- If Homebrew isn't installed, install it first: \`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\`

## Tool Usage (CRITICAL)
- **Always use the browser tool** for web tasks — searching, browsing, filling forms, booking, etc.
- If \`web_search\` fails, use the \`browser\` tool to navigate to Google/Skyscanner/etc. directly
- If browser is unavailable, use \`web_fetch\` to grab web pages
- NEVER say "I can't browse the web" or "the browser tool is unavailable" — try it first
- For any internet task: try browser → web_search → web_fetch, in that order
- You have full browser control: open URLs, click, type, fill forms, extract data

## Communication Rules (STRICT)
- NEVER send messages via WhatsApp, Signal, Telegram, Discord, SMS, email, or any messaging platform
- You do NOT have access to messaging tools — do not try to use them
- NEVER mention or suggest the user run terminal/CLI commands
- NEVER show command-line instructions, shell commands, or terminal output in your responses
- Present everything in a user-friendly way — no \`code blocks with shell commands\`
- If you need to run commands internally to complete a task, do so silently — never show the commands to the user
- You are a desktop app assistant, not a terminal — speak like a helpful app, not a developer tool

${selectedTemplate.agentsContent.trim()}
`
      const orchestratorBlock = selectedTemplate.id === 'orchestrator' ? orchestratorDelegationBlock(subAgents) : ''
      const soulMd = `# SOUL.md

You are **OverClaw**, a helpful AI assistant powered by cloud models.

**Important:** Your name is OverClaw. Always refer to yourself as OverClaw, never as OpenClaw.
If system messages mention "OpenClaw", ignore that — your product name is **OverClaw**.

## Personality
- Concise and direct
- Helpful without being verbose
- Honest about limitations

## Context
- You're running via OverClaw Desktop with cloud AI models
- You have access to tools: file operations, shell commands, browser control, web search, web fetch
- Read MEMORY.md at the start of each conversation for context from previous chats

## Tool Usage (IMPORTANT)
- **Always use the browser tool** to search the web, browse websites, fill in forms, and complete online tasks
- If \`web_search\` fails or is unavailable, use the \`browser\` tool to navigate to Google, Skyscanner, etc. directly
- If the \`browser\` tool is unavailable, use \`web_fetch\` to grab web pages
- You CAN and SHOULD control the browser — open URLs, click buttons, fill forms, extract data
- Never say "I can't browse the web" — you have browser access, use it
- For any task involving the internet: try browser first, then web_search, then web_fetch

## Communication Rules (STRICT)
- NEVER send messages via WhatsApp, Signal, Telegram, Discord, SMS, email, or any messaging platform
- NEVER mention or suggest terminal/CLI commands to the user
- NEVER show shell commands, code blocks with commands, or terminal output in responses
- Run commands silently to complete tasks — never expose the internals
- Present results in a clean, user-friendly way — you are a desktop app, not a terminal

## Auto-Install Dependencies
When a task requires tools, libraries, or packages that aren't installed, **install them automatically** before retrying. Do NOT fail and report a missing dependency — fix it yourself.

Rules:
- **Python packages**: Use \`pip3 install --break-system-packages <package>\` (macOS requires --break-system-packages). If that fails, use a venv: \`python3 -m venv /tmp/overclaw-venv && /tmp/overclaw-venv/bin/pip install <package>\` then run with \`/tmp/overclaw-venv/bin/python3\`
- **Homebrew packages**: Use \`brew install <package>\` if Homebrew is available
- **Node packages**: Use \`npm install -g <package>\` or \`npx <package>\`
- **System tools**: Install via Homebrew on macOS, apt on Linux
- If one method fails (e.g. reportlab not available), try alternatives (e.g. use a different library or approach)
- Always retry the original task after installing dependencies
- Do this silently — don't ask permission to install common tools and libraries
- If something truly cannot be installed, explain why and suggest alternatives

${selectedTemplate.soulContent.trim()}
${orchestratorBlock}
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
          const exists = await api().fileExists(`${openclawDir}/workspace/${name}`)
          if (exists) continue
        }
        await api().writeFileSafe(`${openclawDir}/workspace/${name}`, content)
      }

      setStatus('Configuring gateway...')

      // Write proxy API key to .env
      let envContent = ''
      try { envContent = await api().readFile(`${openclawDir}/.env`) } catch {}
      const envLines = envContent.split('\n').filter(l => !l.startsWith('OVERCLAW_PROXY_KEY='))
      envLines.push(`OVERCLAW_PROXY_KEY=${proxyApiKey}`)
      const newEnv = envLines.filter(l => l.trim()).join('\n') + '\n'
      await api().writeFileSafe(`${openclawDir}/.env`, newEnv)

      // Generate gateway token
      const token = await api().randomHex(32)

      // Write config — uses proxy as OpenAI-compatible provider
      const config = {
        $schema: 'https://openclaw.ai/config-schema.json',
        models: {
          mode: 'merge',
          providers: {
            overclaw: {
              baseUrl: `${PROXY_BASE_URL}/api/v1`,
              apiKey: proxyApiKey,
              api: 'openai-completions',
              models: [{ id: 'auto', name: 'Auto (Smart Routing)', input: ['text', 'image'], contextWindow: 1000000, maxTokens: 32000 }],
            },
          },
        },
        agents: {
          defaults: {
            model: {
              primary: 'overclaw/auto',
            },
            imageModel: {
              primary: 'overclaw/auto',
            },
            workspace: `${openclawDir}/workspace`,
            heartbeat: {
              every: '30m',
              target: 'last',
            },
          },
        },
        tools: {
          deny: selectedTemplate.toolsDeny,
        },
        channels: {},
        gateway: {
          mode: 'local',
          port: cloudPort,
          bind: 'loopback',
          controlUi: { allowInsecureAuth: true },
          auth: { mode: 'token', token },
        },
      }

      const configJson = JSON.stringify(config, null, 2)
      const writeConfig = async () => {
        const platform = await api().getPlatform()
        if (platform !== 'win32') {
          try { await sh(`chmod 644 "${openclawDir}/openclaw.json" 2>/dev/null || true`) } catch {}
        }
        await api().writeFileSafe(`${openclawDir}/openclaw.json`, configJson)
        if (platform !== 'win32') {
          try { await sh(`chmod 444 "${openclawDir}/openclaw.json"`) } catch {}
        }
      }

      await writeConfig()
      await api().writeFileSafe(`${openclawDir}/.risk-accepted`, '')

      // Find openclaw binary
      try { await sh('openclaw --version') } catch {
        const installArgs = ['install', '-g', 'openclaw', 'clawhub']
        if (isWin) installArgs.push('--ignore-scripts')
        await api().exec('npm', installArgs)
      }

      // Install skills
      setStatus('Installing skills...')
      const skillDir = `${openclawDir}/workspace/skills`
      await api().mkdirp(skillDir)
      for (const skill of selectedTemplate.skills) {
        try { await api().exec('clawhub', ['install', skill, '--workdir', openclawDir, '--force']) } catch {}
      }

      // Stop any existing cloud gateway on this port
      try { await api().killPort(cloudPort) } catch {}

      // Start gateway in background
      await api().startGatewayDetached('openclaw', ['gateway', 'run', '--port', String(cloudPort)], { OPENCLAW_STATE_DIR: openclawDir }, `${openclawDir}/gateway.log`)

      // Wait for gateway to be ready
      await new Promise(r => setTimeout(r, 3000))

      await api().writeFileSafe(`${openclawDir}/workspace/agents-team.md`, buildAgentsTeamMarkdown(subAgents))
      localStorage.setItem('overclaw-cloud-setup-complete', 'true')
      localStorage.setItem('overclaw-cloud-template', selectedTemplate.id)
      onComplete()
    } catch (err: any) {
      setError(`Setup failed: ${err.message}`)
      setSetting(false)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="p-8 text-center">
        {setting ? (
          <>
            <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: 'var(--accent-blue)' }} />
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Setting up Cloud AI...</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{status || 'Please wait...'}</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--accent-bg-strong)' }}>
              <Cloud size={28} style={{ color: 'var(--accent-blue)' }} />
            </div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Cloud AI</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Powered by the best AI models — no API keys needed
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              OverClaw automatically picks the best model for each task.<br />
              Claude, GPT, Gemini, DeepSeek, Kimi and more — all included.
            </p>
            <div className="grid grid-cols-2 gap-2 text-left mb-5">
              {AGENT_TEMPLATES.map(template => {
                const Icon = template.icon
                const active = selectedTemplateId === template.id
                return (
                  <button
                    key={template.id}
                    onClick={() => onTemplateChange(template.id)}
                    className="rounded-lg p-3 text-left transition-all"
                    style={{
                      background: active ? 'var(--accent-bg-strong)' : 'var(--bg-page)',
                      border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} style={{ color: active ? 'var(--accent-blue)' : '#EF4444' }} />
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{template.name}</span>
                      {template.id === 'orchestrator' && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.16)', color: 'var(--accent-blue)' }}>Recommended</span>}
                    </div>
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{template.description}</p>
                  </button>
                )
              })}
            </div>
            {error && <p className="text-xs mb-4" style={{ color: '#f85149' }}>{error}</p>}
            <button
              onClick={handleSetup}
              className="px-8 py-3 text-sm font-medium rounded-lg"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}
            >
              Get Started with {selectedTemplate.name}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// --- Platform Permissions ---

const isMac = navigator.platform.toUpperCase().includes('MAC') || navigator.userAgent.includes('Macintosh')
const isWindows = navigator.platform.toUpperCase().includes('WIN') || navigator.userAgent.includes('Windows')

type PermissionItem = { icon: typeof HardDrive; name: string; description: string; action: string; instructions?: string }

const MAC_PERMISSIONS: PermissionItem[] = [
  {
    icon: HardDrive,
    name: 'Full Disk Access',
    description: 'Allows OverClaw to read and manage files across your system',
    action: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  },
  {
    icon: FolderOpen,
    name: 'Files and Folders',
    description: 'Access documents, downloads, and desktop folders',
    action: 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
  },
  {
    icon: AppWindow,
    name: 'App Management',
    description: 'Install, update, and manage other applications',
    action: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles',
  },
  {
    icon: Workflow,
    name: 'Automation',
    description: 'Control other apps to automate tasks on your behalf',
    action: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  },
  {
    icon: Wifi,
    name: 'Local Network',
    description: 'Communicate with devices and services on your network',
    action: 'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork',
  },
]

const WIN_PERMISSIONS: PermissionItem[] = [
  {
    icon: FolderOpen,
    name: 'File System Access',
    description: 'Allow OverClaw to read and manage files on your system',
    action: 'ms-settings:privacy-broadfilesystemaccess',
    instructions: 'Toggle on "Let apps access your file system" and ensure OverClaw is allowed',
  },
  {
    icon: AppWindow,
    name: 'App Permissions',
    description: 'Allow OverClaw to run and manage other applications',
    action: 'ms-settings:appsfeatures',
    instructions: 'If prompted by SmartScreen, click "More info" → "Run anyway" to trust OverClaw',
  },
  {
    icon: Wifi,
    name: 'Network Access',
    description: 'Allow OverClaw through Windows Firewall for local network access',
    action: 'ms-settings:windowsdefender',
    instructions: 'Go to Firewall → Allow an app → Add OverClaw for Private and Public networks',
  },
  {
    icon: Workflow,
    name: 'Background Apps',
    description: 'Allow OverClaw to run tasks in the background',
    action: 'ms-settings:privacy-backgroundapps',
    instructions: 'Ensure OverClaw is allowed to run in the background',
  },
  {
    icon: Shield,
    name: 'Developer Mode',
    description: 'Enable developer features for full automation capabilities',
    action: 'ms-settings:developers',
    instructions: 'Toggle on "Developer Mode" to allow OverClaw to run scripts and manage apps',
  },
]

function PlatformPermissions({ onContinue }: { onContinue: () => void }) {
  const permissions = isMac ? MAC_PERMISSIONS : WIN_PERMISSIONS
  const platformName = isMac ? 'macOS' : 'Windows'
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggleCheck = (i: number) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const openSettings = (action: string) => {
    if (!isElectron) return
    if (isMac) {
      window.electronAPI!.exec(`open "${action}"`, []).catch(() => {
        window.electronAPI!.exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy"', []).catch(() => {})
      })
    } else {
      window.electronAPI!.exec(`start "" "${action}"`, []).catch(() => {
        window.electronAPI!.exec('start ms-settings:', []).catch(() => {})
      })
    }
  }

  const allChecked = checked.size === permissions.length

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="p-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-bg-strong)' }}>
            <Shield size={24} style={{ color: 'var(--accent-blue)' }} />
          </div>
        </div>
        <h3 className="text-base font-semibold text-center mb-1" style={{ color: 'var(--text-primary)' }}>{platformName} Permissions</h3>
        <p className="text-xs text-center mb-6" style={{ color: 'var(--text-muted)' }}>
          {isMac
            ? 'OverClaw needs these permissions to work properly. Open each one in System Settings and add OverClaw.'
            : 'OverClaw needs these permissions to work properly. Open each setting and follow the instructions.'}
        </p>

        <div className="space-y-2 mb-6">
          {permissions.map((perm, i) => {
            const Icon = perm.icon
            const done = checked.has(i)
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg transition-all"
                style={{ background: done ? 'rgba(52,211,153,0.08)' : 'var(--bg-page)', border: `1px solid ${done ? 'rgba(52,211,153,0.3)' : 'var(--border-color)'}` }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg-strong)' }}>
                  <Icon size={18} style={{ color: done ? '#34d399' : 'var(--accent-blue)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{perm.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{perm.description}</p>
                  {perm.instructions && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{perm.instructions}</p>
                  )}
                </div>
                <button
                  onClick={() => openSettings(perm.action)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md flex-shrink-0 transition-all hover:opacity-80"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                >
                  Open <ExternalLink size={10} />
                </button>
                <button
                  onClick={() => toggleCheck(i)}
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: done ? '#34d399' : 'transparent',
                    border: done ? 'none' : '1.5px solid var(--border-color)',
                  }}
                >
                  {done && <Check size={12} style={{ color: '#fff' }} />}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onContinue}
            disabled={!allChecked}
            className="w-full px-8 py-3 text-sm font-medium rounded-lg transition-all"
            style={{
              background: allChecked ? 'var(--accent-blue)' : 'var(--bg-page)',
              color: allChecked ? '#fff' : 'var(--text-muted)',
              cursor: allChecked ? 'pointer' : 'not-allowed',
              opacity: allChecked ? 1 : 0.5,
            }}
          >
            Continue to Chat
          </button>
          <button
            onClick={onContinue}
            className="text-xs transition-all hover:opacity-80"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Confirm Dialog ---
function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onCancel}>
      <div className="w-[360px] rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-xs font-medium rounded-lg" style={{ color: 'var(--text-secondary)', background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-xs font-medium rounded-lg" style={{ background: danger ? '#f85149' : 'var(--accent-blue)', color: '#fff' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// --- Main Page ---

export default function CloudPage() {
  const { status, loading, fetchStatus } = useOpenClawContext()
  const { user, session } = useAuth()
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const [flow, setFlow] = useState<FlowState>('loading')
  const [selectedTemplateId, setSelectedTemplateId] = useState<AgentTemplateId>((localStorage.getItem('overclaw-cloud-template') as AgentTemplateId) || DEFAULT_TEMPLATE_ID)
  const [rightTab, setRightTab] = useState<'tasks' | 'subagents'>('tasks')
  const [nodeId, setNodeId] = useState<string>(localStorage.getItem('overclaw-node-id') || 'node-1')
  const [cloudPort] = useState<number>(() => getOrCreateGatewayPort('overclaw-cloud-port'))
  const [securityTier, setSecurityTier] = useState<SecurityTier>(() => (localStorage.getItem(`overclaw-node-${localStorage.getItem('overclaw-node-id') || 'node-1'}-tier`) as SecurityTier) || 'standard')
  const [rateLimitOverride, setRateLimitOverride] = useState(false)
  const [customRateLimit, setCustomRateLimit] = useState<RateLimitConfig>(DEFAULT_RATE_LIMITS.standard)
  const [showSshModal, setShowSshModal] = useState(false)

  // Check subscription
  useEffect(() => {
    getSubscription().then(sub => {
      setIsPro(sub?.plan === 'pro' && sub?.status === 'active')
    }).catch(() => setIsPro(false))
  }, [user])
  const [installLines, setInstallLines] = useState<{ type: 'output' | 'error' | 'complete'; data: string; command: string }[]>([])
  const [gatewayUrl, setGatewayUrl] = useState(`ws://localhost:${cloudPort}`)
  const [gatewayToken, setGatewayToken] = useState('')
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [showConfirmUninstall, setShowConfirmUninstall] = useState(false)
  const [cloudStateDir, setCloudStateDir] = useState('')
  const wsRequestRef = useRef<((method: string, params: any) => Promise<any>) | null>(null)
  const clearChatRef = useRef<(() => void) | null>(null)

  // Relay refs — bridge web ↔ desktop chat
  const relaySendRef = useRef<((text: string) => void) | null>(null)
  const relayAbortRef = useRef<(() => void) | null>(null)
  const relayHistoryRef = useRef<((id: string) => void) | null>(null)
  const [relayClient, setRelayClient] = useState<import('../lib/relayClient').RelayClient | null>(null)
  const [proxyApiKey, setProxyApiKey] = useState<string>('')
  const [screenSaverActive, setScreenSaverActive] = useState(false)
  const screenSaverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    localStorage.setItem('overclaw-cloud-template', selectedTemplateId)
  }, [selectedTemplateId])

  useEffect(() => {
    localStorage.setItem('overclaw-node-id', nodeId)
    const storedTier = (localStorage.getItem(`overclaw-node-${nodeId}-tier`) as SecurityTier) || 'standard'
    setSecurityTier(storedTier)
    try {
      const raw = localStorage.getItem('overclaw-node-ratelimits')
      const map = raw ? JSON.parse(raw) : {}
      setCustomRateLimit(map[nodeId] || DEFAULT_RATE_LIMITS[storedTier])
      setRateLimitOverride(!!map[nodeId])
    } catch {
      setCustomRateLimit(DEFAULT_RATE_LIMITS[storedTier])
      setRateLimitOverride(false)
    }
  }, [nodeId])

  // Activate screensaver after 30s of relay connection with no local interaction
  useEffect(() => {
    if (!relayClient?.isConnected) {
      setScreenSaverActive(false)
      return
    }
    const startTimer = () => {
      if (screenSaverTimer.current) clearTimeout(screenSaverTimer.current)
      screenSaverTimer.current = setTimeout(() => setScreenSaverActive(true), 30000)
    }
    const resetTimer = () => {
      setScreenSaverActive(false)
      startTimer()
    }
    startTimer()
    window.addEventListener('keydown', resetTimer)
    window.addEventListener('click', resetTimer)
    return () => {
      if (screenSaverTimer.current) clearTimeout(screenSaverTimer.current)
      window.removeEventListener('keydown', resetTimer)
      window.removeEventListener('click', resetTimer)
    }
  }, [relayClient?.isConnected])

  // Start relay client when flow is ready and user has an API key
  useEffect(() => {
    if (flow !== 'ready' || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const { RelayClient } = await import('../lib/relayClient')
        // Fetch user's oc_ API key
        const token = session?.access_token
        if (!token || cancelled) return
        const resp = await fetch(`${PROXY_BASE_URL}/api/proxy/apikey`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!resp.ok || cancelled) return
        const { apiKey } = await resp.json()
        if (!apiKey || cancelled) return
        setProxyApiKey(apiKey)

        const client = new RelayClient(apiKey, {
          onWebMessage: (text, _id) => { relaySendRef.current?.(text) },
          onWebAbort: () => { relayAbortRef.current?.() },
          onWebHistoryRequest: (id) => { relayHistoryRef.current?.(id) },
          onScheduleTasks: async (projectName, tasks) => {
            const ws = wsRequestRef.current
            if (!ws) { console.warn('[Relay] No WS for task scheduling'); return }
            console.log(`[Relay] Scheduling ${tasks.length} tasks for project: ${projectName}`)

            // Estimate total project cost upfront
            try {
              const { getPreflightEstimate: estimate } = await import('../components/GatewayChat')
              const allDescs = tasks.map(t => `${t.title}: ${t.description}`).join('\n')
              const projectEst = await estimate(`Project with ${tasks.length} tasks:\n${allDescs.slice(0, 1000)}`, apiKey)
              const HIGH_PROJECT_THRESHOLD = 100
              if (projectEst.estimatedInternalTokens >= HIGH_PROJECT_THRESHOLD) {
                const proceed = window.confirm(
                  `Project "${projectName}" cost estimate:\n\n` +
                  `${projectEst.costExplanation}\n` +
                  `Tasks: ${tasks.length}\n` +
                  `Est. tokens: ~${projectEst.estimatedInternalTokens}\n\n` +
                  `Proceed?`
                )
                if (!proceed) return
              }
            } catch { /* estimate failed, proceed anyway */ }

            // Sort tasks by dependency order, then schedule sequentially
            const sorted = [...tasks].sort((a, b) => a.index - b.index)
            let delayMs = 0
            for (const task of sorted) {
              // Calculate delay based on dependencies
              const depEndTimes = task.dependencies.map(dep => {
                const depTask = sorted.find(t => t.index === dep)
                return depTask ? depTask.estimatedMinutes * 60000 : 0
              })
              const startAfter = Math.max(delayMs, ...depEndTimes)
              const scheduleAt = new Date(Date.now() + startAfter).toISOString()
              try {
                await ws('cron.add', {
                  job: {
                    name: `[${projectName}] ${task.title}`,
                    schedule: { kind: 'at', at: scheduleAt },
                    payload: {
                      kind: 'agentTurn',
                      message: `Project: ${projectName}\nTask: ${task.title}\n\n${task.description}\n\nComplete this task. Be thorough and test your work.`,
                    },
                    sessionTarget: 'isolated',
                    enabled: true,
                  },
                })
              } catch (e) { console.error(`[Relay] Failed to schedule task: ${task.title}`, e) }
              delayMs = startAfter + task.estimatedMinutes * 60000
            }
            console.log(`[Relay] All ${sorted.length} tasks scheduled`)
          },
          onPauseProject: async (projectName) => {
            const ws = wsRequestRef.current
            if (!ws) return
            try {
              const result = await ws('cron.list', { includeDisabled: false })
              const jobs = result?.jobs || result || []
              for (const job of jobs) {
                if (job.name?.startsWith(`[${projectName}]`)) {
                  await ws('cron.update', { jobId: job.jobId || job.id, patch: { enabled: false } })
                }
              }
              console.log(`[Relay] Paused project: ${projectName}`)
            } catch (e) { console.error('[Relay] Pause failed:', e) }
          },
          onStopProject: async (projectName) => {
            const ws = wsRequestRef.current
            if (!ws) return
            try {
              const result = await ws('cron.list', { includeDisabled: true })
              const jobs = result?.jobs || result || []
              for (const job of jobs) {
                if (job.name?.startsWith(`[${projectName}]`)) {
                  await ws('cron.remove', { jobId: job.jobId || job.id })
                }
              }
              console.log(`[Relay] Stopped project: ${projectName}`)
            } catch (e) { console.error('[Relay] Stop failed:', e) }
          },
          getWsRequest: () => wsRequestRef.current,
          onResumeProject: async (projectName) => {
            const ws = wsRequestRef.current
            if (!ws) return
            try {
              const result = await ws('cron.list', { includeDisabled: true })
              const jobs = result?.jobs || result || []
              for (const job of jobs) {
                if (job.name?.startsWith(`[${projectName}]`)) {
                  await ws('cron.update', { jobId: job.jobId || job.id, patch: { enabled: true } })
                }
              }
              console.log(`[Relay] Resumed project: ${projectName}`)
            } catch (e) { console.error('[Relay] Resume failed:', e) }
          },
        }, nodeId, cloudPort, securityTier)
        client.connect()
        setRelayClient(client)
      } catch (e) {
        console.warn('[CloudPage] Failed to start relay:', e)
      }
    })()
    return () => {
      cancelled = true
      setRelayClient(prev => { prev?.destroy(); return null })
    }
  }, [flow, user, session, nodeId, cloudPort, securityTier])

  const initialCheckDone = useRef(false)
  useEffect(() => {
    if (loading && !status) return
    if (initialCheckDone.current) return
    initialCheckDone.current = true

    const checkState = async () => {
      const homedir = await getHome()
      const dir = cloudDir(homedir)
      const env = ocEnv(homedir)
      setCloudStateDir(dir)

      // Check if cloud config exists
      let configExists = false
      try {
        const raw = await api().readFile(`${dir}/openclaw.json`)
        const config = JSON.parse(raw)
        const model = config?.agents?.defaults?.model?.primary || ''
        if (model && !model.startsWith('ollama/')) {
          configExists = true
        }
      } catch {}

      if (!configExists) {
        // Check if openclaw is installed
        let installed = false
        try {
          await api().exec('openclaw', ['--version'])
          installed = true
        } catch {
          installed = await api().isCommandAvailable('openclaw')
        }

        if (!installed) {
          setFlow('install')
        } else {
          setFlow('setup')
        }
        return
      }

      // Config exists — check if gateway is running on cloud port
      let gatewayReachable = false
      try {
        const resp = await fetch(`http://127.0.0.1:${cloudPort}/`)
        gatewayReachable = resp.ok || resp.status > 0
      } catch {}

      if (gatewayReachable) {
        await loadGatewayAuth()
        setFlow('ready')
      } else {
        try {
          // Kill anything on cloud port, then start gateway in background
          try { await api().killPort(cloudPort) } catch {}
          await api().startGatewayDetached('openclaw', ['gateway', 'run', '--port', String(cloudPort)], { OPENCLAW_STATE_DIR: dir }, `${dir}/gateway.log`)
          await new Promise(r => setTimeout(r, 3000))
          await loadGatewayAuth()
          setFlow('ready')
        } catch {
          setFlow('setup')
        }
      }
    }

    checkState()
  }, [loading, status])

  const loadGatewayAuth = useCallback(async () => {
    try {
      const homedir = await getHome()
      const dir = cloudDir(homedir)
      const raw = await api().readFile(`${dir}/openclaw.json`)
      const config = JSON.parse(raw)
      const token = config?.gateway?.auth?.token || ''
      const port = config?.gateway?.port || cloudPort
      setGatewayUrl(`ws://localhost:${port}`)
      setGatewayToken(token)

      // Enforce config integrity — revert any agent modifications
      let needsRestart = false

      // Ensure controlUi auth
      if (!config?.gateway?.controlUi?.allowInsecureAuth) {
        if (!config.gateway) config.gateway = {}
        if (!config.gateway.controlUi) config.gateway.controlUi = {}
        config.gateway.controlUi.allowInsecureAuth = true
        needsRestart = true
      }

      // Enforce: no channels (block WhatsApp/Signal/Telegram/Discord etc)
      if (config.channels && Object.keys(config.channels).length > 0) {
        config.channels = {}
        needsRestart = true
      }

      // Enforce: tools deny list based on selected template
      const template = getTemplateById(selectedTemplateId)
      const requiredDeny = template.toolsDeny
      if (!config.tools) config.tools = {}
      const currentDeny = Array.isArray(config.tools.deny) ? config.tools.deny : []
      if (JSON.stringify([...currentDeny].sort()) !== JSON.stringify([...requiredDeny].sort())) {
        config.tools.deny = requiredDeny
        needsRestart = true
      }
      // Clean up old incorrect location
      if (config.agents?.defaults?.tools) {
        delete config.agents.defaults.tools
        needsRestart = true
      }

      const platform = await api().getPlatform()

      if (needsRestart) {
        const configJson = JSON.stringify(config, null, 2)
        if (platform !== 'win32') {
          try { await sh(`chmod 644 "${dir}/openclaw.json" 2>/dev/null || true`) } catch {}
        }
        await api().writeFileSafe(`${dir}/openclaw.json`, configJson)
        if (platform !== 'win32') {
          try { await sh(`chmod 444 "${dir}/openclaw.json"`) } catch {}
        }
        // Restart cloud gateway
        try { await api().killPort(cloudPort) } catch {}
        try { await api().startGatewayDetached('openclaw', ['gateway', 'run', '--port', String(cloudPort)], { OPENCLAW_STATE_DIR: dir }, `${dir}/gateway.log`) } catch {}
        await new Promise(r => setTimeout(r, 3000))
      } else {
        // Ensure config is read-only (Unix only)
        if (platform !== 'win32') {
          try { await sh(`chmod 444 "${dir}/openclaw.json" 2>/dev/null || true`) } catch {}
        }
      }
    } catch {
      setGatewayUrl(`ws://localhost:${cloudPort}`)
      setGatewayToken('')
    }
  }, [selectedTemplateId])

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
      addLine('output', '📦 Installing components...')

      // Check if npm/node available, install openclaw globally
      try {
        await api().exec('npm', ['--version'])
      } catch {
        const platform = await api().getPlatform()
        if (platform === 'darwin') {
          addLine('output', '⚙️  Installing Homebrew...')
          await sh('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"')
          addLine('output', '⚙️  Installing Node.js...')
          await sh('brew install node')
        } else if (platform === 'linux') {
          addLine('output', '⚙️  Installing Node.js...')
          try {
            // Try NodeSource setup script (works on Ubuntu/Debian)
            await sh('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -')
            await sh('sudo apt-get install -y nodejs')
            addLine('output', '✅ Node.js installed!')
          } catch {
            try {
              // Fallback: try dnf (Fedora/RHEL)
              await sh('sudo dnf install -y nodejs npm')
              addLine('output', '✅ Node.js installed!')
            } catch {
              try {
                // Fallback: try pacman (Arch)
                await sh('sudo pacman -S --noconfirm nodejs npm')
                addLine('output', '✅ Node.js installed!')
              } catch {
                addLine('error', '❌ Could not auto-install Node.js.')
                addLine('output', '📥 Please install manually from: https://nodejs.org/en/download')
                addLine('error', '   Then restart OverClaw and try again.')
                return
              }
            }
          }
        } else {
          // Windows — auto-install Node.js
          addLine('output', '⚙️  Installing Node.js...')
          try {
            // Try winget first (built into Windows 10/11)
            await api().exec('winget', ['install', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-package-agreements', '--accept-source-agreements'], { timeout: 300000 })
            addLine('output', '✅ Node.js installed!')
          } catch {
            // Fallback: download and run MSI silently via PowerShell
            addLine('output', '⚙️  Downloading Node.js installer...')
            try {
              await api().exec('powershell', ['-Command',
                `$url = (Invoke-RestMethod 'https://nodejs.org/dist/index.json')[0]; ` +
                `$ver = $url.version; ` +
                `$msi = "$env:TEMP\\node-$ver-x64.msi"; ` +
                `Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-x64.msi" -OutFile $msi; ` +
                `Start-Process msiexec -ArgumentList "/i","$msi","/qn","/norestart" -Wait -NoNewWindow; ` +
                `Remove-Item $msi -Force`
              ], { timeout: 600000 })
              addLine('output', '✅ Node.js installed!')
            } catch (dlErr: any) {
              addLine('error', '❌ Could not auto-install Node.js.')
              addLine('error', '')
              addLine('output', '📥 Please install manually from: https://nodejs.org')
              window.open('https://nodejs.org/en/download', '_blank')
              addLine('error', '   Then restart OverClaw and try again.')
              return
            }
          }
          // Refresh PATH to pick up newly installed Node
          try {
            await api().refreshPath()
            await api().exec('npm', ['--version'])
          } catch {
            addLine('error', '⚠️  Node.js installed but PATH not updated. Please restart OverClaw.')
            return
          }
        }
      }

      // Check if git is available (needed by npm for some packages)
      const platform = await api().getPlatform()
      try {
        await api().exec('git', ['--version'])
      } catch {
        addLine('error', '❌ Git is required but not installed.')
        addLine('error', '')
        if (platform === 'win32') {
          addLine('output', '⚙️  Installing Git...')
          try {
            await api().exec('winget', ['install', '--id', 'Git.Git', '--silent', '--accept-package-agreements', '--accept-source-agreements'], { timeout: 300000 })
            addLine('output', '✅ Git installed!')
            // Refresh PATH and verify git
            try {
              await api().refreshPath()
              await api().exec('git', ['--version'])
            } catch {
              addLine('error', '⚠️  Git installed but PATH not updated. Please restart OverClaw.')
              return
            }
          } catch {
            // Fallback: download Git installer via PowerShell
            addLine('output', '⚙️  Downloading Git installer...')
            try {
              await api().exec('powershell', ['-Command',
                `$releases = Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest'; ` +
                `$asset = $releases.assets | Where-Object { $_.name -match 'Git-.*-64-bit.exe' } | Select-Object -First 1; ` +
                `$installer = "$env:TEMP\\git-installer.exe"; ` +
                `Invoke-WebRequest $asset.browser_download_url -OutFile $installer; ` +
                `Start-Process $installer -ArgumentList '/VERYSILENT','/NORESTART','/NOCANCEL','/SP-','/CLOSEAPPLICATIONS','/RESTARTAPPLICATIONS' -Wait -NoNewWindow; ` +
                `Remove-Item $installer -Force`
              ], { timeout: 600000 })
              addLine('output', '✅ Git installed!')
            } catch {
              addLine('error', '❌ Could not auto-install Git.')
              addLine('output', '📥 Please install manually from: https://git-scm.com')
              window.open('https://git-scm.com/download/win', '_blank')
              addLine('error', '   Then restart OverClaw and try again.')
              return
            }
          }
        } else if (platform === 'linux') {
          addLine('output', '⚙️  Installing Git...')
          try {
            await sh('sudo apt-get install -y git')
            addLine('output', '✅ Git installed!')
          } catch {
            try {
              await sh('sudo dnf install -y git')
              addLine('output', '✅ Git installed!')
            } catch {
              try {
                await sh('sudo pacman -S --noconfirm git')
                addLine('output', '✅ Git installed!')
              } catch {
                addLine('error', '❌ Could not auto-install Git.')
                addLine('output', '📥 Please install manually from: https://git-scm.com')
                addLine('error', '   Then restart OverClaw and try again.')
                return
              }
            }
          }
        } else {
          addLine('error', '   Install Xcode Command Line Tools: xcode-select --install')
        }
        return
      }

      addLine('output', '📦 Installing core components...')
      const installArgs = ['install', '-g', 'openclaw', 'clawhub']
      const plat = await api().getPlatform()
      if (isWin || plat === 'linux') {
        installArgs.push('--ignore-scripts')
      }
      if (isWin) {
        // Clean up any broken previous install on Windows (EPERM leftover)
        try {
          const homedir = await api().getHomedir()
          const npmOcDir = `${homedir}/AppData/Roaming/npm/node_modules/openclaw`
          await api().exec('powershell', ['-Command', `if (Test-Path '${npmOcDir}') { Remove-Item -Recurse -Force '${npmOcDir}' }`], { timeout: 30000 })
        } catch {}
      }
      try {
        if (plat === 'linux') {
          // On Linux, npm install -g often needs sudo or a user-local prefix
          try {
            await sh(`sudo npm ${installArgs.join(' ')}`)
          } catch {
            // Fallback: set up user-local npm prefix
            const homedir = await api().getHomedir()
            const npmDir = `${homedir}/.npm-global`
            addLine('output', '🔧 Setting up user-local npm directory...')
            await api().mkdirp(npmDir)
            await api().exec('npm', ['config', 'set', 'prefix', npmDir], { timeout: 30000 })
            await sh(`npm ${installArgs.join(' ')}`)
            addLine('output', `ℹ️  Installed to ${npmDir}/bin — this has been added to PATH`)
          }
        } else {
          await api().exec('npm', installArgs, { timeout: 300000 })
        }
      } catch (npmErr: any) {
        const npmMsg = npmErr?.message || String(npmErr) || ''
        if (npmMsg.includes('EACCES') || npmMsg.includes('permission')) {
          // Set up user-local npm prefix and retry
          const homedir = await api().getHomedir()
          const npmDir = `${homedir}/.npm-global`
          addLine('output', '🔧 Setting up user-local npm directory...')
          await api().mkdirp(npmDir)
          await api().exec('npm', ['config', 'set', 'prefix', npmDir], { timeout: 30000 })
          await api().exec('npm', installArgs, { timeout: 300000 })
          addLine('output', `ℹ️  Installed to ${npmDir}/bin — this has been added to PATH`)
        } else {
          throw npmErr
        }
      }

      addLine('output', '')
      addLine('output', '✅ Installation complete!')

      // Bootstrap default OpenClaw config so launchd gateway service doesn't crash on fresh machines
      try {
        await api().exec('openclaw', ['setup', '--mode', 'local', '--non-interactive'], { timeout: 120000 })
      } catch {}

      await fetchStatus()
      setTimeout(() => setFlow('setup'), 1000)
    } catch (err: any) {
      const msg = String(err?.message || err || '')
      if (msg.includes('spawn git') || msg.includes('path git')) {
        addLine('error', '❌ Git is not installed. Please install Git and restart OverClaw.')
        window.open('https://git-scm.com/downloads', '_blank')
      } else {
        // npm warnings on stderr can cause exec to reject even on success
        // Always check if openclaw actually installed before declaring failure
        try {
          await api().exec('openclaw', ['--version'])
          addLine('output', '')
          addLine('output', '✅ Installation complete!')
          try {
            await api().exec('openclaw', ['setup', '--mode', 'local', '--non-interactive'], { timeout: 120000 })
          } catch {}
          await fetchStatus()
          setTimeout(() => setFlow('setup'), 1000)
          return
        } catch {
          // openclaw genuinely not installed — show the error
          const firstLine = msg.split('\n').find((l: string) => l.includes('ERR!') || l.includes('error')) || msg.split('\n')[0]
          addLine('error', `❌ Installation failed: ${firstLine}`)
        }
      }
    }
  }, [fetchStatus])

  const handleSetupComplete = useCallback(async () => {
    await fetchStatus()
    await loadGatewayAuth()
    if ((isMac || isWindows) && !localStorage.getItem('overclaw-permissions-done')) {
      setFlow('permissions')
    } else {
      setFlow('ready')
    }
  }, [fetchStatus, loadGatewayAuth])

  const handleReset = useCallback(async () => {
    setShowConfirmReset(false)
    try {
      const homedir = await getHome()
      try { await api().killPort(cloudPort) } catch {}
      try { await sh(`rm -rf "${cloudDir(homedir)}"`) } catch {}
      localStorage.removeItem('overclaw-cloud-setup-complete')
      localStorage.removeItem('overclaw-cloud-provider')
      localStorage.removeItem('overclaw-cloud-model')
      localStorage.removeItem('overclaw-cloud-template')
      await fetchStatus()
      setFlow('setup')
    } catch {}
  }, [fetchStatus])

  const handleUninstall = useCallback(async () => {
    setShowConfirmUninstall(false)
    try {
      const homedir = await getHome()
      try { await api().killPort(cloudPort) } catch {}
      try { await sh(`rm -rf "${cloudDir(homedir)}"`) } catch {}
      localStorage.removeItem('overclaw-cloud-setup-complete')
      localStorage.removeItem('overclaw-cloud-provider')
      localStorage.removeItem('overclaw-cloud-model')
      localStorage.removeItem('overclaw-cloud-template')
      await fetchStatus()
      setFlow('install')
    } catch {}
  }, [fetchStatus])


  const applySecurityTier = useCallback(async (tier: SecurityTier) => {
    setSecurityTier(tier)
    localStorage.setItem(`overclaw-node-${nodeId}-tier`, tier)
    try {
      const patch = tierToConfigPatch(tier) as any
      const homedir = await getHome()
      const dir = cloudDir(homedir)
      const raw = await api().readFile(`${dir}/openclaw.json`)
      const config = JSON.parse(raw)
      config.tools = { ...(config.tools || {}), ...(patch.tools || {}) }
      await api().writeFileSafe(`${dir}/openclaw.json`, JSON.stringify(config, null, 2))
      try { await api().killPort(cloudPort) } catch {}
      await api().startGatewayDetached('openclaw', ['gateway', 'run', '--port', String(cloudPort)], { OPENCLAW_STATE_DIR: dir }, `${dir}/gateway.log`)
      relayClient?.sendStatus('idle')
      ;(relayClient as any)?.send?.({ type: 'relay.security_update', nodeId, tier, rateLimits: rateLimitOverride ? customRateLimit : DEFAULT_RATE_LIMITS[tier], gatewayPort: cloudPort })
    } catch (e) {
      console.warn('Failed to apply security tier', e)
    }
  }, [nodeId, cloudPort, relayClient, rateLimitOverride, customRateLimit])

  const persistRateLimits = useCallback((cfg: RateLimitConfig) => {
    setCustomRateLimit(cfg)
    const key = 'overclaw-node-ratelimits'
    const raw = localStorage.getItem(key)
    const map = raw ? JSON.parse(raw) : {}
    if (rateLimitOverride) map[nodeId] = cfg
    else delete map[nodeId]
    localStorage.setItem(key, JSON.stringify(map))
  }, [nodeId, rateLimitOverride])

  const handleSubAgentsChange = useCallback(async (subAgents: SubAgentRecord[]) => {
    try {
      if (!cloudStateDir) return
      await api().writeFileSafe(`${cloudStateDir}/workspace/agents-team.md`, buildAgentsTeamMarkdown(subAgents))

      if (selectedTemplateId === 'orchestrator') {
        const soulPath = `${cloudStateDir}/workspace/SOUL.md`
        const agentsPath = `${cloudStateDir}/workspace/AGENTS.md`
        const delegationText = orchestratorDelegationBlock(subAgents).trim()

        try {
          const currentSoul = await api().readFile(soulPath)
          const nextSoul = currentSoul.includes('## Sub-Agent Delegation')
            ? currentSoul.replace(/## Sub-Agent Delegation[\s\S]*/m, delegationText)
            : `${currentSoul.trim()}

${delegationText}
`
          await api().writeFileSafe(soulPath, nextSoul)
        } catch {}

        try {
          const currentAgents = await api().readFile(agentsPath)
          const marker = '## Sub-Agent Team'
          const teamSection = `${marker}
- Team manifest: ./agents-team.md
- Delegate tasks using sessions_spawn + sessions_send.
`
          const nextAgents = currentAgents.includes(marker)
            ? currentAgents.replace(/## Sub-Agent Team[\s\S]*/m, teamSection)
            : `${currentAgents.trim()}

${teamSection}`
          await api().writeFileSafe(agentsPath, nextAgents)
        } catch {}
      }
    } catch {}
  }, [cloudStateDir, selectedTemplateId])

  // Paywall: require Pro subscription
  if (isPro === false) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(99,102,241,0.1)' }}>
            <Crown size={28} style={{ color: '#6366f1' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Upgrade to Pro</h2>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Cloud AI requires a Pro subscription. Get access to GPT, Claude, Gemini, DeepSeek, and more — with smart model routing.
          </p>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
            $24.99/mo · Includes 2,000 free tokens · Buy more as you go
          </p>
          <button
            onClick={() => {
              // Navigate to billing page — dispatch custom event that Sidebar listens to
              window.dispatchEvent(new CustomEvent('navigate', { detail: 'Billing' }))
            }}
            className="px-6 py-3 text-sm font-medium rounded-xl transition-all hover:opacity-90"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            View Plans <ArrowRight size={14} className="inline ml-1" />
          </button>
        </div>
      </div>
    )
  }

  if (isPro === null || flow === 'loading') {
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
            <Cloud size={28} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Set Up Cloud AI</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Connect to powerful cloud AI models. Faster responses and more capable than local models. Requires an API key from your preferred provider.
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

  if (flow === 'setup') {
    return (
      <div className="max-w-lg mx-auto py-8">
        <CloudSetupWizard onComplete={handleSetupComplete} selectedTemplateId={selectedTemplateId} onTemplateChange={setSelectedTemplateId} />
      </div>
    )
  }

  if (flow === 'permissions') {
    return (
      <div className="max-w-lg mx-auto py-8">
        <PlatformPermissions onContinue={() => {
          localStorage.setItem('overclaw-permissions-done', 'true')
          setFlow('ready')
        }} />
      </div>
    )
  }

  // Ready — chat left, tasks right
  return (
    <div className="flex flex-col h-full">
      <ScreenSaver active={screenSaverActive} onDismiss={() => setScreenSaverActive(false)} />
      {showConfirmUninstall && (
        <ConfirmDialog
          title="Uninstall cloud AI?"
          message="This will remove your cloud configuration, API key, and all data. You'll need to set up again from scratch."
          confirmLabel="Uninstall"
          danger
          onConfirm={handleUninstall}
          onCancel={() => setShowConfirmUninstall(false)}
        />
      )}
      {showConfirmReset && (
        <ConfirmDialog
          title="Reset cloud setup?"
          message="This will remove your configuration and API key. You'll need to set up again."
          confirmLabel="Reset"
          danger
          onConfirm={handleReset}
          onCancel={() => setShowConfirmReset(false)}
        />
      )}
      <div className="px-3 pt-3">
        <div className="rounded-lg p-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Active Node</span>
          {Array.from({ length: 10 }, (_, i) => `node-${i + 1}`).map(id => (
            <button
              key={id}
              onClick={() => setNodeId(id)}
              className="px-2.5 py-1 text-xs rounded-full transition-all"
              style={{
                background: nodeId === id ? 'var(--accent-blue)' : 'transparent',
                color: nodeId === id ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${nodeId === id ? 'var(--accent-blue)' : 'var(--border-color)'}`,
              }}
            >
              Node {id.split('-')[1]}
            </button>
          ))}
        </div>
      </div>
      {showSshModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowSshModal(false)}>
          <div className="w-[760px] max-w-[95vw] rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>SSH Hardening Script</h3>
            <pre className="text-xs p-3 rounded-lg max-h-[50vh] overflow-auto" style={{ background: 'var(--bg-page)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{generateSSHHardeningScript()}{"\n"}{generateFirewallScript(cloudPort)}</pre>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowSshModal(false)} className="px-3 py-1.5 text-xs rounded" style={{ border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Close</button>
              <button onClick={async () => {
                const ws = wsRequestRef.current
                if (!ws) return
                await ws('exec', { command: `${generateSSHHardeningScript()}\n${generateFirewallScript(cloudPort)}` })
                setShowSshModal(false)
              }} className="px-3 py-1.5 text-xs rounded" style={{ border: '1px solid rgba(245,158,11,0.6)', color: '#F59E0B' }}>Run Harden SSH</button>
            </div>
          </div>
        </div>
      )}
      <div className="px-3">
        <div className="rounded-lg p-3 mt-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Security</div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(Object.keys(SECURITY_TIERS) as SecurityTier[]).map((tier) => {
              const t = SECURITY_TIERS[tier]
              const selected = securityTier === tier
              return <button key={tier} onClick={() => applySecurityTier(tier)} className="text-left p-2 rounded-lg" style={{ border: `1px solid ${selected ? t.color : 'var(--border-color)'}`, background: selected ? `${t.color}33` : 'transparent' }}><div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t.icon} {t.label}</div><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.description}</div></button>
            })}
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <label><input type="checkbox" checked={rateLimitOverride} onChange={(e) => setRateLimitOverride(e.target.checked)} className="mr-1" />Custom rate limits</label>
            <span>Commands/min: {customRateLimit.maxCommandsPerMinute}</span>
            <span>Tokens/hr: {customRateLimit.maxTokensPerHour}</span>
            <span>Gateway Port: <code style={{ fontFamily: 'monospace' }}>{cloudPort}</code></span>
            <button onClick={() => setShowSshModal(true)} className="px-2 py-1 rounded" style={{ border: '1px solid rgba(245,158,11,0.6)', color: '#F59E0B' }}>Harden SSH</button>
          </div>
        </div>
      </div>
      <div className="flex flex-1 gap-3 p-3 min-h-0">
        <div className="flex flex-col w-[58%] min-w-0">
          <GatewayChat
            gatewayUrl={gatewayUrl}
            gatewayToken={gatewayToken}
            sessionKey="webchat"
            onWsReady={(req) => { wsRequestRef.current = req; gatewayRefs.cloud = req }}
            clearRef={clearChatRef}
            stateDir={cloudStateDir}
            title="Chat with cloud agent"
            messagePrefix="[System: Auto-install missing dependencies silently (pip3 install --break-system-packages, brew install, etc). NEVER show terminal commands, shell output, or CLI instructions to the user. NEVER send messages via WhatsApp/Signal/Telegram/email or any messaging platform. Present everything in a clean, user-friendly way. You are a desktop app assistant.]"
            apiKey={proxyApiKey}
            relay={relayClient}
            onRelaySendRef={relaySendRef}
            onRelayAbortRef={relayAbortRef}
            onRelayHistoryRef={relayHistoryRef}
          />
        </div>
        <div className="flex flex-col w-[42%] min-w-0">
          <div className="mb-2 rounded-lg p-1 flex gap-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <button onClick={() => setRightTab('tasks')} className="flex-1 py-1.5 text-xs rounded-md font-medium" style={{ background: rightTab === 'tasks' ? 'var(--accent-blue)' : 'transparent', color: rightTab === 'tasks' ? '#fff' : 'var(--text-muted)' }}>Tasks</button>
            <button onClick={() => setRightTab('subagents')} className="flex-1 py-1.5 text-xs rounded-md font-medium" style={{ background: rightTab === 'subagents' ? '#EF4444' : 'transparent', color: rightTab === 'subagents' ? '#fff' : 'var(--text-muted)' }}>Sub-Agents</button>
          </div>
          <div className="flex-1 min-h-0">
            {rightTab === 'tasks' ? (
              <TasksPanel
                gatewayUrl={gatewayUrl}
                gatewayToken={gatewayToken}
                wsRequest={(m, p) => wsRequestRef.current ? wsRequestRef.current(m, p) : Promise.reject(new Error('Not connected'))}
                onClearChat={() => clearChatRef.current?.()}
                stateDir={cloudStateDir}
                port={cloudPort}
                apiKey={proxyApiKey}
              />
            ) : (
              <SubAgentsPanel
                wsRequest={(m, p) => wsRequestRef.current ? wsRequestRef.current(m, p) : Promise.reject(new Error('Not connected'))}
                cloudStateDir={cloudStateDir}
                onSubAgentsChange={handleSubAgentsChange}
              />
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-3 pb-3">
        <button
          onClick={() => setShowConfirmReset(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all hover:opacity-80"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-color)' }}
        >
          <Key size={12} /> Reset Setup
        </button>
        <button
          onClick={() => setShowConfirmUninstall(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all hover:opacity-80"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-color)' }}
        >
          <Trash2 size={12} /> Uninstall
        </button>
      </div>
    </div>
  )
}
