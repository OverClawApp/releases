import { X, Check, Settings, Loader2 } from 'lucide-react'
import { fetchProviders } from '../lib/localApi'
import { useState, useEffect } from 'react'

interface Props {
  currentModel: string | null
  onClose: () => void
  onSave: (model: string) => void
}

const allProviders = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4', desc: 'Most capable, best for complex tasks' },
      { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4', desc: 'Balanced speed and intelligence' },
      { id: 'anthropic/claude-haiku-4', label: 'Claude Haiku 4', desc: 'Fastest, most affordable' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'openai/gpt-4o', label: 'GPT-4o', desc: 'Latest multimodal model' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast and affordable' },
      { id: 'openai/o3', label: 'o3', desc: 'Advanced reasoning model' },
      { id: 'openai/o3-mini', label: 'o3 Mini', desc: 'Efficient reasoning' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    models: [
      { id: 'openrouter/auto', label: 'Auto', desc: 'Automatically selects best model' },
    ],
  },
  {
    id: 'venice',
    name: 'Venice AI',
    models: [
      { id: 'venice/llama-3.3-70b', label: 'Llama 3.3 70B', desc: 'Privacy-first, open source' },
      { id: 'venice/claude-opus-45', label: 'Claude Opus (via Venice)', desc: 'Strongest model, privacy-first' },
    ],
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    models: [
      { id: 'bedrock/claude-opus-4', label: 'Claude Opus 4', desc: 'Via AWS Bedrock' },
      { id: 'bedrock/claude-sonnet-4', label: 'Claude Sonnet 4', desc: 'Via AWS Bedrock' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    models: [
      { id: 'groq/llama-3.3-70b', label: 'Llama 3.3 70B', desc: 'Ultra-fast inference' },
      { id: 'groq/mixtral-8x7b', label: 'Mixtral 8x7B', desc: 'Fast mixture of experts' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    models: [
      { id: 'mistral/mistral-large', label: 'Mistral Large', desc: 'Most capable Mistral model' },
      { id: 'mistral/mistral-medium', label: 'Mistral Medium', desc: 'Balanced performance' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    models: [
      { id: 'xai/grok-2', label: 'Grok 2', desc: 'Latest Grok model' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    models: [
      { id: 'ollama/llama3.3', label: 'Llama 3.3', desc: 'Run locally, no API key needed' },
      { id: 'ollama/mistral', label: 'Mistral', desc: 'Run locally, no API key needed' },
      { id: 'ollama/qwen2.5', label: 'Qwen 2.5', desc: 'Run locally, no API key needed' },
    ],
  },
]

export default function ChangeModelModal({ currentModel, onClose, onSave }: Props) {
  const [selected, setSelected] = useState(currentModel || '')
  const [customModel, setCustomModel] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProviders()
      .then(data => setConfiguredProviders(data.providers || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const availableProviders = allProviders.filter(p => configuredProviders.includes(p.id))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="rounded-xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start p-5 pb-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Change AI Model</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Select the default model for your OpenClaw agent</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={16} className="animate-spin" /> Loading providers...
            </div>
          ) : availableProviders.length === 0 ? (
            <div className="text-center py-6">
              <Settings size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No providers configured</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add API keys in Settings to unlock models</p>
            </div>
          ) : (
            availableProviders.map(provider => (
              <div key={provider.id}>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{provider.name}</div>
                <div className="space-y-1">
                  {provider.models.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { setSelected(model.id); setUseCustom(false); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left"
                      style={{
                        background: selected === model.id && !useCustom ? 'var(--accent-bg)' : 'transparent',
                        border: selected === model.id && !useCustom ? '1px solid var(--accent-border)' : '1px solid transparent',
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{model.label}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{model.desc}</div>
                      </div>
                      {selected === model.id && !useCustom && <Check size={16} style={{ color: 'var(--accent-blue)' }} />}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Custom model input */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Custom</div>
            <div className="flex gap-2">
              <input
                value={customModel}
                onChange={e => { setCustomModel(e.target.value); setUseCustom(true); }}
                placeholder="provider/model-name"
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Enter any provider/model supported by OpenClaw</p>
          </div>

          {/* Settings hint */}
          <div className="rounded-lg px-3 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-bg-subtle)', border: '1px solid var(--accent-border)' }}>
            <Settings size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              To add more models, go to <strong style={{ color: 'var(--accent-blue)' }}>Settings</strong> and add an API key for the provider you want to use.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg" style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Cancel</button>
          <button
            onClick={() => onSave(useCustom && customModel ? customModel : selected)}
            disabled={!useCustom && !selected}
            className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
            style={{ background: 'var(--accent-blue)' }}
          >
            Save Model
          </button>
        </div>
      </div>
    </div>
  )
}
