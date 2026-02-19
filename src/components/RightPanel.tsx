import { useState, useEffect, useCallback } from 'react'
import { Play, Power, RefreshCw, CheckCircle, XCircle, Wifi, WifiOff, Loader2, Plus, Trash2, Eye } from 'lucide-react'
import AddNodeModal from './AddNodeModal'
import NodeDetailModal from './NodeDetailModal'
import { getNodes, deleteNode as dbDeleteNode, getBots, updateBot } from '../lib/db'

interface NodeData {
  id: string; name: string; type: string;
  status: string; region: string; ip_address: string;
  capacity: number; last_heartbeat: string; metadata: any;
  created_at: string; updated_at: string;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return 'Just now'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function NodeStatusCard({ node, onDetail, onRemove }: { node: NodeData; onDetail: () => void; onRemove: () => void }) {
  const online = node.status === 'online'

  return (
    <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: online ? 'var(--accent-green)' : 'var(--accent-red)' }} />
          <span className="font-medium text-xs truncate" style={{ color: 'var(--text-primary)' }}>{node.name}</span>
        </div>
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0" style={{
          background: node.type === 'aws' ? 'rgba(139,92,246,0.15)' : 'var(--accent-bg)',
          color: node.type === 'aws' ? '#8B5CF6' : 'var(--accent-red)',
        }}>{node.type === 'aws' ? 'AWS' : 'Personal'}</span>
      </div>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span style={{ color: 'var(--text-secondary)' }}>Region</span>
          <span style={{ color: 'var(--text-primary)' }}>{node.region || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--text-secondary)' }}>Last Heartbeat</span>
          <span style={{ color: online ? 'var(--text-primary)' : 'var(--accent-red)' }}>
            {node.last_heartbeat ? timeAgo(node.last_heartbeat) : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--text-secondary)' }}>Capacity</span>
          <span style={{ color: 'var(--text-primary)' }}>{node.capacity} bots</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--text-secondary)' }}>Connected</span>
          <span className="flex items-center gap-1" style={{ color: online ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {online ? <><Wifi size={10} /> Yes</> : <><WifiOff size={10} /> No</>}
          </span>
        </div>
      </div>
      <div className="flex gap-1 pt-0.5">
        <button onClick={onDetail} className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium rounded-md py-1.5 transition-colors" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
          <Eye size={10} /> Details
        </button>
        <button onClick={onRemove} className="flex items-center justify-center px-2 py-1.5 rounded-md transition-colors" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', color: 'var(--accent-red)' }}>
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

export default function RightPanel() {
  const [nodes, setNodes] = useState<NodeData[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [detailNode, setDetailNode] = useState<NodeData | null>(null)

  const fetchNodes = useCallback(async () => {
    try {
      const data = await getNodes()
      setNodes(data)
      setLastCheck(new Date())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchNodes()
    const i = setInterval(fetchNodes, 10000)
    return () => clearInterval(i)
  }, [fetchNodes])

  const removeNode = async (id: string) => {
    await dbDeleteNode(id)
    fetchNodes()
  }

  const startAllBots = async () => {
    setActing(true)
    try {
      const bots = await getBots()
      await Promise.all(
        bots.filter(b => b.status !== 'running').map(b => updateBot(b.id, { status: 'running' }))
      )
    } catch {}
    finally { setActing(false) }
  }

  const stopAllBots = async () => {
    setActing(true)
    try {
      const bots = await getBots()
      await Promise.all(
        bots.filter(b => b.status === 'running').map(b => updateBot(b.id, { status: 'stopped' }))
      )
    } catch {}
    finally { setActing(false) }
  }

  const onlineCount = nodes.filter(n => n.status === 'online').length

  return (
    <div className="w-72 p-5 space-y-4 shrink-0 overflow-auto" style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-page)' }}>
      {/* Quick Actions */}
      <div>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Quick Actions</h3>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Common controls for cloud bots.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={startAllBots} disabled={acting}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg py-2 transition-colors disabled:opacity-40"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
          {acting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Start All
        </button>
        <button onClick={fetchNodes}
          className="flex items-center justify-center text-xs font-medium rounded-lg py-2 px-3 transition-colors"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={13} />
        </button>
        <button onClick={stopAllBots} disabled={acting}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg py-2 transition-colors disabled:opacity-40"
          style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
          <Power size={13} /> Kill All
        </button>
      </div>

      {/* Nodes header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Nodes</h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{onlineCount}/{nodes.length} online</p>
        </div>
        <button onClick={() => setShowAddNode(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-white rounded-lg"
          style={{ background: 'var(--accent-blue)' }}>
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Node cards */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No nodes registered.</p>
          <button onClick={() => setShowAddNode(true)}
            className="mt-2 px-3 py-1.5 text-[11px] font-medium text-white rounded-lg"
            style={{ background: 'var(--accent-blue)' }}>
            Add Your First Node
          </button>
        </div>
      ) : (
        nodes.map(n => (
          <NodeStatusCard
            key={n.id}
            node={n}
            onDetail={() => setDetailNode(n)}
            onRemove={() => removeNode(n.id)}
          />
        ))
      )}

      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Last check: {lastCheck ? timeAgo(lastCheck.toISOString()) : '—'}
      </div>

      {/* Modals */}
      {showAddNode && <AddNodeModal onClose={() => setShowAddNode(false)} onAdded={fetchNodes} />}
      {detailNode && <NodeDetailModal node={detailNode as any} onClose={() => setDetailNode(null)} onRemove={removeNode} onDeploy={() => {}} />}
    </div>
  )
}
