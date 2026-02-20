import { useEffect, useMemo, useState } from 'react'
import { Bot, Play, Square, Trash2, Settings, Plus, X, Loader2 } from 'lucide-react'
import { AGENT_TEMPLATES, DEFAULT_TEMPLATE_ID, SUBAGENTS_STORAGE_KEY, type AgentTemplateId, type SubAgentRecord, getTemplateById } from '../lib/agentTemplates'

interface SubAgentsPanelProps {
  wsRequest: (method: string, params: any) => Promise<any>
  cloudStateDir: string
  onSubAgentsChange?: (subAgents: SubAgentRecord[]) => void
}

const isElectron = !!window.electronAPI?.isElectron

function slugify(v: string) {
  return v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'subagent'
}

export default function SubAgentsPanel({ wsRequest, cloudStateDir, onSubAgentsChange }: SubAgentsPanelProps) {
  const [subAgents, setSubAgents] = useState<SubAgentRecord[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [editing, setEditing] = useState<SubAgentRecord | null>(null)
  const [soulDraft, setSoulDraft] = useState('')
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<AgentTemplateId>(DEFAULT_TEMPLATE_ID)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUBAGENTS_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      setSubAgents(Array.isArray(parsed) ? parsed : [])
    } catch {
      setSubAgents([])
    }
  }, [])

  const persist = (list: SubAgentRecord[]) => {
    setSubAgents(list)
    localStorage.setItem(SUBAGENTS_STORAGE_KEY, JSON.stringify(list))
    onSubAgentsChange?.(list)
  }

  const newSoul = useMemo(() => {
    const t = getTemplateById(templateId)
    return `# SOUL.md\n\nYou are **${name || 'Sub-Agent'}**, a ${t.name} sub-agent in the OverClaw team.\n\n${t.soulContent.trim()}\n\n## Operating Mode\n- Focus on delegated tasks from the orchestrator.\n- Report concise progress and final outputs.\n- Ask for clarification only when blockers are material.\n`
  }, [name, templateId])

  const createSubAgent = async () => {
    if (!name.trim()) return
    const cleanName = slugify(name)
    const rand = Math.random().toString(36).slice(2, 8)
    const sessionKey = `subagent-${cleanName}-${rand}`
    const template = getTemplateById(templateId)
    const record: SubAgentRecord = {
      id: `${Date.now()}-${rand}`,
      name: cleanName,
      template: template.id,
      status: 'stopped',
      sessionKey,
    }

    if (isElectron && cloudStateDir) {
      const soulPath = `${cloudStateDir}/workspace/subagents/${cleanName}/SOUL.md`
      await window.electronAPI!.mkdirp(`${cloudStateDir}/workspace/subagents/${cleanName}`)
      await window.electronAPI!.writeFileSafe(soulPath, newSoul)
    }

    persist([...subAgents, record])
    setName('')
    setTemplateId(DEFAULT_TEMPLATE_ID)
    setShowAdd(false)
  }

  const startSubAgent = async (sa: SubAgentRecord) => {
    setBusyId(sa.id)
    try {
      await wsRequest('sessions_spawn', {
        sessionKey: sa.sessionKey,
        title: sa.name,
        message: `You are now active as ${sa.name}. Wait for delegated tasks from orchestrator.`,
      })
      persist(subAgents.map(item => item.id === sa.id ? { ...item, status: 'active' } : item))
    } catch {
      // Keep local status unchanged on failure
    } finally {
      setBusyId(null)
    }
  }

  const stopSubAgent = async (sa: SubAgentRecord) => {
    setBusyId(sa.id)
    try {
      await wsRequest('sessions_send', {
        sessionKey: sa.sessionKey,
        message: 'Pause and standby. Do not continue prior tasks until reactivated.',
      })
    } catch {}
    persist(subAgents.map(item => item.id === sa.id ? { ...item, status: 'stopped' } : item))
    setBusyId(null)
  }

  const removeSubAgent = (sa: SubAgentRecord) => {
    persist(subAgents.filter(item => item.id !== sa.id))
  }

  const openConfigure = async (sa: SubAgentRecord) => {
    setEditing(sa)
    setShowConfig(true)
    if (isElectron && cloudStateDir) {
      try {
        const soulPath = `${cloudStateDir}/workspace/subagents/${sa.name}/SOUL.md`
        const content = await window.electronAPI!.readFile(soulPath)
        setSoulDraft(content)
        return
      } catch {}
    }
    const template = getTemplateById(sa.template)
    setSoulDraft(`# SOUL.md\n\nYou are ${sa.name}.\n\n${template.soulContent.trim()}\n`)
  }

  const saveConfigure = async () => {
    if (!editing || !isElectron || !cloudStateDir) return setShowConfig(false)
    const soulPath = `${cloudStateDir}/workspace/subagents/${editing.name}/SOUL.md`
    await window.electronAPI!.writeFileSafe(soulPath, soulDraft)
    setShowConfig(false)
    setEditing(null)
  }

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <Bot size={16} style={{ color: '#EF4444' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sub-Agents</h3>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1" style={{ background: '#EF4444', color: '#fff' }}>
          <Plus size={12} /> Add Sub-Agent
        </button>
      </div>

      <div className="p-3 space-y-2 overflow-y-auto">
        {!subAgents.length && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No sub-agents yet. Add one to build your team.</p>}
        {subAgents.map(sa => {
          const template = getTemplateById(sa.template)
          const Icon = template.icon
          const busy = busyId === sa.id
          return (
            <div key={sa.id} className="rounded-lg p-3" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'var(--accent-bg-strong)' }}>
                    <Icon size={14} style={{ color: 'var(--accent-blue)' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sa.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{template.name}</p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: sa.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)', color: sa.status === 'active' ? '#10b981' : 'var(--text-muted)' }}>
                  {sa.status}
                </span>
              </div>

              <div className="flex gap-1 mt-3">
                {sa.status === 'active' ? (
                  <button disabled={busy} onClick={() => stopSubAgent(sa)} className="px-2 py-1 text-xs rounded-md flex items-center gap-1" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Stop
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => startSubAgent(sa)} className="px-2 py-1 text-xs rounded-md flex items-center gap-1" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Start
                  </button>
                )}
                <button onClick={() => openConfigure(sa)} className="px-2 py-1 text-xs rounded-md flex items-center gap-1" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                  <Settings size={12} /> Configure
                </button>
                <button onClick={() => removeSubAgent(sa)} className="px-2 py-1 text-xs rounded-md flex items-center gap-1" style={{ background: 'var(--bg-card)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}>
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAdd(false)}>
          <div className="w-[460px] rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Add Sub-Agent</h3>
              <button onClick={() => setShowAdd(false)}><X size={14} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full mb-3 px-3 py-2 rounded-md text-sm" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} placeholder="e.g. backend-dev" />
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Template</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value as AgentTemplateId)} className="w-full mb-3 px-3 py-2 rounded-md text-sm" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              {AGENT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{getTemplateById(templateId).description}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-md text-xs" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={createSubAgent} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: '#EF4444', color: '#fff' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowConfig(false)}>
          <div className="w-[680px] rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Configure {editing?.name}</h3>
              <button onClick={() => setShowConfig(false)}><X size={14} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <textarea value={soulDraft} onChange={e => setSoulDraft(e.target.value)} className="w-full h-[360px] p-3 rounded-md text-xs font-mono" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowConfig(false)} className="px-3 py-1.5 rounded-md text-xs" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={saveConfigure} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: '#EF4444', color: '#fff' }}>Save SOUL.md</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
