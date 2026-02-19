import { X, Check } from 'lucide-react'
import { useState } from 'react'

interface Props {
  onClose: () => void
  onSave: (channel: string, config: Record<string, string>) => void
}

const channels = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    desc: 'Connect via WhatsApp self-chat',
    fields: [
      { key: 'selfChatMode', label: 'Self Chat Mode', type: 'toggle' as const },
      { key: 'phoneNumber', label: 'Phone Number', type: 'text' as const, placeholder: '+44...' },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram',
    desc: 'Connect via Telegram bot',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'text' as const, placeholder: 'From @BotFather' },
    ],
  },
  {
    id: 'discord',
    label: 'Discord',
    desc: 'Connect via Discord bot',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'text' as const, placeholder: 'Discord bot token' },
      { key: 'guildId', label: 'Server ID', type: 'text' as const, placeholder: 'Guild ID' },
    ],
  },
  {
    id: 'signal',
    label: 'Signal',
    desc: 'Connect via Signal',
    fields: [],
  },
  {
    id: 'slack',
    label: 'Slack',
    desc: 'Connect via Slack app',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'text' as const, placeholder: 'xoxb-...' },
    ],
  },
  {
    id: 'imessage',
    label: 'iMessage',
    desc: 'Connect via iMessage (macOS only)',
    fields: [],
  },
]

export default function ChangeChatModal({ onClose, onSave }: Props) {
  const [selected, setSelected] = useState('whatsapp')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})

  const activeChannel = channels.find(c => c.id === selected)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="rounded-xl shadow-2xl w-[460px] max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start p-5 pb-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Change Chat Channel</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Select how you want to communicate with your agent</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="space-y-1.5">
            {channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => setSelected(ch.id)}
                className="w-full flex items-center justify-between px-3 py-3 rounded-lg transition-colors text-left"
                style={{
                  background: selected === ch.id ? 'var(--accent-bg)' : 'transparent',
                  border: selected === ch.id ? '1px solid var(--accent-border)' : '1px solid transparent',
                }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ch.label}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{ch.desc}</div>
                </div>
                {selected === ch.id && <Check size={16} style={{ color: 'var(--accent-blue)' }} />}
              </button>
            ))}
          </div>

          {/* Config fields for selected channel */}
          {activeChannel && activeChannel.fields.length > 0 && (
            <div className="pt-2 space-y-3" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{activeChannel.label} Configuration</div>
              {activeChannel.fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>{field.label}</label>
                  {field.type === 'toggle' ? (
                    <button
                      onClick={() => setFieldValues(v => ({ ...v, [field.key]: v[field.key] === 'true' ? 'false' : 'true' }))}
                      className="flex items-center gap-2 text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <div className="w-9 h-5 rounded-full relative transition-colors" style={{
                        background: fieldValues[field.key] === 'true' ? 'var(--accent-blue)' : 'var(--border-light)',
                      }}>
                        <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all" style={{
                          left: fieldValues[field.key] === 'true' ? '18px' : '2px',
                        }} />
                      </div>
                      {fieldValues[field.key] === 'true' ? 'Enabled' : 'Disabled'}
                    </button>
                  ) : (
                    <input
                      value={fieldValues[field.key] || ''}
                      onChange={e => setFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                      style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
          <button
            onClick={() => onSave(selected, fieldValues)}
            className="flex-1 py-2 text-sm font-medium text-white rounded-lg"
            style={{ background: 'var(--accent-blue)' }}
          >
            Save Channel
          </button>
        </div>
      </div>
    </div>
  )
}
