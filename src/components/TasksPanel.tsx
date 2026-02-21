import { useState, useCallback, useEffect, useRef } from 'react'
import { Clock, Play, CheckCircle2, Zap, RefreshCw, Terminal, Trash2, Globe, Cpu, FileText, X, Check, Loader2, Package, Search, Download, ChevronRight, Plus, Calendar, Repeat, Timer, MessageSquare, Bot, Pause, Eye, Coins } from 'lucide-react'
import { getPreflightEstimate, type PreflightEstimate } from './GatewayChat'

const isElectron = !!window.electronAPI?.isElectron
const isWin = (window.electronAPI?.platform || navigator.platform) === 'win32'

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

// Cache the resolved openclaw path
let _ocPath: string | null = null
async function oc(): Promise<string> {
  if (_ocPath) return _ocPath
  const platform = window.electronAPI?.platform || 'darwin'
  
  // Bare `openclaw` should work if it's installed anywhere standard
  try { await sh('openclaw --version'); _ocPath = 'openclaw'; return 'openclaw' } catch {}
  
  const homedir = await getHome()
  
  if (platform === 'win32') {
    const winPaths = [
      `${homedir}\\AppData\\Roaming\\npm\\openclaw.cmd`,
    ]
    for (const p of winPaths) {
      try { await sh(`"${p}" --version`); _ocPath = p; return p } catch {}
    }
  } else {
    const unixPaths = [
      '/usr/local/bin/openclaw',
      '/opt/homebrew/bin/openclaw',
      `${homedir}/.npm-global/bin/openclaw`,
      `${homedir}/.volta/bin/openclaw`,
    ]
    for (const p of unixPaths) {
      try { await sh(`"${p}" --version 2>/dev/null`); _ocPath = p; return p } catch {}
    }
    try {
      const resolved = (await sh('zsh -ilc "which openclaw" 2>/dev/null')).trim()
      if (resolved && !resolved.includes('not found') && resolved.startsWith('/')) {
        _ocPath = resolved; return resolved
      }
    } catch {}
  }
  
  // Last resort: npx
  try {
    await sh('npx openclaw --version')
    _ocPath = 'npx openclaw'; return 'npx openclaw'
  } catch {}
  throw new Error('OpenClaw binary not found')
}

// --- Model Picker Modal ---

interface TierInfo {
  id: string
  role: string
  label: string
  icon: string
  desc: string
  color: string
  bg: string
}

