import { X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getNodes, updateBot, deleteBot } from '../lib/db'

interface BotData {
  id: string; name: string; description: string; model: string;
  status: string; node_id: string | null; node?: { id: string; name: string; status: string } | null;
}

interface Props {
  bot: BotData
  onClose: () => void
  onUpdated: () => void
}

export default function BotActionsModal({ bot, onClose, onUpdated }: Props) {
  const [showAssign, setShowAssign] = useState(false)
  const [nodes, setNodes] = useState<any[]>([])
  const [selectedNode, setSelectedNode] = useState(bot.node_id || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (showAssign) {
      getNodes().then(setNodes).catch(() => {})
    }
  }, [showAssign])

  const handleStart = async () => {
    await updateBot(bot.id, { status: 'running' })
    onUpdated(); onClose()
  }

  const handleStop = async () => {
    await updateBot(bot.id, { status: 'stopped' })
    onUpdated(); onClose()
  }

  const handleAssign = async () => {
    await updateBot(bot.id, { node_id: selectedNode || null })
    onUpdated(); onClose()
  }

  const handleDelete = async () => {
    await deleteBot(bot.id)
    onUpdated(); onClose()
  }

  const isOnline = bot.status === 'running'
  const nodeName = bot.node?.name || null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="rounded-xl shadow-2xl w-80 p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-1">
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{bot.name}</h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="mb-4">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Control your bot</p>
        </div>

        {showAssign ? (
          <div className="space-y-3">
            <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>Select Node</label>
            <select value={selectedNode} onChange={e => setSelectedNode(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">No node</option>
              {nodes.map(n => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowAssign(false)} className="flex-1 py-2 text-sm rounded-lg" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Back</button>
              <button onClick={handleAssign} className="flex-1 py-2 text-sm font-medium text-white rounded-lg" style={{ background: 'var(--accent-blue)' }}>Assign</button>
            </div>
          </div>
        ) : confirmDelete ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Delete <strong>{bot.name}</strong>? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 text-sm rounded-lg" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2 text-sm font-medium text-white rounded-lg" style={{ background: 'var(--accent-red)' }}>Delete</button>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {!isOnline && (
              <button onClick={handleStart} className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Start
              </button>
            )}
            {isOnline && (
              <button onClick={handleStop} className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Stop
              </button>
            )}
            <button onClick={() => setShowAssign(true)} className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Assign Node {nodeName ? `(current: ${nodeName})` : ''}
            </button>
            <button onClick={() => setConfirmDelete(true)} className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors" style={{ color: 'var(--accent-red)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
