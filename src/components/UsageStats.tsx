import { useState, useEffect } from 'react'
import { fetchUsage as apiFetchUsage } from '../lib/localApi'
import { BarChart3, Loader2 } from 'lucide-react'

interface UsageData {
  contextTokensUsed: number
  contextTokensMax: number
  sessions: number
  model: string
}

export default function UsageStats() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsage = async () => {
    try {
      const data = await apiFetchUsage()
      if (data.ok) {
        setUsage({ contextTokensUsed: data.totalTokens || 0, contextTokensMax: data.maxTokens || 0, sessions: data.sessions || 0, model: '' })
        setError(null)
      } else {
        setError('No usage data')
      }
    } catch {
      setError('Failed to fetch')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsage()
    const id = setInterval(fetchUsage, 15000)
    return () => clearInterval(id)
  }, [])

  const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString()
  const pct = usage ? Math.round((usage.contextTokensUsed / usage.contextTokensMax) * 100) : 0

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} style={{ color: 'var(--accent-blue)' }} />
        <h3 className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>Usage</h3>
        {loading && <Loader2 size={12} className="animate-spin ml-auto" style={{ color: 'var(--text-muted)' }} />}
      </div>

      {error && !usage ? (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Unable to load usage stats</p>
      ) : usage ? (
        <div className="space-y-3">
          {/* Context bar */}
          <div>
            <div className="flex justify-between text-[11px] mb-1.5">
              <span style={{ color: 'var(--text-secondary)' }}>Context usage</span>
              <span style={{ color: 'var(--text-primary)' }}>{fmt(usage.contextTokensUsed)} / {fmt(usage.contextTokensMax)} tokens</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-page)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: pct > 90 ? 'var(--accent-red)' : pct > 70 ? 'var(--accent-yellow)' : 'var(--accent-blue)',
                }}
              />
            </div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{pct}% used across {usage.sessions} session{usage.sessions !== 1 ? 's' : ''}</div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Sessions" value={usage.sessions.toString()} />
            <StatCard label="Tokens used" value={fmt(usage.contextTokensUsed)} />
            <StatCard label="Model" value={usage.model || '—'} small />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Sessions" value="—" />
          <StatCard label="Tokens used" value="—" />
          <StatCard label="Model" value="—" />
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-page)' }}>
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`font-semibold truncate ${small ? 'text-[11px]' : 'text-sm'}`} style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