const TIER_META: Record<string, { label: string; icon: string; desc: string; color: string; bg: string }> = {
  fast: { label: 'Fast', icon: '⚡', desc: 'Quick replies, simple tasks', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  balanced: { label: 'Balanced', icon: '⚖️', desc: 'Everyday tasks, good quality', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  smart: { label: 'Powerful', icon: '🧠', desc: 'Complex reasoning, tool use', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
}

// Cloud provider models — keyed by env var name
const CLOUD_MODELS: Record<string, { provider: string; icon: string; models: { id: string; name: string; desc: string }[] }> = {
  ANTHROPIC_API_KEY: { provider: 'Anthropic', icon: '🟤', models: [
    { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'Fast, intelligent, great for most tasks' },
    { id: 'anthropic/claude-opus-4-20250514', name: 'Claude Opus 4', desc: 'Most capable, complex reasoning' },
    { id: 'anthropic/claude-haiku-3.5-20241022', name: 'Claude Haiku 3.5', desc: 'Fastest, cheapest' },
  ]},
  OPENAI_API_KEY: { provider: 'OpenAI', icon: '🟢', models: [
    { id: 'openai/gpt-4o', name: 'GPT-4o', desc: 'Fast and capable all-rounder' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Cheapest, quick replies' },
    { id: 'openai/o3', name: 'o3', desc: 'Advanced reasoning' },
  ]},
  GOOGLE_API_KEY: { provider: 'Google', icon: '🔵', models: [
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Most capable Google model' },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Fast and efficient' },
  ]},
  OPENROUTER_API_KEY: { provider: 'OpenRouter', icon: '🟣', models: [
    { id: 'openrouter/anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', desc: 'Via OpenRouter' },
    { id: 'openrouter/openai/gpt-4o', name: 'GPT-4o', desc: 'Via OpenRouter' },
    { id: 'openrouter/google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Via OpenRouter' },
  ]},
  XAI_API_KEY: { provider: 'xAI', icon: '⚫', models: [
    { id: 'xai/grok-3', name: 'Grok 3', desc: 'xAI flagship model' },
    { id: 'xai/grok-3-mini', name: 'Grok 3 Mini', desc: 'Faster, lighter Grok' },
  ]},
}

function ModelPickerModal({ open, onClose, wsRequest, onSelect, stateDir }: {
  open: boolean
  onClose: () => void
  wsRequest: (method: string, params: any) => Promise<any>
  onSelect: (modelId: string) => void
  stateDir?: string
}) {
  const [tiers, setTiers] = useState<TierInfo[]>([])
  const [cloudModels, setCloudModels] = useState<{ id: string; name: string; desc: string; provider: string; icon: string }[]>([])
  const [currentModel, setCurrentModel] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isCloud, setIsCloud] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)

    getHome().then(async h => {
      const ea = window.electronAPI!
      const dir = stateDir || `${h}/.openclaw`

      // Load current model
      try {
        const raw = await ea.readFile(`${dir}/openclaw.json`)
        const config = JSON.parse(raw)
        const primary = config?.agents?.defaults?.model?.primary || ''
        setCurrentModel(primary)
        setIsCloud(!primary.startsWith('ollama/'))
      } catch {}

      if (stateDir && stateDir.includes('/cloud')) {
        setIsCloud(true)
        try {
          const envRaw = await ea.readFile(`${dir}/.env`)
          const available: typeof cloudModels = []
          for (const [envKey, provider] of Object.entries(CLOUD_MODELS)) {
            if (envRaw.includes(`${envKey}=`)) {
              for (const m of provider.models) {
                available.push({ ...m, provider: provider.provider, icon: provider.icon })
              }
            }
          }
          setCloudModels(available)
        } catch {
          setCloudModels([])
        }
      } else {
        setIsCloud(false)
        try {
          const tiersRaw = await ea.readFile(`${dir}/model-tiers.json`)
          const tiersList = JSON.parse(tiersRaw) as { id: string; role: string }[]
          setTiers(tiersList.map(t => {
            const meta = TIER_META[t.role] || TIER_META.balanced
            return { id: t.id, role: t.role, ...meta }
          }))
        } catch {
          setTiers([])
        }
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [open, stateDir])

  if (!open) return null

  const handleSelect = async (modelId: string) => {
    onSelect(modelId)
    if (stateDir) {
      try {
        const ea = window.electronAPI!
        const raw = await ea.readFile(`${stateDir}/openclaw.json`)
        const config = JSON.parse(raw)
        if (!config.agents) config.agents = {}
        if (!config.agents.defaults) config.agents.defaults = {}
        if (!config.agents.defaults.model) config.agents.defaults.model = {}
        config.agents.defaults.model.primary = modelId
        const json = JSON.stringify(config, null, 2)
        const platform = ea.platform
        if (platform !== 'win32') {
          if ((window.electronAPI?.platform || "darwin") !== "win32") try { await sh(`chmod 644 "${stateDir}/openclaw.json" 2>/dev/null || true`) } catch {}
        }
        await ea.writeFileSafe(`${stateDir}/openclaw.json`, json)
        if (platform !== 'win32') {
          if ((window.electronAPI?.platform || "darwin") !== "win32") try { await sh(`chmod 444 "${stateDir}/openclaw.json" 2>/dev/null || true`) } catch {}
        }
      } catch (e) { console.warn('[ModelPicker] config update failed:', e) }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-[400px] max-h-[70vh] rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Cpu size={14} style={{ color: 'var(--accent-teal)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Switch Model</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center py-6">
              <Loader2 size={20} className="animate-spin mx-auto mb-2" style={{ color: 'var(--accent-blue)' }} />
            </div>
          ) : isCloud ? (
            cloudModels.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No models available — check your API key</p>
              </div>
            ) : cloudModels.map(m => {
              const isActive = currentModel === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:opacity-80"
                  style={{
                    background: isActive ? 'var(--accent-bg-strong)' : 'var(--bg-page)',
                    border: isActive ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                  }}
                >
                  <span className="text-lg">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                      {isActive && <Check size={13} style={{ color: 'var(--accent-blue)' }} />}
                    </div>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.desc}</p>
                  </div>
                  <span className="text-[9px] shrink-0 px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-page)', color: 'var(--text-muted)' }}>{m.provider}</span>
                </button>
              )
            })
          ) : (
            tiers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No models configured</p>
              </div>
            ) : tiers.map(t => {
              const isActive = currentModel === `ollama/${t.id}`
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelect(`ollama/${t.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:opacity-80"
                  style={{
                    background: isActive ? t.bg : 'var(--bg-page)',
                    border: isActive ? `1px solid ${t.color}` : '1px solid var(--border-color)',
                  }}
                >
                  <span className="text-lg">{t.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
                      {isActive && <Check size={13} style={{ color: t.color }} />}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.desc}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// --- Main Panel ---

// --- Skills Section ---

interface InstalledSkill {
  slug: string
  version: string
}

interface SearchResult {
  slug: string
  name: string
  version: string
  score?: number
}

function SkillsSection({ stateDir }: { stateDir?: string }) {
  const [showModal, setShowModal] = useState(false)
  const [installed, setInstalled] = useState<InstalledSkill[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wdFlag = stateDir ? `--workdir "${stateDir}"` : ''

  // Resolve clawhub binary (same PATH issue as openclaw in Electron)
  const chRef = useRef<string | null>(null)
  const ch = useCallback(async (): Promise<string> => {
    if (chRef.current) return chRef.current
    try { await sh('clawhub --cli-version'); chRef.current = 'clawhub'; return 'clawhub' } catch {}
    const homedir = await getHome()
    if (isWin) {
      const winPaths = [`${homedir}\\AppData\\Roaming\\npm\\clawhub.cmd`]
      for (const p of winPaths) {
        try { await sh(`"${p}" --cli-version`); chRef.current = p; return p } catch {}
      }
    } else {
      const paths = [
        '/usr/local/bin/clawhub',
        '/opt/homebrew/bin/clawhub',
        `${homedir}/.npm-global/bin/clawhub`,
        `${homedir}/.volta/bin/clawhub`,
      ]
      for (const p of paths) {
        try { await sh(`"${p}" --cli-version`); chRef.current = p; return p } catch {}
      }
      try {
        const resolved = (await sh('zsh -ilc "which clawhub" 2>/dev/null')).trim()
        if (resolved && resolved.startsWith('/')) { chRef.current = resolved; return resolved }
      } catch {}
    }
    try { await sh('npx clawhub --cli-version'); chRef.current = 'npx clawhub'; return 'npx clawhub' } catch {}
    throw new Error('ClawHub CLI not found — try running: npm install -g clawhub')
  }, [])

  const loadInstalled = useCallback(async () => {
    try {
      const bin = await ch()
      const raw = await sh(`${bin} list ${wdFlag} 2>&1`)
      if (raw.includes('No installed skills')) {
        setInstalled([])
        return
      }
      // Parse "slug  1.0.0" or "slug v1.0.0" lines
      const skills: InstalledSkill[] = []
      for (const line of raw.split('\n')) {
        const match = line.match(/^(\S+)\s+v?([\d.]+)/)
        if (match && !match[1].startsWith('-') && !match[1].startsWith('✔')) skills.push({ slug: match[1], version: match[2] })
      }
      setInstalled(skills)
    } catch {
      setInstalled([])
    }
  }, [wdFlag, ch])

  useEffect(() => {
    loadInstalled()
  }, [loadInstalled])

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    setError(null)
    try {
      const bin = await ch()
      const raw = await sh(`${bin} search "${q.replace(/"/g, '\\"')}" 2>&1`)
      const items: SearchResult[] = []
      for (const line of raw.split('\n')) {
        const match = line.match(/^(\S+)\s+v([\d.]+)\s+(.+?)\s+\(([\d.]+)\)/)
        if (match) items.push({ slug: match[1], name: match[3].trim(), version: match[2], score: parseFloat(match[4]) })
      }
      setResults(items)
    } catch (e: any) {
      setError(e.message)
      setResults([])
    }
    setSearching(false)
  }, [])

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => handleSearch(val), 400)
  }, [handleSearch])

  const handleInstall = useCallback(async (slug: string) => {
    setInstalling(slug)
    setError(null)
    try {
      const bin = await ch()
      const output = await sh(`${bin} install "${slug}" ${wdFlag} --force 2>&1`)
      console.log('[Skills] install output:', output)
      await loadInstalled()
    } catch (e: any) {
      setError(`Install failed: ${e.message}`)
    }
    setInstalling(null)
  }, [wdFlag, loadInstalled])

  const handleUninstall = useCallback(async (slug: string) => {
    setUninstalling(slug)
    try {
      const dir = stateDir || (await getHome() + '/.openclaw')
      await sh(`rm -rf "${dir}/skills/${slug}"`)
      // Remove from lockfile (.clawhub/lock.json)
      try {
        const lockPath = `${dir}/.clawhub/lock.json`
        const raw = await sh(`cat "${lockPath}" 2>/dev/null`)
        const lock = JSON.parse(raw)
        if (lock.skills && lock.skills[slug]) {
          delete lock.skills[slug]
          const tmp = `/tmp/overclaw-lock-${Date.now()}.json`
          const json = JSON.stringify(lock, null, 2)
          await sh(`printf '%s' '${json.replace(/'/g, "'\\''")}' > "${tmp}" && mv "${tmp}" "${lockPath}"`)
        }
      } catch (e) { console.warn('[Skills] lockfile update failed:', e) }
      await loadInstalled()
    } catch (e) { console.warn('[Skills] uninstall failed:', e) }
    setUninstalling(null)
  }, [stateDir, loadInstalled])

  const isInstalled = (slug: string) => installed.some(s => s.slug === slug)

  return (
    <>
      <div className="shrink-0 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={14} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Skills</span>
            {installed.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: 'var(--accent-bg-strong)', color: 'var(--accent-blue)' }}>
                {installed.length}
              </span>
            )}
          </div>
          <button
            onClick={() => { setShowModal(true); loadInstalled() }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all hover:opacity-80"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            <Download size={11} /> Install Skills
          </button>
        </div>
        {installed.length > 0 && (
          <div className="px-4 pb-3 space-y-1.5">
            {installed.map(s => (
              <div key={s.slug} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.slug}</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>v{s.version}</p>
                </div>
                {uninstalling === s.slug ? (
                  <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <button onClick={() => handleUninstall(s.slug)} className="p-1 rounded hover:opacity-70" style={{ color: '#f85149' }} title="Remove">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Install Skills Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="w-[480px] max-h-[70vh] rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <Package size={14} style={{ color: 'var(--accent-blue)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Install Skills from ClawHub</span>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:opacity-70">
                <X size={14} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <div className="px-4 py-3 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  placeholder="Search skills on ClawHub..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  autoFocus
                />
                {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--text-muted)' }} />}
              </div>
            </div>

            {error && (
              <div className="px-4 pb-2">
                <p className="text-[11px]" style={{ color: '#f85149' }}>{error}</p>
              </div>
            )}

            <div className="flex-1 overflow-auto px-4 pb-4 space-y-1.5">
              {!query && results.length === 0 && !searching && (
                <div className="text-center py-8">
                  <Search size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Search for skills by name or description</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Skills add new abilities to your AI agent</p>
                </div>
              )}
              {results.map(r => {
                const alreadyInstalled = isInstalled(r.slug)
                return (
                  <div key={r.slug} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.name}</p>
                        <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>v{r.version}</span>
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.slug}</p>
                    </div>
                    {alreadyInstalled ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md" style={{ color: 'var(--accent-green, #22c55e)', background: 'rgba(34,197,94,0.1)' }}>
                        <Check size={10} /> Installed
                      </span>
                    ) : installing === r.slug ? (
                      <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--accent-blue)' }} />
                    ) : (
                      <button
                        onClick={() => handleInstall(r.slug)}
                        className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-md transition-all hover:opacity-80 shrink-0"
                        style={{ background: 'var(--accent-blue)', color: '#fff' }}
                      >
                        <Download size={10} /> Install
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// --- Cron Job Types & Modal ---

interface CronJob {
  jobId: string
  name?: string
  schedule: any
  payload: any
  sessionTarget: string
  enabled: boolean
  nextRunAtMs?: number
  runningAtMs?: number
  lastRunAtMs?: number
  lastStatus?: string
  lastDurationMs?: number
}

type ScheduleKind = 'at' | 'every' | 'cron'

const INTERVAL_PRESETS = [
  { label: 'Every 5 min', ms: 5 * 60 * 1000 },
  { label: 'Every 15 min', ms: 15 * 60 * 1000 },
  { label: 'Every 30 min', ms: 30 * 60 * 1000 },
  { label: 'Every hour', ms: 60 * 60 * 1000 },
  { label: 'Every 6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: 'Every 12 hours', ms: 12 * 60 * 60 * 1000 },
  { label: 'Every 24 hours', ms: 24 * 60 * 60 * 1000 },
]

const CRON_PRESETS = [
  { label: 'Every day at 9am', expr: '0 9 * * *' },
  { label: 'Every weekday at 9am', expr: '0 9 * * 1-5' },
  { label: 'Every Monday at 9am', expr: '0 9 * * 1' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every 6 hours', expr: '0 */6 * * *' },
]

function formatSchedule(schedule: any): string {
  if (!schedule) return 'Unknown'
  if (schedule.kind === 'at') {
    try { return `Once at ${new Date(schedule.at).toLocaleString()}` } catch { return `Once at ${schedule.at}` }
  }
  if (schedule.kind === 'every') {
    const ms = schedule.everyMs
    if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)}d`
    if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`
    if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`
    return `Every ${Math.round(ms / 1000)}s`
  }
  if (schedule.kind === 'cron') return schedule.expr || 'Cron'
  return JSON.stringify(schedule)
}

interface TaskAttachment {
  id: string
  file: File
  dataUrl: string
  fileName: string
}

function NewTaskModal({ open, onClose, wsRequest, stateDir, apiKey }: {
  open: boolean
  onClose: () => void
  wsRequest: (method: string, params: any) => Promise<any>
  stateDir?: string
  apiKey?: string
}) {
  const [name, setName] = useState('')
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('every')
  const [atDate, setAtDate] = useState('')
  const [atTime, setAtTime] = useState('')
  const [everyMs, setEveryMs] = useState(3600000)
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [cronTz, setCronTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [sessionTarget, setSessionTarget] = useState<'main' | 'isolated'>('isolated')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [taskEstimate, setTaskEstimate] = useState<PreflightEstimate | null>(null)
  const [estimatingTask, setEstimatingTask] = useState(false)
  const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced estimate when message changes (cloud mode only)
  useEffect(() => {
    if (estimateTimer.current) clearTimeout(estimateTimer.current)
    setTaskEstimate(null)
    if (!apiKey || !message.trim() || message.trim().length < 20) return
    estimateTimer.current = setTimeout(async () => {
      setEstimatingTask(true)
      try {
        const est = await getPreflightEstimate(message.trim(), apiKey)
        setTaskEstimate(est)
      } catch { /* ignore */ }
      setEstimatingTask(false)
    }, 1500)
    return () => { if (estimateTimer.current) clearTimeout(estimateTimer.current) }
  }, [message, apiKey])

  useEffect(() => {
    if (open) { setName(''); setMessage(''); setError(null); setSaving(false); setAttachments([]) }
  }, [open])

  const addFiles = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files).slice(0, 5 - attachments.length)) {
      if (file.size > 10 * 1024 * 1024) continue
      const id = crypto.randomUUID?.() || String(Math.random())
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments(prev => [...prev, { id, file, dataUrl: reader.result as string, fileName: file.name }])
      }
      reader.readAsDataURL(file)
    }
  }, [attachments.length])

  if (!open) return null

  const handleSave = async () => {
    if (!message.trim() && attachments.length === 0) { setError('Message or files required'); return }
    setSaving(true); setError(null)

    let schedule: any
    if (scheduleKind === 'at') {
      if (!atDate || !atTime) { setError('Date and time are required'); setSaving(false); return }
      schedule = { kind: 'at', at: new Date(`${atDate}T${atTime}`).toISOString() }
    } else if (scheduleKind === 'every') {
      schedule = { kind: 'every', everyMs }
    } else {
      if (!cronExpr.trim()) { setError('Cron expression is required'); setSaving(false); return }
      schedule = { kind: 'cron', expr: cronExpr.trim(), tz: cronTz }
    }

    // Save attached files to workspace and build file references
    let fullMessage = message.trim()
    if (attachments.length > 0 && isElectron) {
      try {
        const home = await getHome()
        const dir = stateDir || `${home}/.openclaw`
        const uploadDir = `${dir}/workspace/task-uploads`
        await sh(`mkdir -p "${uploadDir}"`)

        const filePaths: string[] = []
        for (const att of attachments) {
          const base64 = att.dataUrl.includes(',') ? att.dataUrl.split(',')[1] : att.dataUrl
          const destPath = `${uploadDir}/${Date.now()}-${att.fileName}`
          await sh(`echo '${base64}' | base64 -d > "${destPath}"`)
          filePaths.push(destPath)
        }

        const fileList = filePaths.map(p => `- ${p}`).join('\n')
        fullMessage = fullMessage
          ? `${fullMessage}\n\nAttached files (saved to workspace):\n${fileList}`
          : `Process these attached files:\n${fileList}`
      } catch (e: any) {
        setError(`Failed to save files: ${e.message}`)
        setSaving(false)
        return
      }
    }

    const payload = sessionTarget === 'main'
      ? { kind: 'systemEvent', text: fullMessage }
      : { kind: 'agentTurn', message: fullMessage }

    try {
      await wsRequest('cron.add', {
        job: { name: name.trim() || undefined, schedule, payload, sessionTarget, enabled: true },
      })
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to create task')
    }
    setSaving(false)
  }

  const inputStyle = { background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-[480px] max-h-[85vh] rounded-xl flex flex-col overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Plus size={14} style={{ color: 'var(--accent-teal)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>New Scheduled Task</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Task Name */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Task Name (optional)</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Morning briefing, Check emails..."
              className="w-full rounded-lg px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </div>

          {/* Schedule Type */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Schedule</label>
            <div className="flex gap-1.5 mb-3">
              {([
                { key: 'at' as const, label: 'One-time', icon: <Calendar size={12} /> },
                { key: 'every' as const, label: 'Interval', icon: <Repeat size={12} /> },
                { key: 'cron' as const, label: 'Cron', icon: <Timer size={12} /> },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setScheduleKind(opt.key)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: scheduleKind === opt.key ? 'var(--accent-bg-strong)' : 'var(--bg-page)',
                    border: scheduleKind === opt.key ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                    color: scheduleKind === opt.key ? 'var(--accent-blue)' : 'var(--text-muted)',
                  }}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>

            {/* Schedule Details */}
            {scheduleKind === 'at' && (
              <div className="flex gap-2">
                <input type="date" value={atDate} onChange={e => setAtDate(e.target.value)} className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" style={inputStyle} />
                <input type="time" value={atTime} onChange={e => setAtTime(e.target.value)} className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" style={inputStyle} />
              </div>
            )}

            {scheduleKind === 'every' && (
              <div className="flex flex-wrap gap-1.5">
                {INTERVAL_PRESETS.map(p => (
                  <button
                    key={p.ms}
                    onClick={() => setEveryMs(p.ms)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                      background: everyMs === p.ms ? 'var(--accent-bg-strong)' : 'var(--bg-page)',
                      border: everyMs === p.ms ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      color: everyMs === p.ms ? 'var(--accent-blue)' : 'var(--text-muted)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {scheduleKind === 'cron' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CRON_PRESETS.map(p => (
                    <button
                      key={p.expr}
                      onClick={() => setCronExpr(p.expr)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{
                        background: cronExpr === p.expr ? 'var(--accent-bg-strong)' : 'var(--bg-page)',
                        border: cronExpr === p.expr ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                        color: cronExpr === p.expr ? 'var(--accent-blue)' : 'var(--text-muted)',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  value={cronExpr} onChange={e => setCronExpr(e.target.value)}
                  placeholder="0 9 * * *"
                  className="w-full rounded-lg px-3 py-2 text-xs font-mono outline-none"
                  style={inputStyle}
                />
                <input
                  value={cronTz} onChange={e => setCronTz(e.target.value)}
                  placeholder="Timezone (e.g. Europe/London)"
                  className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {/* Session Target */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Run In</label>
            <div className="flex gap-1.5">
              {([
                { key: 'isolated' as const, label: 'Background (isolated)', icon: <Bot size={12} />, desc: 'Agent runs independently' },
                { key: 'main' as const, label: 'Main Session', icon: <MessageSquare size={12} />, desc: 'Injects into your chat' },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSessionTarget(opt.key)}
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all"
                  style={{
                    background: sessionTarget === opt.key ? 'var(--accent-bg-strong)' : 'var(--bg-page)',
                    border: sessionTarget === opt.key ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                  }}
                >
                  <span style={{ color: sessionTarget === opt.key ? 'var(--accent-blue)' : 'var(--text-muted)' }}>{opt.icon}</span>
                  <div>
                    <p className="text-[11px] font-medium" style={{ color: sessionTarget === opt.key ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{opt.label}</p>
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Message / Prompt */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              {sessionTarget === 'main' ? 'System Event Text' : 'Agent Prompt'}
            </label>
            <textarea
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder={sessionTarget === 'main' ? 'e.g. Reminder: check your emails' : 'e.g. Check my inbox and summarize any urgent emails'}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none"
              style={inputStyle}
            />
          </div>

          {/* File Attachments */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Attachments (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.html,.css,.zip,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = '' } }}
            />
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map(att => (
                  <div key={att.id} className="relative group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px]" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                    {att.file.type.startsWith('image/') && att.dataUrl ? (
                      <img src={att.dataUrl} alt={att.fileName} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                    )}
                    <span className="truncate max-w-[100px]" style={{ color: 'var(--text-primary)' }}>{att.fileName}</span>
                    <button
                      onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                      className="p-0.5 rounded hover:opacity-70"
                    >
                      <X size={10} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= 5}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-30 hover:opacity-80 transition-opacity"
              style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
            >
              <Plus size={11} /> Add Files
            </button>
            <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Files are saved to the agent's workspace so it can access them
            </p>
          </div>

          {/* Cost Estimate */}
          {(taskEstimate || estimatingTask) && (
            <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Coins size={11} style={{ color: 'var(--accent-teal)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Estimated Cost</span>
              </div>
              {estimatingTask ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 size={10} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Estimating...</span>
                </div>
              ) : taskEstimate && (
                <>
                  <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{taskEstimate.costExplanation}</p>
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>Input: <strong>{taskEstimate.estimatedInputTokens}</strong></span>
                    <span>Output: <strong>{taskEstimate.estimatedOutputTokens}</strong></span>
                    <span>Est: <strong>{taskEstimate.estimatedInternalTokens} tokens</strong></span>
                    {scheduleKind === 'every' && (
                      <span style={{ color: 'var(--accent-yellow, #d29a22)' }}>
                        ~{Math.round(taskEstimate.estimatedInternalTokens * (86400000 / everyMs))}/day
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="text-[11px]" style={{ color: '#f85149' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 flex items-center justify-end gap-2 shrink-0" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || (!message.trim() && attachments.length === 0)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-40 transition-all hover:opacity-80"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Create Task
          </button>
        </div>
      </div>
    </div>
  )
}

interface TasksPanelProps {
  gatewayUrl: string
  gatewayToken: string
  wsRequest: (method: string, params: any) => Promise<any>
  onClearChat?: () => void
  stateDir?: string // e.g. '~/.overclaw/local' — if set, prefixes openclaw commands with OPENCLAW_STATE_DIR
  port?: number
  hideSkills?: boolean
  apiKey?: string
}

export default function TasksPanel({ gatewayUrl, gatewayToken, wsRequest, onClearChat, stateDir, port = 18789, hideSkills, apiKey }: TasksPanelProps) {
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState<string>('auto')
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string; provider: string }[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [cronLoading, setCronLoading] = useState(false)
  const [taskTab, setTaskTab] = useState<'scheduled' | 'active' | 'completed'>('scheduled')
  const [completedRuns, setCompletedRuns] = useState<{ id: string; jobId: string; jobName?: string; startedAt?: string; finishedAt?: string; status?: string; summary?: string }[]>([])
  const [viewingResponse, setViewingResponse] = useState<{ jobName?: string; summary?: string; status?: string; finishedAt?: string } | null>(null)

  const getDir = useCallback(async () => {
    if (stateDir) return stateDir
    const h = await getHome()
    return `${h}/.openclaw`
  }, [stateDir])

  const envPrefix = useCallback(async () => {
    if (!stateDir) return ''
    return `OPENCLAW_STATE_DIR="${stateDir}"`
  }, [stateDir])

  // Load current model + available models
  useEffect(() => {
    (async () => {
      try {
        const ea = window.electronAPI!
        const h = await getHome()
        const dir = stateDir || `${h}/.openclaw`
        const raw = await ea.readFile(`${dir}/openclaw.json`)
        const config = JSON.parse(raw)
        const primary = config?.agents?.defaults?.model?.primary || ''
        setCurrentModel(primary === 'overclaw/auto' || !primary ? 'auto' : primary)

        if (stateDir && stateDir.includes('/cloud')) {
          try {
            const envRaw = await ea.readFile(`${dir}/.env`)
            const models: typeof availableModels = []
            for (const [envKey, provider] of Object.entries(CLOUD_MODELS)) {
              if (envRaw.includes(`${envKey}=`)) {
                for (const m of provider.models) {
                  models.push({ id: m.id, name: m.name, provider: provider.provider })
                }
              }
            }
            setAvailableModels(models)
          } catch { setAvailableModels([]) }
        } else {
          try {
            const tiersRaw = await ea.readFile(`${dir}/model-tiers.json`)
            const tiersList = JSON.parse(tiersRaw) as { id: string; role: string }[]
            setAvailableModels(tiersList.map(t => ({
              id: `ollama/${t.id}`,
              name: t.id,
              provider: TIER_META[t.role]?.label || t.role,
            })))
          } catch { setAvailableModels([]) }
        }
      } catch {}
    })()
  }, [stateDir])

  const writeConfigSafe = useCallback(async (dir: string, configJson: string) => {
    const ea = window.electronAPI!
    const platform = ea.platform
    if (platform !== 'win32') {
      if ((window.electronAPI?.platform || "darwin") !== "win32") try { await sh(`chmod 644 "${dir}/openclaw.json" 2>/dev/null || true`) } catch {}
    }
    await ea.writeFileSafe(`${dir}/openclaw.json`, configJson)
    if (platform !== 'win32') {
      if ((window.electronAPI?.platform || "darwin") !== "win32") try { await sh(`chmod 444 "${dir}/openclaw.json" 2>/dev/null || true`) } catch {}
    }
  }, [])

  const handleModelChange = useCallback(async (modelId: string) => {
    setCurrentModel(modelId)
    setModelDropdownOpen(false)
    try {
      const ea = window.electronAPI!
      const dir = await getDir()
      const raw = await ea.readFile(`${dir}/openclaw.json`)
      const config = JSON.parse(raw)
      if (!config.agents) config.agents = {}
      if (!config.agents.defaults) config.agents.defaults = {}
      if (!config.agents.defaults.model) config.agents.defaults.model = {}
      config.agents.defaults.model.primary = modelId === 'auto' ? 'overclaw/auto' : modelId
      const json = JSON.stringify(config, null, 2)
      await writeConfigSafe(dir, json)
      try { await wsRequest('session_status', { model: modelId === 'auto' ? 'overclaw/auto' : modelId }) } catch {}
      // Restart gateway
      try { await ea.killPort(port) } catch {}
      const ocBin = await oc()
      const envVars: Record<string, string> = stateDir ? { OPENCLAW_STATE_DIR: stateDir } : {}
      await ea.startGatewayDetached(ocBin, ['gateway', 'run', '--port', String(port)], envVars, `${dir}/gateway.log`)
      showStatus_(modelId === 'auto' ? 'Model: Automatic' : `Model: ${modelId.split('/').pop()}`)
    } catch (e: any) {
      showStatus_(`Error: ${e.message}`)
    }
  }, [getDir, stateDir, port, wsRequest, writeConfigSafe])

  const showStatus_ = useCallback((msg: string) => {
    setActionStatus(msg)
    setTimeout(() => setActionStatus(null), 4000)
  }, [])
  const showStatus = showStatus_

  const handleSystemStatus = useCallback(async () => {
    try {
      const ocBin = await oc()
      const env = await envPrefix()
      const result = await sh(`${env} ${ocBin} status 2>&1`)
      showStatus(result.trim().split('\n').slice(0, 3).join(' · '))
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [showStatus, envPrefix])

  const restartGw = useCallback(async () => {
    const ea = window.electronAPI!
    const dir = await getDir()
    const ocBin = await oc()
    try { await ea.killPort(port) } catch {}
    const envVars: Record<string, string> = stateDir ? { OPENCLAW_STATE_DIR: stateDir } : {}
    await ea.startGatewayDetached(ocBin, ['gateway', 'run', '--port', String(port)], envVars, `${dir}/gateway.log`)
  }, [getDir, stateDir, port])

  const handleModelSelect = useCallback(async (modelId: string) => {
    setModelPickerOpen(false)
    try {
      const ea = window.electronAPI!
      const dir = await getDir()
      const raw = await ea.readFile(`${dir}/openclaw.json`)
      const config = JSON.parse(raw)
      if (!config.agents) config.agents = {}
      if (!config.agents.defaults) config.agents.defaults = {}
      if (!config.agents.defaults.model) config.agents.defaults.model = {}
      config.agents.defaults.model.primary = modelId
      const configJson = JSON.stringify(config, null, 2)
      await writeConfigSafe(dir, configJson)
      try { await wsRequest('session_status', { model: modelId }) } catch {}
      await restartGw()
      showStatus(`Model: ${modelId.split('/').pop()}`)
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [showStatus, getDir, restartGw, wsRequest, writeConfigSafe])

  const handleClearSessions = useCallback(async () => {
    if (!confirm('Clear all chat sessions? This cannot be undone.')) return
    try {
      const dir = await getDir()
      // rm -rf still works via sh() on both platforms (shell: true uses cmd on Windows)
      await sh(`rm -rf "${dir}/agents/main/sessions"`)
      await restartGw()
      onClearChat?.()
      showStatus('Sessions cleared — gateway restarting')
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [showStatus, getDir, restartGw])

  const handleRestartGateway = useCallback(async () => {
    try {
      showStatus('Restarting gateway...')
      await restartGw()
      showStatus('Gateway restarted')
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [showStatus, restartGw])

  const handleOpenControlUI = useCallback(async () => {
    try {
      const ea = window.electronAPI!
      const dir = await getDir()
      const raw = await ea.readFile(`${dir}/openclaw.json`)
      const config = JSON.parse(raw)
      const port = config?.gateway?.port || 18789
      const token = config?.gateway?.auth?.token || ''
      const url = `http://localhost:${port}/?token=${token}`
      // Use shell to open URL (cross-platform via Electron)
      const platform = ea.platform
      if (platform === 'win32') {
        await sh(`start "" "${url}"`)
      } else {
        await sh(`open "${url}"`)
      }
      showStatus('Opened Control UI')
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [showStatus, getDir])

  const handleViewLogs = useCallback(async () => {
    try {
      const dir = await getDir()
      const logs = await sh(`tail -30 "${dir}/gateway.log" 2>/dev/null || echo "No logs found"`)
      const trimmed = logs.trim().split('\n').slice(-15).join('\n')
      alert(trimmed)
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [showStatus, getDir])

  // --- Cron Jobs ---
  const loadCronJobs = useCallback(async () => {
    setCronLoading(true)
    try {
      const result = await wsRequest('cron.list', { includeDisabled: true })
      const jobs: CronJob[] = (result?.jobs || result || []).map((j: any) => ({
        jobId: j.jobId || j.id,
        name: j.name,
        schedule: j.schedule,
        payload: j.payload,
        sessionTarget: j.sessionTarget,
        enabled: j.enabled !== false,
        nextRunAtMs: j.state?.nextRunAtMs,
        runningAtMs: j.state?.runningAtMs,
        lastRunAtMs: j.state?.lastRunAtMs,
        lastStatus: j.state?.lastStatus,
        lastDurationMs: j.state?.lastDurationMs,
      }))
      setCronJobs(jobs)
    } catch (e: any) {
      if (e?.message !== 'Not connected') console.warn('[TasksPanel] cron.list failed:', e)
    }
    setCronLoading(false)
  }, [wsRequest])

  const loadCompletedRuns = useCallback(async (jobs: CronJob[]) => {
    const allRuns: typeof completedRuns = []
    for (const job of jobs.slice(0, 10)) {
      try {
        const result = await wsRequest('cron.runs', { jobId: job.jobId, limit: 5 })
        const entries = result?.entries || []
        for (const entry of entries) {
          console.log('[TasksPanel] cron.runs entry:', JSON.stringify(entry))
          allRuns.push({
            id: `${job.jobId}-${entry.startedAt || entry.runAtMs || Math.random()}`,
            jobId: job.jobId,
            jobName: job.name || (job.payload?.message || job.payload?.text || '').slice(0, 50),
            startedAt: entry.startedAt || (entry.runAtMs ? new Date(entry.runAtMs).toISOString() : undefined),
            finishedAt: entry.finishedAt || (entry.endedAtMs ? new Date(entry.endedAtMs).toISOString() : undefined),
            status: entry.status === 'error' ? 'error' : entry.status === 'skipped' ? 'skipped' : 'ok',
            summary: entry.summary || entry.error || undefined,
          })
        }
      } catch {}
    }
    allRuns.sort((a, b) => new Date(b.finishedAt || b.startedAt || 0).getTime() - new Date(a.finishedAt || a.startedAt || 0).getTime())
    setCompletedRuns(allRuns.slice(0, 20))
  }, [wsRequest])

  // Derived: active jobs are those with runningAtMs set
  const activeJobs = cronJobs.filter(j => j.runningAtMs)
  const scheduledJobs = cronJobs.filter(j => !j.runningAtMs)

  // Load cron jobs on mount and when modal closes; poll every 3s to catch active state + deletions
  useEffect(() => { loadCronJobs() }, [loadCronJobs])
  useEffect(() => { const iv = setInterval(loadCronJobs, 3000); return () => clearInterval(iv) }, [loadCronJobs])
  useEffect(() => { if (cronJobs.length > 0) loadCompletedRuns(cronJobs) }, [cronJobs, loadCompletedRuns])
  // Also load completed runs for jobs we've seen before (in case one-time jobs were deleted from store)
  const seenJobsRef = useRef<CronJob[]>([])
  useEffect(() => {
    if (cronJobs.length > 0) seenJobsRef.current = [...new Map([...seenJobsRef.current, ...cronJobs].map(j => [j.jobId, j])).values()]
  }, [cronJobs])
  useEffect(() => {
    if (seenJobsRef.current.length > cronJobs.length) loadCompletedRuns(seenJobsRef.current)
  }, [cronJobs.length])

  const handleDeleteCronJob = useCallback(async (jobId: string) => {
    if (!confirm('Delete this scheduled task?')) return
    try {
      await wsRequest('cron.remove', { jobId })
      setCronJobs(prev => prev.filter(j => j.jobId !== jobId))
      showStatus('Task deleted')
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [wsRequest, showStatus])

  const handleToggleCronJob = useCallback(async (jobId: string, enabled: boolean) => {
    try {
      await wsRequest('cron.update', { jobId, patch: { enabled } })
      setCronJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, enabled } : j))
      showStatus(enabled ? 'Task enabled' : 'Task paused')
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [wsRequest, showStatus])

  const handleRunCronJob = useCallback(async (jobId: string) => {
    try {
      await wsRequest('cron.run', { jobId })
      showStatus('Task triggered')
    } catch (e: any) {
      showStatus(`Error: ${e.message}`)
    }
  }, [wsRequest, showStatus])

  const quickActions = [
    { id: 'status', label: 'System Status', icon: <RefreshCw size={14} />, description: 'Check gateway health', action: handleSystemStatus },
    { id: 'clear', label: 'Clear Sessions', icon: <Trash2 size={14} />, description: 'Reset chat history', action: handleClearSessions },
    { id: 'restart', label: 'Restart Gateway', icon: <RefreshCw size={14} />, description: 'Restart the agent', action: handleRestartGateway },
    { id: 'browse', label: 'Open Localhost', icon: <Globe size={14} />, description: 'Control UI in browser', action: handleOpenControlUI },
    { id: 'logs', label: 'View Logs', icon: <Terminal size={14} />, description: 'Tail gateway logs', action: handleViewLogs },
  ]

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Model Picker Modal */}
      <ModelPickerModal
        open={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        wsRequest={wsRequest}
        onSelect={handleModelSelect}
        stateDir={stateDir}
      />

      {/* New Task Modal */}
      <NewTaskModal
        open={newTaskOpen}
        onClose={() => { setNewTaskOpen(false); loadCronJobs() }}
        wsRequest={wsRequest}
        stateDir={stateDir}
        apiKey={apiKey}
      />

      {/* Response Viewer Modal */}
      {viewingResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setViewingResponse(null)}>
          <div className="w-[520px] max-h-[70vh] rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <Eye size={14} style={{ color: 'var(--accent-blue)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {viewingResponse.jobName || 'Task Response'}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{
                  background: viewingResponse.status === 'error' ? 'rgba(248,81,73,0.1)' : 'rgba(34,197,94,0.1)',
                  color: viewingResponse.status === 'error' ? '#f85149' : 'var(--accent-green, #22c55e)',
                }}>
                  {viewingResponse.status === 'error' ? 'Error' : viewingResponse.status === 'skipped' ? 'Skipped' : 'Complete'}
                </span>
              </div>
              <button onClick={() => setViewingResponse(null)} className="p-1 rounded hover:opacity-70">
                <X size={14} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                {viewingResponse.summary || 'No response content available.'}
              </pre>
            </div>
            {viewingResponse.finishedAt && (
              <div className="px-4 py-2 shrink-0" style={{ borderTop: '1px solid var(--border-color)' }}>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Finished {new Date(viewingResponse.finishedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Model Selector */}
      <div className="shrink-0 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', position: 'relative' }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu size={14} style={{ color: 'var(--accent-teal)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Model</span>
            </div>
          </div>
          <button
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all hover:opacity-80"
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {currentModel === 'auto' ? (
                <>
                  <Zap size={12} style={{ color: 'var(--accent-teal)' }} />
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>Automatic</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-bg-strong)', color: 'var(--accent-teal)' }}>Smart Routing</span>
                </>
              ) : (
                <>
                  <Cpu size={12} style={{ color: 'var(--accent-blue)' }} />
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{currentModel.split('/').pop()}</span>
                </>
              )}
            </div>
            <ChevronRight size={12} style={{ color: 'var(--text-muted)', transform: modelDropdownOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {modelDropdownOpen && (
            <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-page)', maxHeight: '240px', overflowY: 'auto' }}>
              {/* Automatic option */}
              <button
                onClick={() => handleModelChange('auto')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all hover:opacity-80"
                style={{ background: currentModel === 'auto' ? 'var(--accent-bg-strong)' : 'transparent', borderBottom: '1px solid var(--border-color)' }}
              >
                <Zap size={12} style={{ color: currentModel === 'auto' ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium" style={{ color: currentModel === 'auto' ? 'var(--accent-teal)' : 'var(--text-primary)' }}>Automatic</span>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Routes to best model per task</p>
                </div>
                {currentModel === 'auto' && <Check size={12} style={{ color: 'var(--accent-teal)' }} />}
              </button>

              {/* Available models */}
              {availableModels.map(m => {
                const isActive = currentModel === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModelChange(m.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all hover:opacity-80"
                    style={{ background: isActive ? 'var(--accent-bg-strong)' : 'transparent' }}
                  >
                    <Cpu size={11} style={{ color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-medium" style={{ color: isActive ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{m.name}</span>
                    </div>
                    <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>{m.provider}</span>
                    {isActive && <Check size={11} style={{ color: 'var(--accent-blue)' }} />}
                  </button>
                )
              })}

              {availableModels.length === 0 && (
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No models available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tasks Section */}
      <div className="flex-1 min-h-0 rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: 'var(--accent-teal)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Tasks</span>
            </div>
            <button
              onClick={() => setNewTaskOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all hover:opacity-80"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}
            >
              <Plus size={11} /> New Task
            </button>
          </div>
          <div className="flex gap-1">
            {([
              { key: 'scheduled' as const, label: 'Scheduled', icon: <Clock size={13} />, count: scheduledJobs.length },
              { key: 'active' as const, label: 'Active', icon: <Play size={13} />, count: activeJobs.length },
              { key: 'completed' as const, label: 'Completed', icon: <CheckCircle2 size={13} />, count: completedRuns.length },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setTaskTab(tab.key)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: taskTab === tab.key ? 'var(--accent-bg-strong)' : 'transparent',
                  color: taskTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {tab.icon}
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]" style={{
                    background: taskTab === tab.key ? 'var(--accent-blue)' : 'var(--border-color)',
                    color: taskTab === tab.key ? '#fff' : 'var(--text-muted)',
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {cronLoading ? (
            <div className="text-center py-8">
              <Loader2 size={16} className="animate-spin mx-auto" style={{ color: 'var(--accent-teal)' }} />
            </div>
          ) : taskTab === 'scheduled' ? (
            scheduledJobs.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'var(--accent-bg-strong)' }}>
                  <Clock size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No scheduled tasks</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  Create recurring tasks to automate your agent
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {scheduledJobs.map(job => (
                  <div key={job.jobId} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', opacity: job.enabled ? 1 : 0.5 }}>
                    <div className="mt-0.5">
                      {job.schedule?.kind === 'at' ? <Calendar size={13} style={{ color: 'var(--accent-yellow, #d29a22)' }} /> :
                       job.schedule?.kind === 'cron' ? <Timer size={13} style={{ color: 'var(--accent-blue)' }} /> :
                       <Repeat size={13} style={{ color: 'var(--accent-teal)' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {job.name || (job.payload?.message || job.payload?.text || 'Unnamed task').slice(0, 50)}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {formatSchedule(job.schedule)} · {job.sessionTarget === 'main' ? 'Main' : 'Background'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => handleRunCronJob(job.jobId)} className="p-1 rounded hover:opacity-70" title="Run now">
                        <Play size={11} style={{ color: 'var(--accent-teal)' }} />
                      </button>
                      <button onClick={() => handleToggleCronJob(job.jobId, !job.enabled)} className="p-1 rounded hover:opacity-70" title={job.enabled ? 'Pause' : 'Enable'}>
                        {job.enabled ? <Pause size={11} style={{ color: 'var(--accent-yellow, #d29a22)' }} /> : <Play size={11} style={{ color: 'var(--accent-green)' }} />}
                      </button>
                      <button onClick={() => handleDeleteCronJob(job.jobId)} className="p-1 rounded hover:opacity-70" title="Delete">
                        <Trash2 size={11} style={{ color: '#f85149' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : taskTab === 'active' ? (
            activeJobs.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'var(--accent-bg-strong)' }}>
                  <Play size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No active tasks</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  Running tasks will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeJobs.map(job => (
                  <div key={job.jobId} className="flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--accent-blue)' }}>
                    <div className="mt-0.5">
                      <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {job.name || (job.payload?.message || job.payload?.text || 'Unnamed task').slice(0, 50)}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {job.runningAtMs ? `Started ${new Date(job.runningAtMs).toLocaleTimeString()}` : 'Running...'} · {job.sessionTarget === 'main' ? 'Main' : 'Background'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Completed tab */
            completedRuns.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'var(--accent-bg-strong)' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No completed tasks</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  Finished task runs will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedRuns.length > 1 && (
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={() => setCompletedRuns([])}
                      className="text-[10px] font-medium px-2 py-1 rounded hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Clear all
                    </button>
                  </div>
                )}
                {completedRuns.map(run => (
                  <div key={run.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                    <div className="mt-0.5">
                      {run.status === 'error' ? (
                        <X size={13} style={{ color: '#f85149' }} />
                      ) : (
                        <CheckCircle2 size={13} style={{ color: 'var(--accent-green, #22c55e)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {run.jobName || run.jobId}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: run.status === 'error' ? '#f85149' : 'var(--accent-green, #22c55e)' }}>
                        {run.status === 'error' ? 'Error' : run.status === 'skipped' ? 'Skipped' : 'Complete'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {run.finishedAt ? new Date(run.finishedAt).toLocaleTimeString() : run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : ''}
                      </span>
                      {run.summary && (
                        <button
                          onClick={() => setViewingResponse(run)}
                          className="p-1 rounded hover:opacity-70 transition-opacity"
                          title="View response"
                        >
                          <Eye size={11} style={{ color: 'var(--accent-blue)' }} />
                        </button>
                      )}
                      <button
                        onClick={() => setCompletedRuns(prev => prev.filter(r => r.id !== run.id))}
                        className="p-0.5 rounded hover:opacity-70 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Dismiss"
                      >
                        <X size={11} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Skills Section */}
      {!hideSkills && <SkillsSection stateDir={stateDir} />}

      {/* Quick Actions Section */}
      <div className="shrink-0 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} style={{ color: 'var(--accent-yellow, #d29a22)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Quick Actions</span>
            </div>
            {actionStatus && (
              <span className="text-[10px] px-2 py-0.5 rounded-full truncate max-w-[200px]" style={{ background: 'var(--accent-bg-strong)', color: 'var(--text-muted)' }}>
                {actionStatus}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {quickActions.map(qa => (
            <button
              key={qa.id}
              onClick={qa.action}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all hover:opacity-80 active:scale-[0.98]"
              style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}
            >
              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg-strong)' }}>
                <span style={{ color: 'var(--accent-teal)' }}>{qa.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{qa.label}</p>
                <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{qa.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
