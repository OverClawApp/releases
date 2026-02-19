import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchBots as apiFetchBots, sendChat } from '../lib/localApi'
import { Send, Bot, User, Loader2, ChevronDown } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  botName?: string
  parallel?: boolean
  subtasks?: { botName: string; subtask: string; response: string }[]
}

interface BotOption {
  id: string
  name: string
  description: string
  status: string
}

export default function ChatBox({ directMode }: { directMode?: boolean } = {}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [bots, setBots] = useState<BotOption[]>([])
  const [selectedBot, setSelectedBot] = useState<string>('orchestrator')
  const [showSelector, setShowSelector] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const fetchBots = useCallback(async () => {
    try {
      const data = await apiFetchBots()
      if (data.ok) setBots(data.bots)
    } catch {}
  }, [])

  useEffect(() => { fetchBots() }, [fetchBots])

  // Close selector on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setShowSelector(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentBotLabel = selectedBot === 'orchestrator'
    ? 'Orchestrator'
    : bots.find(b => b.id === selectedBot)?.name || 'Unknown'

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const data = await sendChat(msg, messages, selectedBot, directMode ?? false)
      if (data.ok) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          botName: data.botName || currentBotLabel,
          parallel: data.parallel || false,
          subtasks: data.subtasks || undefined,
        }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error || 'Unknown error'}` }])
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Failed to connect: ${err.message}` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="rounded-xl flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', height: '280px' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <Bot size={16} style={{ color: 'var(--accent-teal)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{directMode ? 'Chat with OpenClaw' : 'Chat with Agent'}</span>
        {!directMode && (
          <span className="text-[10px] px-2 py-0.5 rounded-full ml-1" style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
            {currentBotLabel}
          </span>
        )}
        <div className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: 'var(--accent-green)' }} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {directMode
                ? 'Send a message to your local OpenClaw agent'
                : selectedBot === 'orchestrator'
                ? 'The Orchestrator will delegate tasks to the best bot for the job'
                : `Chatting directly with ${currentBotLabel}`}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--accent-bg-strong)' }}>
                <Bot size={12} style={{ color: 'var(--accent-teal)' }} />
              </div>
            )}
            <div className="max-w-[85%]">
              {msg.role === 'assistant' && msg.botName && (
                <div className="flex items-center gap-1.5 text-[10px] mb-0.5 px-1" style={{ color: 'var(--text-muted)' }}>
                  {msg.botName}
                  {msg.parallel && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>parallel</span>
                  )}
                </div>
              )}
              {msg.parallel && msg.subtasks && (
                <div className="mb-1.5 flex flex-wrap gap-1 px-1">
                  {msg.subtasks.map((st, si) => (
                    <span key={si} className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(63,185,80,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(63,185,80,0.2)' }}>
                      {st.botName}: {st.subtask.length > 30 ? st.subtask.slice(0, 30) + '…' : st.subtask}
                    </span>
                  ))}
                </div>
              )}
              <div
                className="px-3 py-2 rounded-xl text-[13px] leading-relaxed"
                style={{
                  background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-page)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: msg.role === 'assistant' ? '1px solid var(--border-color)' : 'none',
                }}
              >
                {msg.content}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--accent-bg-strong)' }}>
                <User size={12} style={{ color: 'var(--accent-blue)' }} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 items-center">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg-strong)' }}>
              <Bot size={12} style={{ color: 'var(--accent-teal)' }} />
            </div>
            <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              <Loader2 size={14} className="animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="flex gap-2 items-center">
          {/* Bot selector */}
          {!directMode && <div className="relative" ref={selectorRef}>
            <button
              onClick={() => setShowSelector(!showSelector)}
              className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-medium whitespace-nowrap"
              style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <Bot size={12} />
              <span className="max-w-[60px] truncate">{currentBotLabel}</span>
              <ChevronDown size={10} />
            </button>
            {showSelector && (
              <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg shadow-xl py-1 z-50" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                {/* Orchestrator */}
                <button
                  onClick={() => { setSelectedBot('orchestrator'); setShowSelector(false) }}
                  className="w-full text-left px-3 py-2 transition-colors"
                  style={{ background: selectedBot === 'orchestrator' ? 'var(--bg-page)' : 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-page)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedBot === 'orchestrator' ? 'var(--bg-page)' : 'transparent'}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                      <Bot size={10} style={{ color: '#8B5CF6' }} />
                    </div>
                    <div>
                      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Orchestrator</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Delegates to the best bot</div>
                    </div>
                  </div>
                </button>
                {/* Divider */}
                {bots.length > 0 && <div className="my-1" style={{ borderTop: '1px solid var(--border-color)' }} />}
                {/* Individual bots */}
                {bots.map(b => {
                  const online = b.status === 'Online'
                  return (
                    <button
                      key={b.id}
                      onClick={() => { setSelectedBot(b.id); setShowSelector(false) }}
                      className="w-full text-left px-3 py-2 transition-colors"
                      style={{ background: selectedBot === b.id ? 'var(--bg-page)' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-page)'}
                      onMouseLeave={e => e.currentTarget.style.background = selectedBot === b.id ? 'var(--bg-page)' : 'transparent'}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: online ? 'rgba(63,185,80,0.15)' : 'rgba(139,148,158,0.15)' }}>
                          <Bot size={10} style={{ color: online ? 'var(--accent-green)' : 'var(--text-muted)' }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.name}</div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{b.description || b.status}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
                {bots.length === 0 && (
                  <div className="px-3 py-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>No bots created yet</div>
                )}
              </div>
            )}
          </div>}

          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-30"
            style={{ background: 'var(--accent-blue)' }}
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
