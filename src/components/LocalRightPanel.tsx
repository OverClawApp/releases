import { Play, Square, Settings, Trash2, Palette, MessageSquare, CheckCircle, Download, RefreshCw, ExternalLink, TerminalSquare } from 'lucide-react'
import { useOpenClawContext } from '../context/OpenClawContext'
import { useState, useEffect } from 'react'
import ChangeModelModal from './ChangeModelModal'
import ChangeChatModal from './ChangeChatModal'
import ControlUIModal from './ControlUIModal'
import Terminal from './Terminal'

export default function LocalRightPanel() {
  const { status, lines, install, gatewayStart, gatewayStop, gatewayRestart, uninstall, fetchStatus, changeModel, getCurrentModel, changeChannel } = useOpenClawContext()
  const [lastCheck, setLastCheck] = useState('Just now')
  const [showModelModal, setShowModelModal] = useState(false)
  const [showChatModal, setShowChatModal] = useState(false)
  const [showControlUI, setShowControlUI] = useState(false)
  const [showTUI, setShowTUI] = useState(false)
  const [currentModel, setCurrentModel] = useState<string | null>(null)

  const installed = status?.installed ?? false

  useEffect(() => {
    const id = setInterval(() => setLastCheck('Just now'), 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (installed) {
      getCurrentModel().then(setCurrentModel)
    }
  }, [installed])

  const handleSaveModel = async (model: string) => {
    await changeModel(model)
    setCurrentModel(model)
    setShowModelModal(false)
  }

  const handleSaveChannel = async (channel: string, config: Record<string, string>) => {
    await changeChannel(channel, config)
    setShowChatModal(false)
  }

  const openControlUI = () => {
    setShowControlUI(true)
  }

  return (
    <div className="w-72 p-5 space-y-4 shrink-0 overflow-auto" style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-page)' }}>
      {/* Status card */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div>
          <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Local status</h4>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Quick overview of this machine and OpenClaw.</p>
        </div>
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>OpenClaw</span>
            <span style={{ color: installed ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {installed ? (
                <span className="flex items-center gap-1"><CheckCircle size={12} /> Installed</span>
              ) : 'Not installed'}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Gateway</span>
            <span style={{
              color: status?.gateway === 'running' ? 'var(--accent-green)' : status?.gateway === 'idle' ? 'var(--accent-yellow)' : 'var(--text-primary)'
            }}>
              {status?.gateway ? status.gateway.charAt(0).toUpperCase() + status.gateway.slice(1) : 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Version</span>
            <span style={{ color: 'var(--text-primary)' }}>{status?.version ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Model</span>
            <span className="text-[11px] truncate max-w-[120px]" style={{ color: 'var(--accent-blue)' }}>{currentModel || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Local URL</span>
            <span className="text-[11px]" style={{ color: 'var(--accent-blue)' }}>{status?.localUrl || '—'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Last check: {lastCheck}</div>
        <button onClick={fetchStatus} className="p-1 rounded hover:bg-white/5"><RefreshCw size={12} style={{ color: 'var(--text-muted)' }} /></button>
      </div>

      {/* Quick actions */}
      <div>
        <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Quick actions</h4>
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Common controls for local usage.</p>
        <div className="space-y-1.5">
          {installed ? (
            <>
              {status?.gateway === 'running' ? (
                <>
                  <ActionButton icon={Square} label="Stop gateway" onClick={gatewayStop} danger />
                  <ActionButton icon={RefreshCw} label="Restart gateway" onClick={gatewayRestart} />
                </>
              ) : (
                <ActionButton icon={Play} label="Start gateway" onClick={gatewayStart} />
              )}
              <ActionButton icon={Palette} label="Change Model" onClick={() => setShowModelModal(true)} />
              <ActionButton icon={MessageSquare} label="Change Chat" onClick={() => setShowChatModal(true)} />
              <ActionButton icon={TerminalSquare} label="Live TUI" onClick={() => setShowTUI(true)} />
              <ActionButton icon={ExternalLink} label="Open Control UI" onClick={openControlUI} />
              <ActionButton icon={Trash2} label="Uninstall" onClick={uninstall} danger />
            </>
          ) : (
            <>
              <ActionButton icon={Download} label="Install OpenClaw" onClick={install} primary />
              <ActionButton icon={Play} label="Start gateway" />
              <ActionButton icon={Settings} label="Open Control UI" onClick={openControlUI} />
              <ActionButton icon={Trash2} label="Uninstall" danger />
            </>
          )}
        </div>
      </div>

      {showTUI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowTUI(false)}>
          <div className="rounded-xl p-5 w-[600px] max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Live TUI</h3>
              <button onClick={() => setShowTUI(false)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--bg-page)' }}>Close</button>
            </div>
            <div className="flex-1 overflow-auto">
              <Terminal lines={lines} />
            </div>
          </div>
        </div>
      )}

      {showControlUI && (
        <ControlUIModal
          localUrl={status?.localUrl || 'http://127.0.0.1:18789'}
          onClose={() => setShowControlUI(false)}
        />
      )}
      {showModelModal && (
        <ChangeModelModal
          currentModel={currentModel}
          onClose={() => setShowModelModal(false)}
          onSave={handleSaveModel}
        />
      )}
      {showChatModal && (
        <ChangeChatModal
          onClose={() => setShowChatModal(false)}
          onSave={handleSaveChannel}
        />
      )}
    </div>
  )
}

function ActionButton({ icon: Icon, label, primary, danger, onClick }: { icon: any; label: string; primary?: boolean; danger?: boolean; onClick?: () => void }) {
  const style = primary
    ? { background: 'var(--accent-blue)', color: '#fff' }
    : danger
    ? { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.2)', color: 'var(--accent-red)' }
    : { background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }

  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors" style={style}>
      <Icon size={14} /> {label}
    </button>
  )
}
