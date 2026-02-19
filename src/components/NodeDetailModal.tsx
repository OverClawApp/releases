import { useState } from 'react'
import { X, Cpu, HardDrive, Clock, Trash2, Upload, RotateCcw, Wifi, WifiOff } from 'lucide-react'

interface NodeData {
  id: string; name: string; type: string; hostname: string; os: string; arch: string;
  cpus: number; memory: string; status: string; ip: string; registeredAt: string;
  lastHeartbeat: string; bots: any[]; tags: string[]; agentVersion: string;
  cpuUsage?: number; memUsage?: number;
}

interface Props { node: NodeData; onClose: () => void; onRemove: (id: string) => void; onDeploy: (id: string) => void }

export default function NodeDetailModal({ node, onClose, onRemove, onDeploy }: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  const uptime = () => {
    const ms = Date.now() - new Date(node.registeredAt).getTime()
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000)
    return d > 0 ? `${d}d ${h}h` : `${h}h`
  }

  const isOnline = node.status === 'online'
  const StatusIcon = isOnline ? Wifi : WifiOff

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-6 space-y-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: isOnline ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)' }}>
              <StatusIcon size={20} style={{ color: isOnline ? 'var(--accent-green)' : 'var(--accent-red)' }} />
            </div>
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>{node.name}</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{node.hostname}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
            background: isOnline ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
            color: isOnline ? 'var(--accent-green)' : 'var(--accent-red)',
          }}>{node.status}</span>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
            background: node.type === 'aws' ? 'rgba(139,92,246,0.15)' : 'var(--accent-bg)',
            color: node.type === 'aws' ? '#8B5CF6' : 'var(--accent-red)',
          }}>{node.type === 'aws' ? 'AWS' : 'Personal'}</span>
        </div>

        {/* Specs grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Cpu, label: 'CPU', value: `${node.cpus} cores` },
            { icon: HardDrive, label: 'Memory', value: node.memory },
            { icon: Clock, label: 'Uptime', value: uptime() },
            { icon: Cpu, label: 'OS / Arch', value: `${node.os} (${node.arch})` },
          ].map((s, i) => (
            <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-2 mb-1">
                <s.icon size={13} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* IP & Agent version */}
        <div className="flex justify-between text-xs px-1" style={{ color: 'var(--text-muted)' }}>
          <span>IP: {node.ip}</span>
          <span>Agent v{node.agentVersion}</span>
        </div>

        {/* Tags */}
        {node.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {node.tags.map(t => (
              <span key={t} className="px-2 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-page)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Deployed bots */}
        <div>
          <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Deployed Bots ({node.bots.length})</h3>
          {node.bots.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No bots deployed on this node.</p>
          ) : (
            <div className="space-y-1">
              {node.bots.map((b: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--bg-page)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{b.botName}</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{new Date(b.deployedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => onDeploy(node.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--accent-blue)' }}>
            <Upload size={14} /> Deploy Bot
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm"
            style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
            <RotateCcw size={14} /> Restart
          </button>
          {confirmRemove ? (
            <button onClick={() => { onRemove(node.id); onClose() }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent-red)' }}>
              Confirm
            </button>
          ) : (
            <button onClick={() => setConfirmRemove(true)}
              className="flex items-center justify-center px-3 py-2.5 rounded-lg"
              style={{ border: '1px solid var(--border-color)', color: 'var(--accent-red)' }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
