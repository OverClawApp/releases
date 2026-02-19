import { useState, useEffect, useCallback } from 'react'
import { fetchTasks as apiFetchTasks } from '../lib/localApi'
import { ExternalLink, MoreHorizontal, Clock, CheckCircle2, Loader2, BarChart3 } from 'lucide-react'
import BotActionsModal from '../components/BotActionsModal'
import ChatBox from '../components/ChatBox'
import { getBots, getUsageStats } from '../lib/db'

interface BotData {
  id: string; name: string; description: string; model: string;
  status: string; node_id: string | null; node?: { id: string; name: string; status: string } | null;
  budget_limit: number | null; budget_used: number; config: any; created_at: string;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  running: { bg: 'rgba(63,185,80,0.15)', text: 'var(--accent-green)' },
  deploying: { bg: 'rgba(210,153,34,0.15)', text: 'var(--accent-yellow)' },
  error: { bg: 'rgba(248,81,73,0.15)', text: 'var(--accent-red)' },
  stopped: { bg: 'rgba(139,148,158,0.15)', text: 'var(--text-muted)' },
}

const statusLabel: Record<string, string> = {
  running: 'Online', deploying: 'Deploying', error: 'Error', stopped: 'Stopped',
}

export default function BotsPage({ onCreateBot }: { onCreateBot: () => void }) {
  const [actionBot, setActionBot] = useState<BotData | null>(null)
  const [bots, setBots] = useState<BotData[]>([])
  const [usageStats, setUsageStats] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const data = await apiFetchTasks()
      if (data.ok) setTasks(data.tasks)
    } catch {}
    finally { setTasksLoading(false) }
  }, [])

  const fetchUsage = useCallback(async () => {
    try {
      const stats = await getUsageStats('month')
      setUsageStats(stats)
    } catch {}
  }, [])

  const fetchBots = useCallback(async () => {
    try {
      const data = await getBots()
      setBots(data)
    } catch {}
  }, [])

  useEffect(() => { fetchBots(); const i = setInterval(fetchBots, 10000); return () => clearInterval(i) }, [fetchBots])
  useEffect(() => { fetchTasks(); const i = setInterval(fetchTasks, 10000); return () => clearInterval(i) }, [fetchTasks])
  useEffect(() => { fetchUsage(); const i = setInterval(fetchUsage, 30000); return () => clearInterval(i) }, [fetchUsage])

  return (
    <div className="space-y-5">
      {/* ── Bots Section ── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Cloud Bots</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {bots.length} bot{bots.length !== 1 ? 's' : ''} • {bots.filter(b => b.status === 'running').length} online
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCreateBot} className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors" style={{ background: 'var(--accent-blue)' }}>
            Create Cloud Bot
          </button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              {['Name', 'Status', 'Model', 'Budget', 'Node', 'Node Type', ''].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bots.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No bots yet. Create one to get started.</td></tr>
            ) : bots.map((b, i) => {
              const sc = statusColors[b.status] || statusColors.stopped
              const nodeType = b.node ? 'personal' : null // infer from node data
              return (
                <tr key={b.id} style={{ borderBottom: i < bots.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <td className="px-5 py-4">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{b.description}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: sc.bg, color: sc.text }}>
                      {statusLabel[b.status] || b.status}
                    </span>
                  </td>
                  <td className="px-5 py-4" style={{ color: 'var(--text-secondary)' }}>{b.model || '—'}</td>
                  <td className="px-5 py-4" style={{ color: 'var(--text-secondary)' }}>
                    {b.budget_limit !== null ? `$${b.budget_used.toFixed(2)} / $${b.budget_limit.toFixed(2)}` : '∞'}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{b.node?.name || '—'}</span>
                  </td>
                  <td className="px-5 py-4">
                    {b.node ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
                        background: 'var(--accent-bg)',
                        color: 'var(--accent-red)',
                      }}>Personal</span>
                    ) : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <button onClick={() => setActionBot(b)} style={{ color: 'var(--text-muted)' }} className="hover:opacity-80"><MoreHorizontal size={18} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Tasks Section ── */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Tasks</h3>
          {tasksLoading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {tasks.length > 0 ? `${tasks.length} task${tasks.length !== 1 ? 's' : ''} from OpenClaw cron jobs` : 'No tasks yet — cron jobs will appear here'}
        </p>

        {(() => {
          const queuedTasks = tasks.filter(t => t.status === 'queued')
          const activeTasks = tasks.filter(t => t.status === 'active')
          const completeTasks = tasks.filter(t => t.status === 'complete')
          return (
            <>
              {/* Queued */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(210,153,34,0.15)', color: 'var(--accent-yellow)' }}>1</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Queued</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{queuedTasks.length > 0 ? `${queuedTasks.length} scheduled` : 'No queued tasks'}</span>
                </div>
                {queuedTasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg mb-1" style={{ background: 'var(--bg-page)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <Clock size={11} />
                      {t.schedule?.kind === 'at' ? new Date(t.schedule.at).toLocaleString() : t.schedule?.expr || t.schedule?.kind || 'Scheduled'}
                    </span>
                  </div>
                ))}
              </div>
              {/* Active */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'var(--accent-bg-strong)', color: 'var(--accent-blue)' }}>2</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Active</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{activeTasks.length > 0 ? `${activeTasks.length} running` : 'No active tasks'}</span>
                </div>
                {activeTasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg mb-1" style={{ background: 'var(--bg-page)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-bg-strong)', color: 'var(--accent-blue)' }}>Active</span>
                  </div>
                ))}
              </div>
              {/* Complete */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(63,185,80,0.15)', color: 'var(--accent-green)' }}>3</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Complete</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{completeTasks.length > 0 ? `${completeTasks.length} finished` : 'No completed tasks'}</span>
                </div>
                {completeTasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg mb-1" style={{ background: 'var(--bg-page)' }}>
                    <span className="text-sm line-through" style={{ color: 'var(--text-muted)' }}>{t.name}</span>
                    <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* ── Chat with Agent ── */}
      <ChatBox />

      {/* ── Usage & Billing ── */}
      <UsageCard stats={usageStats} />

      {/* Modals */}
      {actionBot && <BotActionsModal bot={actionBot} onClose={() => setActionBot(null)} onUpdated={fetchBots} />}
    </div>
  )
}

function UsageCard({ stats }: { stats: any }) {
  const totalTokens = stats ? (stats.totalInputTokens + stats.totalOutputTokens) : 0

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center gap-2">
        <BarChart3 size={14} style={{ color: 'var(--accent-blue)' }} />
        <h3 className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>Usage This Month</h3>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-page)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Total Tokens</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{totalTokens > 0 ? totalTokens.toLocaleString() : '—'}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-page)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Requests</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{stats?.totalRequests > 0 ? stats.totalRequests.toLocaleString() : '—'}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-page)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Total Cost</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{stats?.totalCost > 0 ? `$${stats.totalCost.toFixed(2)}` : '—'}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-page)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Most Used Model</div>
          <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{stats?.mostUsedModel || '—'}</div>
        </div>
      </div>
    </div>
  )
}
