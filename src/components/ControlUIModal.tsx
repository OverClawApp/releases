import { X, Copy, CheckCircle, ExternalLink } from 'lucide-react'
import { fetchConfig } from '../lib/localApi'
import { useState, useEffect } from 'react'

interface Props {
  localUrl: string
  onClose: () => void
}

export default function ControlUIModal({ localUrl, onClose }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchConfig()
      .then(data => {
        const t = data?.config?.gateway?.auth?.token
        if (t) setToken(t)
      })
      .catch(() => {})
  }, [])

  const copyToken = () => {
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openUI = () => {
    window.open(localUrl, '_blank')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="rounded-xl shadow-2xl w-[440px] p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Open Control UI</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Gateway authentication required</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          The Control UI requires your gateway key to function. Copy the key below and paste it into the UI when prompted.
        </p>

        {/* Token display */}
        <div className="mb-4">
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Gateway Key</label>
          <div className="flex gap-2">
            <div
              className="flex-1 rounded-lg px-3 py-2.5 text-sm font-mono truncate select-all"
              style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            >
              {token || 'Loading...'}
            </div>
            <button
              onClick={copyToken}
              disabled={!token}
              className="px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium shrink-0 disabled:opacity-40 transition-colors"
              style={{ background: copied ? 'rgba(63,185,80,0.15)' : 'var(--bg-page)', border: '1px solid var(--border-color)', color: copied ? 'var(--accent-green)' : 'var(--text-secondary)' }}
            >
              {copied ? <><CheckCircle size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm rounded-lg" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
          <button
            onClick={openUI}
            className="flex-1 py-2.5 text-sm font-medium text-white rounded-lg flex items-center justify-center gap-2"
            style={{ background: 'var(--accent-blue)' }}
          >
            <ExternalLink size={14} /> Open UI
          </button>
        </div>
      </div>
    </div>
  )
}
