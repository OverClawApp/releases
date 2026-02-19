import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, AlertCircle, Loader2, Zap, ExternalLink, Calendar, ChevronRight, Cpu, Globe, HardDrive, Clock, Activity } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getProfile } from '../lib/db'
import { gatewayRefs } from '../App'
import { supabase } from '../lib/supabase'

const PROXY_BASE_URL = import.meta.env.VITE_API_URL || 'https://overclaw-api-production.up.railway.app'

const LOCAL_PORT = 18789
const CLOUD_PORT = 18790

interface CronJob {
  jobId: string
  name?: string
  schedule: any
  payload: any
  sessionTarget?: string
  enabled: boolean
  nextRunAtMs?: number
  runningAtMs?: number
  lastRunAtMs?: number
  lastStatus?: string
  source: 'local' | 'cloud'
}

interface CompletedRun {
  id: string
  jobId: string
  jobName: string
  startedAt?: string
  finishedAt?: string
  status: string
  source: 'local' | 'cloud'
}

function formatSchedule(schedule: any): string {
  if (!schedule) return ''
  if (schedule.kind === 'at') {
    const d = new Date(schedule.at)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  if (schedule.kind === 'every') {
    const ms = schedule.everyMs
    if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)}d`
    if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`
    if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`
    return `Every ${Math.round(ms / 1000)}s`
  }
  if (schedule.kind === 'cron') return schedule.expr
  return ''
}

function formatTime(ts?: string | number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Map accent hex to gradient end color
const gradientMap: Record<string, string> = {
  '#ef4444': '#f59e0b', '#EF4444': '#F59E0B',
  '#3b82f6': '#8b5cf6', '#3B82F6': '#8B5CF6',
  '#8b5cf6': '#ec4899', '#8B5CF6': '#EC4899',
  '#22c55e': '#06b6d4', '#22C55E': '#06B6D4',
  '#f59e0b': '#ef4444', '#F59E0B': '#EF4444',
  '#ec4899': '#8b5cf6', '#EC4899': '#8B5CF6',
  '#06b6d4': '#3b82f6', '#06B6D4': '#3B82F6',
  '#f97316': '#ec4899', '#F97316': '#EC4899',
}

function getGradientEnd(): string {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-blue').trim()
  return gradientMap[accent] || gradientMap[accent.toLowerCase()] || '#8b5cf6'
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [gradientEnd, setGradientEnd] = useState('#8b5cf6')

  const [scheduledJobs, setScheduledJobs] = useState<CronJob[]>([])
  const [activeJobs, setActiveJobs] = useState<CronJob[]>([])
  const [completedRuns, setCompletedRuns] = useState<CompletedRun[]>([])
  const [tokenUsage, setTokenUsage] = useState({ tokensUsed: 0, tokensRemaining: 0, totalRequests: 0, inputTokens: 0, outputTokens: 0 })
  const [taskTab, setTaskTab] = useState<'scheduled' | 'active' | 'completed'>('scheduled')
  const [usageMode, setUsageMode] = useState<'cloud' | 'local'>('cloud')
  const [localConnected, setLocalConnected] = useState(false)
  const [cloudConnected, setCloudConnected] = useState(false)
  const [localStats, setLocalStats] = useState({ cpuUsage: 0, memUsed: 0, memTotal: 0, uptime: 0, localRequests: 0 })

  useEffect(() => {
    if (user) getProfile().then(p => setDisplayName(p?.display_name || user.email?.split('@')[0] || '')).catch(() => {})
  }, [user])

  // Update gradient when accent changes
  useEffect(() => {
    setGradientEnd(getGradientEnd())
    const observer = new MutationObserver(() => setGradientEnd(getGradientEnd()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])

  const loadData = useCallback(async () => {
    const allJobs: CronJob[] = []
    const allRuns: CompletedRun[] = []
    let usage = { tokensUsed: 0, tokensRemaining: 0, totalRequests: 0, inputTokens: 0, outputTokens: 0 }

    for (const { wsRequest, source } of [
      { wsRequest: gatewayRefs.local, source: 'local' as const },
      { wsRequest: gatewayRefs.cloud, source: 'cloud' as const },
    ]) {
      if (!wsRequest) continue
      if (source === 'local') setLocalConnected(true)
      if (source === 'cloud') setCloudConnected(true)

      try {
        const result = await wsRequest('cron.list', { includeDisabled: true })
        const jobs = (result?.jobs || result || []).map((j: any) => ({
          jobId: j.jobId || j.id, name: j.name, schedule: j.schedule, payload: j.payload,
          sessionTarget: j.sessionTarget, enabled: j.enabled !== false,
          nextRunAtMs: j.state?.nextRunAtMs, runningAtMs: j.state?.runningAtMs,
          lastRunAtMs: j.state?.lastRunAtMs, lastStatus: j.state?.lastStatus, source,
        }))
        allJobs.push(...jobs)

        for (const job of jobs.slice(0, 10)) {
          try {
            const r = await wsRequest('cron.runs', { jobId: job.jobId, limit: 5 })
            for (const entry of (r?.entries || [])) {
              allRuns.push({
                id: `${job.jobId}-${entry.startedAt || entry.runAtMs || Math.random()}`,
                jobId: job.jobId,
                jobName: job.name || (job.payload?.message || job.payload?.text || '').slice(0, 50),
                startedAt: entry.startedAt || (entry.runAtMs ? new Date(entry.runAtMs).toISOString() : undefined),
                finishedAt: entry.finishedAt || (entry.endedAtMs ? new Date(entry.endedAtMs).toISOString() : undefined),
                status: entry.status === 'error' ? 'error' : entry.status === 'skipped' ? 'skipped' : 'ok',
                source,
              })
            }
          } catch {}
        }
      } catch {
        if (source === 'local') setLocalConnected(false)
        if (source === 'cloud') setCloudConnected(false)
      }

    }

    // Fetch token usage from proxy API
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const headers = { 'Authorization': `Bearer ${session.access_token}` }
        const [balanceRes, usageRes] = await Promise.all([
          fetch(`${PROXY_BASE_URL}/api/proxy/balance`, { headers }),
          fetch(`${PROXY_BASE_URL}/api/proxy/usage`, { headers }),
        ])
        if (balanceRes.ok) {
          const { balance } = await balanceRes.json()
          usage.tokensRemaining = balance || 0
        }
        if (usageRes.ok) {
          const { usage: logs } = await usageRes.json()
          if (Array.isArray(logs)) {
            usage.totalRequests = logs.length
            for (const log of logs) {
              usage.inputTokens += log.input_tokens || 0
              usage.outputTokens += log.output_tokens || 0
              usage.tokensUsed += log.tokens_charged || 0
            }
          }
        }
      }
    } catch {}

    // Fetch local system stats (cross-platform via Node.js os module)
    if (window.electronAPI?.getSystemStats) {
      try {
        const stats = await window.electronAPI.getSystemStats()

        // Count local requests from gateway status
        let localReqs = 0
        if (gatewayRefs.local) {
          try {
            const st = await gatewayRefs.local('status', {})
            localReqs = st?.usage?.requests || st?.session?.requests || 0
          } catch {}
        }

        setLocalStats({
          cpuUsage: stats.cpuUsage,
          memUsed: stats.memUsed,
          memTotal: stats.memTotal || 16,
          uptime: stats.uptimeSeconds,
          localRequests: localReqs,
        })
      } catch {}
    }

    setScheduledJobs(allJobs.filter(j => !j.runningAtMs))
    setActiveJobs(allJobs.filter(j => !!j.runningAtMs))
    setCompletedRuns(allRuns.sort((a, b) =>
      new Date(b.finishedAt || b.startedAt || 0).getTime() - new Date(a.finishedAt || a.startedAt || 0).getTime()
    ).slice(0, 20))
    setTokenUsage(usage)
  }, [])

  useEffect(() => {
    loadData()
    const iv = setInterval(loadData, 5000)
    return () => clearInterval(iv)
  }, [loadData])

  const now = new Date()
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  const currentTasks = taskTab === 'scheduled' ? scheduledJobs : taskTab === 'active' ? activeJobs : []

  const tabs = [
    { key: 'scheduled' as const, label: 'Upcoming' },
    { key: 'active' as const, label: `Active (${activeJobs.length})` },
    { key: 'completed' as const, label: 'Completed' },
  ]

  return (
    <div className="space-y-5 pb-6">
      {/* Hero banner */}
      <div className="rounded-2xl px-7 py-6" style={{
        background: `linear-gradient(135deg, var(--accent-blue) 0%, ${gradientEnd} 100%)`,
      }}>
        <div className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{dateStr}</div>
        <div className="text-2xl font-bold mt-1" style={{ color: '#fff' }}>{getGreeting()}{displayName ? `, ${displayName}` : ''}</div>
        <div className="flex items-center gap-6 mt-3">
          {localConnected && (
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <Cpu size={13} /> Local connected
            </span>
          )}
          {cloudConnected && (
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <Globe size={13} /> Cloud connected
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
            <CheckCircle size={13} /> {completedRuns.length} tasks completed
          </span>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="flex gap-5" style={{ minHeight: 360 }}>
        {/* Left: Tasks */}
        <div className="flex-1 min-w-0 rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="px-5 pt-5 pb-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>My Tasks</h3>
            </div>
            <div className="flex gap-0 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTaskTab(t.key)}
                  className="px-4 pb-2.5 text-sm font-medium transition-colors relative"
                  style={{
                    color: taskTab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderBottom: taskTab === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-5">
            {taskTab === 'completed' ? (
              completedRuns.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>No completed tasks yet.</div>
              ) : (
                <div>
                  {completedRuns.map((run, i) => (
                    <div
                      key={run.id}
                      className="flex items-center gap-3 py-3"
                      style={{ borderBottom: i < completedRuns.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                    >
                      {run.status === 'ok' ? (
                        <CheckCircle size={16} className="shrink-0" style={{ color: 'var(--accent-teal)' }} />
                      ) : (
                        <AlertCircle size={16} className="shrink-0" style={{ color: '#ef4444' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{run.jobName || 'Unnamed task'}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] px-2 py-0.5 rounded-full capitalize" style={{
                          background: run.source === 'cloud' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                          color: run.source === 'cloud' ? '#6366f1' : '#10b981',
                        }}>{run.source}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatTime(run.finishedAt || run.startedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : currentTasks.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                {taskTab === 'scheduled' ? 'No scheduled tasks. Create one from Cloud or Local.' : 'No tasks currently running.'}
              </div>
            ) : (
              <div>
                {currentTasks.map((job, i) => (
                  <div
                    key={job.jobId}
                    className="flex items-center gap-3 py-3"
                    style={{ borderBottom: i < currentTasks.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                  >
                    {taskTab === 'active' ? (
                      <Loader2 size={16} className="animate-spin shrink-0" style={{ color: 'var(--accent-blue)' }} />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{
                        borderColor: job.enabled ? 'var(--text-muted)' : 'var(--border-color)',
                      }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {job.name || (job.payload?.message || job.payload?.text || 'Unnamed task').slice(0, 60)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] px-2 py-0.5 rounded-full capitalize" style={{
                        background: job.source === 'cloud' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                        color: job.source === 'cloud' ? '#6366f1' : '#10b981',
                      }}>{job.source}</span>
                      {!job.enabled && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Paused</span>
                      )}
                      {job.nextRunAtMs && (
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          {formatTime(job.nextRunAtMs)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Usage */}
        <div className="w-[340px] shrink-0 rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Usage</h3>
            </div>
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
              {[
                { key: 'cloud' as const, label: 'Cloud', icon: Globe, color: '#6366f1' },
                { key: 'local' as const, label: 'Local', icon: Cpu, color: '#10b981' },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setUsageMode(m.key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
                  style={{
                    background: usageMode === m.key ? `${m.color}15` : 'transparent',
                    color: usageMode === m.key ? m.color : 'var(--text-muted)',
                    borderRight: m.key === 'cloud' ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <m.icon size={12} /> {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 flex-1">
            {usageMode === 'cloud' ? (
              <>
                <div className="text-center py-4">
                  <div className="text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {tokenUsage.tokensUsed.toLocaleString()}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Tokens Used · <span style={{ color: 'var(--accent-blue)' }}>{tokenUsage.tokensRemaining.toLocaleString()}</span> remaining
                  </div>
                </div>

                {(tokenUsage.tokensUsed + tokenUsage.tokensRemaining > 0) && (
                  <div className="mx-1 mb-3">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-main)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (tokenUsage.tokensUsed / (tokenUsage.tokensUsed + tokenUsage.tokensRemaining)) * 100)}%`,
                          background: tokenUsage.tokensRemaining < 100 ? '#ef4444' : 'var(--accent-blue)',
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-3 mt-2">
                  {[
                    { label: 'Requests', value: tokenUsage.totalRequests.toLocaleString(), icon: Zap, color: '#f59e0b' },
                    { label: 'Input Tokens', value: tokenUsage.inputTokens.toLocaleString(), icon: ChevronRight, color: '#3b82f6' },
                    { label: 'Output Tokens', value: tokenUsage.outputTokens.toLocaleString(), icon: ChevronRight, color: '#8b5cf6' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                          <Icon size={14} style={{ color }} />
                        </div>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* CPU usage display */}
                <div className="text-center py-4">
                  <div className="text-4xl font-bold" style={{ color: localStats.cpuUsage > 80 ? '#ef4444' : '#10b981' }}>
                    {localStats.cpuUsage.toFixed(1)}%
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>CPU Usage</div>
                </div>

                {/* CPU bar */}
                <div className="mx-1 mb-3">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-main)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, localStats.cpuUsage)}%`,
                        background: localStats.cpuUsage > 80 ? '#ef4444' : localStats.cpuUsage > 50 ? '#f59e0b' : '#10b981',
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3 mt-2">
                  {[
                    { label: 'Memory', value: `${localStats.memUsed} / ${localStats.memTotal} GB`, icon: HardDrive, color: '#3b82f6' },
                    { label: 'Uptime', value: formatUptime(localStats.uptime), icon: Clock, color: '#8b5cf6' },
                    { label: 'Requests', value: localStats.localRequests.toLocaleString(), icon: Activity, color: '#f59e0b' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                          <Icon size={14} style={{ color }} />
                        </div>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Memory bar */}
                <div className="mt-3 px-1">
                  <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span>Memory</span>
                    <span>{localStats.memTotal > 0 ? Math.round((localStats.memUsed / localStats.memTotal) * 100) : 0}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-main)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${localStats.memTotal > 0 ? Math.min(100, (localStats.memUsed / localStats.memTotal) * 100) : 0}%`,
                        background: '#3b82f6',
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Connection status */}
          <div className="px-5 pb-4 pt-2">
            {(() => {
              const connected = usageMode === 'cloud' ? cloudConnected : localConnected
              return (
                <div className="flex items-center justify-center gap-2 p-2.5 rounded-lg" style={{
                  background: connected ? 'rgba(16,185,129,0.08)' : 'rgba(248,81,73,0.08)',
                  border: `1px solid ${connected ? 'rgba(16,185,129,0.2)' : 'rgba(248,81,73,0.2)'}`,
                }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: connected ? '#10b981' : '#f85149' }} />
                  <span className="text-xs font-medium" style={{ color: connected ? '#10b981' : '#f85149' }}>
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

    </div>
  )
}
