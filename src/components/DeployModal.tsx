import { X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getNodes, createBot } from '../lib/db'

interface Props { onClose: () => void; onCreated: () => void }

export default function DeployModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')
  const [region, setRegion] = useState('London (eu-west-2)')
  const [nodeId, setNodeId] = useState('')
  const [nodes, setNodes] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getNodes().then(setNodes).catch(() => {})
  }, [])

  const inputStyle = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await createBot({
        name: name.trim(),
        description,
        model: model || 'claude-sonnet-4-20250514',
        node_id: nodeId || undefined,
      })
      onCreated()
      onClose()
    } catch {} finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="rounded-xl shadow-2xl w-96 p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Create Cloud Bot</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create a new bot and optionally assign it to a node.</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Bot Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" style={{ ...inputStyle, '--tw-ring-color': 'var(--accent-blue)' } as any} placeholder="SupportBot-4" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" style={{ ...inputStyle, '--tw-ring-color': 'var(--accent-blue)' } as any} placeholder="Handles inbound support" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Model</label>
            <input value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1" style={{ ...inputStyle, '--tw-ring-color': 'var(--accent-blue)' } as any} placeholder="claude-sonnet-4-20250514" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Region</label>
            <select value={region} onChange={e => setRegion(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle}>
              <option>London (eu-west-2)</option>
              <option>US East (us-east-1)</option>
              <option>US West (us-west-2)</option>
              <option>EU Frankfurt (eu-central-1)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Assign to Node</label>
            <select value={nodeId} onChange={e => setNodeId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle}>
              <option value="">No node</option>
              {nodes.map(n => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg transition-colors" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || !name.trim()} className="flex-1 py-2 text-sm font-medium text-white rounded-lg transition-colors" style={{ background: 'var(--accent-blue)', opacity: submitting || !name.trim() ? 0.5 : 1 }}>
              {submitting ? 'Creating...' : 'Create Bot'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
