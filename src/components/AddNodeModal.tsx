import { useState, useEffect } from 'react'
import { X, Server, Cloud, Copy, Check, Lock, MapPin } from 'lucide-react'
import { createNode, getNodes, getSubscription } from '../lib/db'

interface Props { onClose: () => void; onAdded: () => void }

const PLAN_AWS_LIMITS: Record<string, number> = {
  local: 0,
  personal: 0,
  pro: 1,
  team: 3,
  scale: 100,
  enterprise: 999,
}

const AWS_REGIONS = [
  { id: 'eu-west-2', label: 'London', flag: '🇬🇧' },
  { id: 'us-east-1', label: 'N. Virginia', flag: '🇺🇸' },
  { id: 'us-west-2', label: 'Oregon', flag: '🇺🇸' },
  { id: 'eu-central-1', label: 'Frankfurt', flag: '🇩🇪' },
  { id: 'eu-west-1', label: 'Ireland', flag: '🇮🇪' },
  { id: 'ap-southeast-1', label: 'Singapore', flag: '🇸🇬' },
  { id: 'ap-northeast-1', label: 'Tokyo', flag: '🇯🇵' },
]

const INSTANCE_SIZES = [
  { id: 'small', label: 'Small', spec: '2 vCPU / 4GB RAM', desc: 'Light workloads' },
  { id: 'medium', label: 'Medium', spec: '4 vCPU / 8GB RAM', desc: 'General purpose' },
  { id: 'large', label: 'Large', spec: '8 vCPU / 16GB RAM', desc: 'Heavy workloads' },
]

export default function AddNodeModal({ onClose, onAdded }: Props) {
  const [tab, setTab] = useState<'personal' | 'aws'>('personal')
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [plan, setPlan] = useState('local')
  const [scaleNodes, setScaleNodes] = useState(3)
  const [awsNodeCount, setAwsNodeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [region, setRegion] = useState('eu-west-2')
  const [size, setSize] = useState('medium')
  const [nodeName, setNodeName] = useState('')

  const serverUrl = import.meta.env.VITE_API_URL || window.location.origin.replace(':5173', ':3001')
  const installCmd = `curl -sSL ${serverUrl}/install-agent.sh | bash -s -- --server ${serverUrl}`

  useEffect(() => {
    Promise.all([getSubscription(), getNodes()]).then(([sub, nodes]) => {
      if (sub) {
        setPlan(sub.plan)
        if (sub.scale_nodes) setScaleNodes(sub.scale_nodes)
      }
      setAwsNodeCount(nodes.filter((n: any) => n.type === 'aws').length)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const maxAwsNodes = plan === 'scale' ? scaleNodes : (PLAN_AWS_LIMITS[plan] || 0)
  const canAddAws = awsNodeCount < maxAwsNodes
  const remaining = maxAwsNodes - awsNodeCount

  const copyCmd = () => {
    navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const deployAws = async () => {
    if (!canAddAws) return
    setSubmitting(true)
    try {
      const selectedRegion = AWS_REGIONS.find(r => r.id === region)
      const selectedSize = INSTANCE_SIZES.find(s => s.id === size)
      await createNode({
        name: nodeName || `AWS ${selectedSize?.label || 'Node'} — ${selectedRegion?.label || region}`,
        type: 'aws',
        region,
      })
      onAdded()
      onClose()
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl p-6 space-y-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Add Node</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[{ key: 'personal' as const, label: 'Personal Hardware', icon: Server }, { key: 'aws' as const, label: 'AWS Cloud', icon: Cloud }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all"
              style={{
                background: tab === t.key ? 'var(--accent-bg)' : 'var(--bg-page)',
                color: tab === t.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
                border: tab === t.key ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
              }}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'personal' ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Run this command on the machine you want to register as a node:
            </p>
            <div className="relative rounded-lg p-3" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
              <code className="text-xs break-all block pr-8" style={{ color: 'var(--accent-blue)' }}>{installCmd}</code>
              <button onClick={copyCmd} className="absolute top-3 right-3" style={{ color: 'var(--text-muted)' }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              The agent will detect your system specs, register with OverClaw, and send heartbeats every 30 seconds. Personal hardware nodes are free and unlimited on all plans.
            </p>
          </div>
        ) : (
          /* AWS tab — Coming Soon */
          <div className="relative" style={{ minHeight: 280 }}>
            {/* Preview content behind overlay */}
            <div className="space-y-4" style={{ opacity: 0.3, pointerEvents: 'none' }}>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>AWS nodes</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>0/0 used</span>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Region</label>
                <div className="grid grid-cols-2 gap-2">
                  {AWS_REGIONS.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                      <span>{r.flag}</span>
                      <div>
                        <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{r.label}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Instance Size</label>
                {INSTANCE_SIZES.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg mb-2" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.desc}</div>
                    </div>
                    <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{s.spec}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Coming Soon overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 12,
              background: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              zIndex: 10,
            }}>
              <Cloud size={28} style={{ color: '#fff', opacity: 0.8 }} />
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#fff',
                background: 'var(--accent-blue)',
                padding: '8px 24px',
                borderRadius: 20,
                letterSpacing: 0.5,
              }}>
                Coming Soon
              </span>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                Managed AWS cloud nodes are on the way
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
