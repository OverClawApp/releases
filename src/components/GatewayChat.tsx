import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Square, RotateCcw, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react'

interface ChatAttachment {
  id: string
  file: File
  dataUrl: string
  mimeType: string
  fileName: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: { mimeType: string; fileName: string; dataUrl?: string }[]
  timestamp?: number
}

interface RelayClient {
  sendDelta: (text: string) => void
  sendFinal: (text: string) => void
  sendError: (message: string) => void
  sendHistory: (id: string, messages: { role: string; content: string; timestamp?: number }[]) => void
  sendStatus: (status: 'streaming' | 'idle') => void
}

interface GatewayChatProps {
  gatewayUrl?: string
  gatewayToken?: string
  sessionKey?: string
  onWsReady?: (wsRequest: (method: string, params: any) => Promise<any>) => void
  clearRef?: React.MutableRefObject<(() => void) | null>
  stateDir?: string
  title?: string
  messagePrefix?: string
  apiKey?: string
  relay?: RelayClient | null
  onRelaySendRef?: React.MutableRefObject<((text: string) => void) | null>
  onRelayAbortRef?: React.MutableRefObject<(() => void) | null>
  onRelayHistoryRef?: React.MutableRefObject<((id: string) => void) | null>
}

function uuid(): string {
  if (crypto?.randomUUID) return crypto.randomUUID()
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  a[6] = (a[6] & 0x0f) | 0x40
  a[8] = (a[8] & 0x3f) | 0x80
  const h = [...a].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

// --- Auto Model Routing ---

interface ModelTier { id: string; role: 'fast' | 'balanced' | 'smart' }

const _modelTiersCache: Record<string, ModelTier[]> = {}
async function loadModelTiers(stateDir?: string): Promise<ModelTier[]> {
  const key = stateDir || 'default'
  if (_modelTiersCache[key]) return _modelTiersCache[key]
  try {
    const isElectron = !!window.electronAPI?.isElectron
    if (!isElectron) return []
    const home = await window.electronAPI!.getHomedir()
    const dir = stateDir || `${home}/.openclaw`
    const raw = await window.electronAPI!.exec(`cat "${dir}/model-tiers.json"`, [])
    _modelTiersCache[key] = JSON.parse(raw)
    return _modelTiersCache[key]
  } catch { return [] }
}

function classifyComplexity(text: string): 'fast' | 'balanced' | 'smart' {
  const lower = text.toLowerCase().trim()
  const words = lower.split(/\s+/).length

  // Simple greetings, yes/no, short acknowledgements → fast
  const simplePatterns = /^(hi|hello|hey|yes|no|ok|okay|sure|thanks|thank you|bye|good|great|nice|cool|lol|haha|yep|nope|nah|wow|hmm|brb|gtg|test|ping)[\s!?.]*$/i
  if (simplePatterns.test(lower) || words <= 3) return 'fast'

  // Complex: tool use, multi-step, code, analysis, long prompts
  const complexPatterns = /\b(open|browse|search|find|create|write|code|build|implement|analyze|explain|compare|debug|fix|deploy|install|configure|set up|refactor|optimize|summarize|translate|research|plan|design|review|audit|generate|calculate|convert|extract|scrape|automate|schedule|remind|send|email|message|tweet|post)\b/i
  if (complexPatterns.test(lower) || words > 40) return 'smart'

  // Everything else → balanced
  return 'balanced'
}

// --- Memory Compaction ---
// Keep MEMORY.md under a size limit by trimming older sections.
// Sections are delimited by ## headings. We keep the header + most recent sections.
const MEMORY_MAX_CHARS = 3000
let _lastCompactTime = 0

async function compactMemoryIfNeeded(stateDir?: string) {
  // Only compact once per session
  if (_lastCompactTime > 0) return
  try {
    const isElectron = !!window.electronAPI?.isElectron
    if (!isElectron) return
    const home = await window.electronAPI!.getHomedir()
    const dir = stateDir || `${home}/.openclaw`
    const memPath = `${dir}/workspace/MEMORY.md`
    let content: string
    try {
      content = await window.electronAPI!.exec(`cat "${memPath}"`, [])
    } catch { return } // file doesn't exist

    if (content.length <= MEMORY_MAX_CHARS) return

    _lastCompactTime = Date.now()
    console.log(`[GatewayChat] Compacting MEMORY.md: ${content.length} chars → max ${MEMORY_MAX_CHARS}`)

    // Split into sections by ## headings
    const sections = content.split(/^(?=## )/m)
    const header = sections[0] // # MEMORY.md title + preamble

    // Keep header + most recent sections that fit
    let compacted = header
    for (let i = sections.length - 1; i >= 1; i--) {
      if ((compacted + sections[i]).length > MEMORY_MAX_CHARS && compacted.length > header.length) break
      compacted = header + sections.slice(1, i + 1).join('') // rebuild keeping order
    }

    // Actually rebuild from recent sections to fit
    let result = header
    const contentSections = sections.slice(1)
    // Keep from the end (most recent)
    const kept: string[] = []
    let totalLen = header.length
    for (let i = contentSections.length - 1; i >= 0; i--) {
      if (totalLen + contentSections[i].length > MEMORY_MAX_CHARS && kept.length > 0) break
      kept.unshift(contentSections[i])
      totalLen += contentSections[i].length
    }
    result = header + kept.join('')

    if (result.length < content.length) {
      const tmp = `/tmp/overclaw-memory-compact-${Date.now()}`
      // Use printf to avoid heredoc issues with special chars
      await window.electronAPI!.exec(`cat > "${tmp}" << 'MEMEOF'\n${result}\nMEMEOF`, [])
      await window.electronAPI!.exec(`mv "${tmp}" "${memPath}"`, [])
      console.log(`[GatewayChat] Compacted MEMORY.md: ${content.length} → ${result.length} chars`)
    }
  } catch (e) {
    console.warn('[GatewayChat] Memory compaction failed:', e)
  }
}

function extractText(content: any): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts = content
      .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .filter((t: string) => !t.trim().startsWith('[{"type":"toolCall"') && !t.trim().startsWith('[{\"type\":\"toolCall\"'))
    return parts.length > 0 ? parts.join('') : null
  }
  return null
}

// --- Preflight Cost Estimate (cheap cloud model via Railway proxy) ---

const PROXY_URL = 'https://overclaw-api-production.up.railway.app'

interface PreflightEstimate {
  costExplanation: string
  plan: string
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedInternalTokens: number
}

async function getPreflightEstimate(message: string, apiKey: string): Promise<PreflightEstimate> {
  const prompt = `You are a task cost estimator for an AI assistant app. Given a user's task, estimate the cost in internal app tokens. Respond ONLY with valid JSON, no other text.

Fields:
- "costExplanation": One sentence explaining what this task will cost in simple terms
- "plan": 2-3 sentences describing how the AI will approach this task
- "estimatedInputTokens": estimated input tokens needed (integer)
- "estimatedOutputTokens": estimated output tokens the response will use (integer)
- "estimatedInternalTokens": calculated as ceil((estimatedInputTokens * 0.015) + (estimatedOutputTokens * 0.06))

User task: ${message.slice(0, 500)}`

  try {
    const resp = await fetch(`${PROXY_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'overclaw/auto',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
      }),
    })
    if (!resp.ok) throw new Error(`Proxy ${resp.status}`)
    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)
    return {
      costExplanation: parsed.costExplanation || 'This task will use a small amount of tokens.',
      plan: parsed.plan || 'The AI will process your request and respond.',
      estimatedInputTokens: parsed.estimatedInputTokens || Math.ceil(message.length / 4),
      estimatedOutputTokens: parsed.estimatedOutputTokens || Math.ceil(message.length / 2),
      estimatedInternalTokens: parsed.estimatedInternalTokens || 1,
    }
  } catch (e) {
    console.warn('[GatewayChat] Preflight estimate failed, using fallback:', e)
    const inputEst = Math.ceil(message.length / 4)
    const outputEst = Math.ceil(inputEst * 2)
    return {
      costExplanation: 'This task will use a small amount of tokens.',
      plan: 'The AI will process your request and respond.',
      estimatedInputTokens: inputEst,
      estimatedOutputTokens: outputEst,
      estimatedInternalTokens: Math.ceil((inputEst * 0.015) + (outputEst * 0.06)),
    }
  }
}

function cleanDisplayText(text: string): string {
  // Strip [[reply_to_current]], [[reply_to:<id>]], [[ reply_to_current ]] etc.
  text = text.replace(/\[\[\s*reply_to[^\]]*\]\]/g, '')
  // Strip file upload instructions (added by client for agent)
  text = text.replace(/\n*The user has uploaded (images|files)[^]*$/s, '')
  // Strip gateway conversation metadata block
  text = text.replace(/Conversation info \(untrusted metadata\):\s*```json\s*\{[^}]*\}\s*```\s*/gs, '')
  return text.trim()
}

function extractDisplayMessages(messages: any[], stripPrefix?: string): { role: string; content: string; timestamp?: number }[] {
  return messages
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => {
      let text = ''
      if (typeof m.content === 'string') {
        text = m.content
      } else if (Array.isArray(m.content)) {
        text = m.content
          .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
          .map((p: any) => p.text)
          .join('')
      }
      text = text.trim()
      // Strip all gateway/system metadata from user messages
      if (m.role === 'user') {
        // Strip timestamp prefix
        text = text.replace(/^\[.*?\d{4}\s+GMT\]\s*/s, '')
        // Strip conversation info metadata block  
        text = text.replace(/^Conversation info[^]*?```\s*/s, '')
        // Strip [System: ...] prefix block (the messagePrefix)
        if (stripPrefix) {
          const idx = text.indexOf(stripPrefix)
          if (idx !== -1) {
            text = text.slice(idx + stripPrefix.length).replace(/^\n+/, '').trim()
          }
        }
        // Filter out system exec notification messages
        if (/^(System:\s*\[|system\s*\[)/i.test(text)) {
          text = ''
        }
      }
      text = cleanDisplayText(text)
      return { role: m.role as 'user' | 'assistant', content: text, timestamp: m.timestamp }
    })
    .filter((m: any) => m.content.length > 0)
}

// --- Device Auth (Ed25519 via Web Crypto) ---

const DEVICE_STORAGE_KEY = 'openclaw.device.auth.v1'

function toBase64Url(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - s.length % 4) % 4)
  const raw = atob(padded)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
  return buf
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource)
  return toHex(new Uint8Array(hash))
}

interface DeviceIdentity {
  deviceId: string
  publicKey: string   // base64url
  privateKey: CryptoKey
  publicKeyRaw: Uint8Array
}

async function getOrCreateDevice(): Promise<DeviceIdentity> {
  // Try to load existing
  try {
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed?.version === 1 && parsed.publicKeyJwk && parsed.privateKeyJwk) {
        const privateKey = await crypto.subtle.importKey('jwk', parsed.privateKeyJwk, { name: 'Ed25519' }, false, ['sign'])
        const publicKey = await crypto.subtle.importKey('jwk', parsed.publicKeyJwk, { name: 'Ed25519' }, true, ['verify'])
        const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))
        const deviceId = await sha256hex(pubRaw)
        return { deviceId, publicKey: toBase64Url(pubRaw), privateKey, publicKeyRaw: pubRaw }
      }
    }
  } catch (e) {
    console.warn('[DeviceAuth] Failed to load stored identity:', e)
  }

  // Generate new Ed25519 keypair
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
  const deviceId = await sha256hex(pubRaw)

  // Store as JWK
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({
    version: 1,
    deviceId,
    publicKeyJwk,
    privateKeyJwk,
    createdAtMs: Date.now(),
  }))

  return { deviceId, publicKey: toBase64Url(pubRaw), privateKey: keyPair.privateKey, publicKeyRaw: pubRaw }
}

function buildDeviceAuthPayload(opts: {
  deviceId: string, clientId: string, clientMode: string, role: string,
  scopes: string[], signedAtMs: number, token: string | null, nonce?: string
}): string {
  const version = opts.nonce ? 'v2' : 'v1'
  const parts = [
    version, opts.deviceId, opts.clientId, opts.clientMode,
    opts.role, opts.scopes.join(','), String(opts.signedAtMs), opts.token ?? ''
  ]
  if (version === 'v2') parts.push(opts.nonce ?? '')
  return parts.join('|')
}

async function signPayload(privateKey: CryptoKey, payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload)
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, data)
  return toBase64Url(new Uint8Array(sig as ArrayBuffer))
}

// --- Device Token Cache ---

function loadDeviceToken(deviceId: string, role: string): string | null {
  try {
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (parsed?.deviceId !== deviceId) return null
    return parsed?.tokens?.[role]?.token ?? null
  } catch { return null }
}

function saveDeviceToken(deviceId: string, role: string, token: string, scopes: string[]) {
  try {
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (!stored) return
    const parsed = JSON.parse(stored)
    if (parsed?.deviceId !== deviceId) return
    if (!parsed.tokens) parsed.tokens = {}
    parsed.tokens[role] = { token, role, scopes, updatedAtMs: Date.now() }
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {}
}

// --- Component ---

export default function GatewayChat({ gatewayUrl = 'ws://localhost:18789', gatewayToken = '', sessionKey = 'webchat', onWsReady, clearRef, stateDir, title, messagePrefix, apiKey, relay, onRelaySendRef, onRelayAbortRef, onRelayHistoryRef }: GatewayChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, _setStreamText] = useState('')
  const setStreamText = (text: string | ((prev: string) => string)) => {
    _setStreamText((prev) => {
      const next = typeof text === 'function' ? text(prev) : text
      if (next && relayRef.current) relayRef.current.sendDelta(next)
      return next
    })
  }
  const [connState, setConnState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [thinkingQuote, setThinkingQuote] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<null | {
    text: string
    attachments: ChatAttachment[]
    estimate: PreflightEstimate
  }>(null)
  const [estimating, setEstimating] = useState(false)
  const [thoughtText, setThoughtText] = useState('')
  const [thoughtExpanded, setThoughtExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const MAX_ATTACHMENTS = 5
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    console.log(`[GatewayChat] addFiles called with ${fileArray.length} files:`, fileArray.map(f => `${f.name} (${f.type}, ${(f.size/1024).toFixed(0)}KB)`))
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) { console.warn(`[GatewayChat] File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`); continue }
      const id = uuid()
      const mimeType = file.type || 'application/octet-stream'
      const fileName = file.name
      console.log(`[GatewayChat] Adding attachment: ${fileName} (${mimeType})`)
      // Add immediately with empty dataUrl
      setAttachments(prev => {
        const next = [...prev, { id, file, dataUrl: '', mimeType, fileName }]
        console.log(`[GatewayChat] Attachments now: ${next.length}`)
        return prev.length >= MAX_ATTACHMENTS ? prev : next
      })
      // Read file data async, then update the entry
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        console.log(`[GatewayChat] File loaded: ${fileName} (${(dataUrl.length/1024).toFixed(0)}KB dataUrl)`)
        setAttachments(prev => prev.map(a => a.id === id ? { ...a, dataUrl } : a))
      }
      reader.onerror = () => console.error(`[GatewayChat] Failed to read: ${fileName}`)
      reader.readAsDataURL(file)
    }
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const THINKING_QUOTES = [
    'Thinking...', 'Processing your request...', 'Working on it...', 'Let me think about that...',
    'Analyzing...', 'Crafting a response...', 'Almost there...', 'Gathering my thoughts...',
    'On it...', 'Give me a moment...',
  ]

  const relayRef = useRef(relay)
  useEffect(() => { relayRef.current = relay }, [relay])

  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>>(new Map())
  const runIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const connectNonceRef = useRef<string | null>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Expose clear function via ref
  useEffect(() => {
    if (clearRef) clearRef.current = () => { setMessages([]); setStreamText(''); setStreaming(false); setAttachments([]) }
    return () => { if (clearRef) clearRef.current = null }
  }, [clearRef])

  useEffect(() => { scrollToBottom() }, [messages, streamText, scrollToBottom])

  const wsRequest = useCallback((method: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('Not connected')); return }
      const id = uuid()
      pendingRef.current.set(id, { resolve, reject })
      ws.send(JSON.stringify({ type: 'req', id, method, params }))
      setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id)
          reject(new Error('Request timed out'))
        }
      }, 60000)
    })
  }, [])

  // Persistent attachment store — survives history refreshes and app restarts via localStorage
  const attachmentStoreKey = `overclaw.attachments.${sessionKey}`
  const attachmentStoreRef = useRef<Map<string, ChatMessage['attachments']>>(new Map())
  const attachmentStoreLoaded = useRef(false)
  if (!attachmentStoreLoaded.current) {
    attachmentStoreLoaded.current = true
    try {
      const stored = localStorage.getItem(attachmentStoreKey)
      if (stored) attachmentStoreRef.current = new Map(JSON.parse(stored))
    } catch {}
  }
  const saveAttachmentStore = useCallback(() => {
    try {
      const entries = Array.from(attachmentStoreRef.current.entries())
      const trimmed = entries.slice(-50)
      localStorage.setItem(attachmentStoreKey, JSON.stringify(trimmed))
    } catch {}
  }, [attachmentStoreKey])

  const fetchHistory = useCallback(async () => {
    try {
      const result = await wsRequest('chat.history', { sessionKey, limit: 200 })
      const msgs = extractDisplayMessages(result.messages || [], messagePrefix) as ChatMessage[]
      // Also capture attachments from current state into the store
      setMessages(prev => {
        let storeUpdated = false
        for (const m of prev) {
          if (m.role === 'user' && m.attachments?.length && m.content) {
            attachmentStoreRef.current.set(m.content.slice(0, 80), m.attachments)
            storeUpdated = true
          }
        }
        if (storeUpdated) saveAttachmentStore()
        // Match history messages to stored attachments by content prefix
        return msgs.map(m => {
          if (m.role === 'user' && m.content) {
            const key = m.content.slice(0, 80)
            const att = attachmentStoreRef.current.get(key)
            if (att?.length) return { ...m, attachments: att }
          }
          return m
        })
      })
    } catch (e) {
      console.warn('[GatewayChat] fetchHistory failed:', e)
    }
  }, [wsRequest, sessionKey])

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    if (!gatewayUrl || !gatewayToken) {
      setConnState('error')
      setError('No gateway URL or token')
      return
    }

    setConnState('connecting')
    setError(null)
    connectNonceRef.current = null

    console.log('[GatewayChat] Connecting to:', gatewayUrl)
    const ws = new WebSocket(gatewayUrl)
    wsRef.current = ws
    let connectSent = false

    const sendConnect = async () => {
      if (connectSent) return
      connectSent = true

      try {
        const device = await getOrCreateDevice()
        const role = 'operator'
        const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing']
        const clientId = 'openclaw-control-ui'
        const clientMode = 'webchat'
        const signedAtMs = Date.now()
        const nonce = connectNonceRef.current ?? undefined

        // Use cached device token if available, otherwise use gateway token
        const cachedToken = loadDeviceToken(device.deviceId, role)
        const authToken = cachedToken ?? gatewayToken

        const payload = buildDeviceAuthPayload({
          deviceId: device.deviceId,
          clientId,
          clientMode,
          role,
          scopes,
          signedAtMs,
          token: authToken,
          nonce,
        })
        const signature = await signPayload(device.privateKey, payload)

        const instanceId = uuid()
        const id = uuid()
        pendingRef.current.set(id, {
          resolve: (res: any) => {
            console.log('[GatewayChat] CONNECT OK')
            // Save device token if returned
            if (res?.auth?.deviceToken) {
              saveDeviceToken(device.deviceId, res.auth.role ?? role, res.auth.deviceToken, res.auth.scopes ?? [])
            }
            if (mountedRef.current) {
              setConnState('connected'); fetchHistory(); onWsReady?.(wsRequest)
              // Auto-compact memory if too large (runs silently in background)
              compactMemoryIfNeeded(stateDir)
            }
          },
          reject: (err: Error) => {
            console.error('[GatewayChat] CONNECT FAILED:', err.message)
            // If we used a cached device token, clear it and retry with the gateway token
            if (cachedToken && mountedRef.current) {
              console.log('[GatewayChat] Clearing stale device token, retrying...')
              try { localStorage.removeItem(DEVICE_STORAGE_KEY) } catch {}
              ws.close()
              setTimeout(() => { if (mountedRef.current) connect() }, 500)
              return
            }
            if (mountedRef.current) { setConnState('error'); setError(`Connect failed: ${err.message}`) }
          },
        })

        ws.send(JSON.stringify({
          type: 'req', id, method: 'connect',
          params: {
            minProtocol: 3, maxProtocol: 3,
            client: { id: clientId, version: '0.1.0', platform: navigator.platform || 'web', mode: clientMode, instanceId },
            role, scopes, caps: [],
            device: {
              id: device.deviceId,
              publicKey: device.publicKey,
              signature,
              signedAt: signedAtMs,
              nonce,
            },
            auth: { token: authToken },
            userAgent: 'OverClaw Desktop', locale: navigator.language,
          },
        }))
      } catch (e: any) {
        console.error('[GatewayChat] Device auth error:', e)
        if (mountedRef.current) { setConnState('error'); setError(`Device auth failed: ${e.message}`) }
      }
    }

    ws.addEventListener('open', () => {
      console.log('[GatewayChat] WebSocket OPEN')
      setTimeout(() => { if (!connectSent) sendConnect() }, 2000)
    })

    ws.addEventListener('message', (ev) => {
      let msg: any
      try { msg = JSON.parse(String(ev.data)) } catch { return }
      console.log('[GatewayChat] MSG:', msg.type, msg.event || msg.method || '', msg.ok ?? '', msg.error?.message || '')

      if (msg.type === 'event') {
        if (msg.event === 'connect.challenge') {
          const nonce = msg.payload?.nonce
          if (nonce) connectNonceRef.current = nonce
          sendConnect()
          return
        }
        if (msg.event === 'agent') {
          const p = msg.payload
          if (!p) return
          // Agent lifecycle: phase "start" = working, phase "end" = done
          if (p.stream === 'lifecycle' && p.data?.phase === 'start') {
            setStreaming(true)
          } else if (p.stream && p.stream !== 'lifecycle') {
            // Capture tool calls, thinking, etc. into thought box
            const detail = p.data?.text || p.data?.message || p.data?.status || p.data?.name
            if (detail) {
              setThoughtText(prev => prev + (prev ? '\n' : '') + `[${p.stream}] ${String(detail)}`)
              setStreaming(true)
            }
          } else if (p.stream === 'lifecycle' && p.data?.phase === 'end') {
            setStreaming(false); setStreamText(''); setThoughtText(''); setThoughtExpanded(false); runIdRef.current = null; fetchHistory()
            // Send the final response to relay by fetching latest from history
            if (relayRef.current) {
              wsRequest('chat.history', { sessionKey, limit: 5 }).then((result: any) => {
                const msgs = extractDisplayMessages(result.messages || [], messagePrefix)
                const last = msgs[msgs.length - 1]
                if (last && last.role === 'assistant' && last.content) {
                  relayRef.current?.sendFinal(last.content)
                }
                relayRef.current?.sendStatus('idle')
              }).catch(() => {
                relayRef.current?.sendStatus('idle')
              })
            }
          }
        }
        if (msg.event === 'chat') {
          const p = msg.payload
          if (!p || !(p.sessionKey === sessionKey || p.sessionKey === `agent:main:${sessionKey}`)) return
          if (p.state === 'delta') {
            const text = extractText(p.message)
            if (text !== null) {
              // Route deltas to thought box — only final goes in chat
              setThoughtText(text)
              setStreaming(true)
              relayRef.current?.sendDelta(text)
            }
          } else if (p.state === 'final') {
            const text = extractText(p.message)
            if (text !== null) relayRef.current?.sendFinal(text)
            setStreamText('')
          } else if (p.state === 'aborted') {
            setStreaming(false); setStreamText(''); runIdRef.current = null; fetchHistory()
            relayRef.current?.sendStatus('idle')
          } else if (p.state === 'error') {
            setStreaming(false); setStreamText(''); runIdRef.current = null
            relayRef.current?.sendError(p.errorMessage || 'Unknown error')
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${p.errorMessage || 'Unknown error'}`, timestamp: Date.now() }])
          }
        }
        return
      }

      if (msg.type === 'res') {
        const pending = pendingRef.current.get(msg.id)
        if (pending) {
          pendingRef.current.delete(msg.id)
          if (msg.ok) pending.resolve(msg.payload)
          else pending.reject(new Error(msg.error?.message || 'Request failed'))
        }
      }
    })

    ws.addEventListener('close', (ev) => {
      console.log('[GatewayChat] WebSocket CLOSED:', ev.code, ev.reason)
      if (!mountedRef.current) return
      setConnState('disconnected'); wsRef.current = null
      pendingRef.current.forEach(p => p.reject(new Error('Connection closed'))); pendingRef.current.clear()
      reconnectTimer.current = setTimeout(() => { if (mountedRef.current) connect() }, 3000)
    })

    ws.addEventListener('error', (ev) => { console.error('[GatewayChat] WebSocket ERROR:', ev) })
  }, [gatewayUrl, gatewayToken, sessionKey, fetchHistory])

  const [activeModel, setActiveModel] = useState<string | null>(null)

  // Execute the actual send after user confirms preflight estimate
  const executeSend = useCallback(async (text: string, currentAttachments: ChatAttachment[]) => {
    const hasAttachments = currentAttachments.length > 0

    // Auto-route to the right model based on complexity
    try {
      const tiers = await loadModelTiers(stateDir)
      if (tiers.length > 0) {
        const complexity = classifyComplexity(text || 'analyze this image')
        const tier = tiers.find(t => t.role === complexity) || tiers.find(t => t.role === 'balanced') || tiers[0]
        const modelId = `ollama/${tier.id}`
        if (modelId !== activeModel) {
          await wsRequest('session_status', { model: modelId })
          setActiveModel(modelId)
          console.log(`[GatewayChat] Auto-routed to ${modelId} (${complexity})`)
        }
      }
    } catch (e) {
      console.warn('[GatewayChat] Model routing failed, using default:', e)
    }

    const displayAttachments = currentAttachments.map(a => ({ mimeType: a.mimeType, fileName: a.fileName, dataUrl: a.dataUrl }))
    const userContent = text || (hasAttachments ? `📎 ${currentAttachments.map(a => a.fileName).join(', ')}` : '')
    const userAttachments = displayAttachments.length > 0 ? displayAttachments : undefined
    if (userAttachments?.length && userContent) {
      attachmentStoreRef.current.set(userContent.slice(0, 80), userAttachments)
      saveAttachmentStore()
    }
    setMessages(prev => [...prev, { role: 'user', content: userContent, attachments: userAttachments, timestamp: Date.now() }])
    setInput(''); setAttachments([]); setStreaming(true); setStreamText(''); setThoughtText(''); setThoughtExpanded(false)
    setThinkingQuote(THINKING_QUOTES[Math.floor(Math.random() * THINKING_QUOTES.length)])
    const idempotencyKey = uuid()
    runIdRef.current = idempotencyKey
    const fullMessage = messagePrefix ? `${messagePrefix}\n\n${text}` : text

    // Save all attachments to workspace uploads dir
    let messageWithFiles = fullMessage
    const savedImages: string[] = []
    const savedDocs: string[] = []
    for (const a of currentAttachments) {
      if (!a.dataUrl) continue
      try {
        const base64 = a.dataUrl.includes(',') ? a.dataUrl.split(',')[1] : a.dataUrl
        const safeName = a.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filePath = `${stateDir}/workspace/uploads/${safeName}`
        await window.electronAPI!.writeFile(filePath, base64)
        if (a.mimeType.startsWith('image/')) {
          savedImages.push(filePath)
        } else {
          savedDocs.push(filePath)
        }
        console.log(`[GatewayChat] Saved file: ${filePath}`)
      } catch (e) {
        console.error(`[GatewayChat] Failed to save file ${a.fileName}:`, e)
      }
    }
    if (savedImages.length > 0) {
      const fileList = savedImages.map(f => `- ${f}`).join('\n')
      messageWithFiles += `\n\nThe user has uploaded images. Use the \`image\` tool to analyze each one:\n${fileList}`
    }
    if (savedDocs.length > 0) {
      const fileList = savedDocs.map(f => `- ${f}`).join('\n')
      const hasPdf = savedDocs.some(f => f.toLowerCase().endsWith('.pdf'))
      messageWithFiles += `\n\nThe user has uploaded files:\n${fileList}`
      if (hasPdf) {
        messageWithFiles += `\nFor PDF files: use \`exec\` to convert to text first (e.g. \`pdftotext file.pdf file.txt\` — install with \`brew install poppler\` if needed), then \`read\` the .txt output.`
      } else {
        messageWithFiles += `\nUse \`read\` to access them.`
      }
    }

    try {
      await wsRequest('chat.send', { sessionKey, message: messageWithFiles, deliver: false, idempotencyKey })
    } catch (err: any) {
      setStreaming(false); setStreamText(''); setThoughtText(''); runIdRef.current = null
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() }])
    }
  }, [wsRequest, sessionKey, messagePrefix, stateDir, activeModel, saveAttachmentStore])

  // Send: get preflight estimate first, then show confirmation modal
  const send = useCallback(async () => {
    const text = input.trim()
    const currentAttachments = [...attachments]
    const hasAttachments = currentAttachments.length > 0
    if ((!text && !hasAttachments) || streaming || estimating) return
    const lower = text.toLowerCase()
    if (lower === '/stop' || lower === 'stop' || lower === 'abort') {
      try { await wsRequest('chat.abort', { sessionKey }) } catch {}
      setInput(''); return
    }

    // Get real estimate from lightweight model
    setEstimating(true)
    try {
      const estimate = await getPreflightEstimate(text || currentAttachments.map(a => a.fileName).join(' '), apiKey || '')
      setPendingConfirm({ text, attachments: currentAttachments, estimate })
    } catch (e) {
      console.warn('[GatewayChat] Estimate failed, proceeding directly:', e)
      await executeSend(text, currentAttachments)
    } finally {
      setEstimating(false)
    }
  }, [input, attachments, streaming, estimating, wsRequest, sessionKey, apiKey, executeSend])

  const abort = useCallback(async () => {
    try { await wsRequest('chat.abort', { sessionKey }) } catch {}
    setStreaming(false); setStreamText(''); setThoughtText(''); setThoughtExpanded(false); runIdRef.current = null
    fetchHistory()
  }, [wsRequest, sessionKey, fetchHistory])

  // --- Relay integration: expose send/abort/history to relay client ---
  const sendFromRelay = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return
    const fullMessage = messagePrefix ? `${messagePrefix}\n\n${text}` : text
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }])
    setStreaming(true); setStreamText('')
    setThinkingQuote(THINKING_QUOTES[Math.floor(Math.random() * THINKING_QUOTES.length)])
    const idempotencyKey = uuid()
    runIdRef.current = idempotencyKey
    relayRef.current?.sendStatus('streaming')
    try {
      await wsRequest('chat.send', { sessionKey, message: fullMessage, deliver: false, idempotencyKey })
    } catch (err: any) {
      setStreaming(false); setStreamText(''); runIdRef.current = null
      const errMsg = `Error: ${err.message}`
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg, timestamp: Date.now() }])
      relayRef.current?.sendError(err.message)
    }
  }, [streaming, wsRequest, sessionKey, messagePrefix, relay])

  const handleRelayHistory = useCallback(async (id: string) => {
    try {
      const result = await wsRequest('chat.history', { sessionKey, limit: 200 })
      const msgs = extractDisplayMessages(result.messages || [], messagePrefix) as ChatMessage[]
      relayRef.current?.sendHistory(id, msgs.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })))
    } catch {}
  }, [wsRequest, sessionKey, messagePrefix, relay])

  useEffect(() => {
    if (onRelaySendRef) onRelaySendRef.current = sendFromRelay
    if (onRelayAbortRef) onRelayAbortRef.current = abort
    if (onRelayHistoryRef) onRelayHistoryRef.current = handleRelayHistory
    return () => {
      if (onRelaySendRef) onRelaySendRef.current = null
      if (onRelayAbortRef) onRelayAbortRef.current = null
      if (onRelayHistoryRef) onRelayHistoryRef.current = null
    }
  }, [sendFromRelay, abort, handleRelayHistory])

  // Track streaming→idle transition for relay
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && relayRef.current) {
      relayRef.current.sendStatus('idle')
    }
    prevStreamingRef.current = streaming
  }, [streaming])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close(); wsRef.current = null
    }
  }, [connect])

  const statusColor = connState === 'connected' ? 'var(--accent-green)' : connState === 'connecting' ? 'var(--accent-yellow, #d29a22)' : 'var(--accent-red, #f85149)'
  const statusText = connState === 'connected' ? 'Connected' : connState === 'connecting' ? 'Connecting...' : error || 'Disconnected'

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }, [addFiles])
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) { e.preventDefault(); addFiles(files) }
  }, [addFiles])

  return (
    <div
      className="rounded-xl flex flex-col h-full relative"
      style={{ background: 'var(--bg-card)', border: dragOver ? '2px dashed var(--accent-blue)' : '1px solid var(--border-color)' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="text-center">
            <Paperclip size={32} style={{ color: 'var(--accent-blue)', margin: '0 auto 8px' }} />
            <p className="text-sm font-medium" style={{ color: '#fff' }}>Drop files here</p>
          </div>
        </div>
      )}

      {/* Preflight cost estimate modal */}
      {pendingConfirm && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="w-[440px] rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Cost Estimate</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {pendingConfirm.estimate.costExplanation}
            </p>
            <div className="mt-3 px-3 py-2 rounded-lg text-xs leading-relaxed" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Plan</div>
              {pendingConfirm.estimate.plan}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <div>Input: <strong>{pendingConfirm.estimate.estimatedInputTokens}</strong></div>
              <div>Output: <strong>{pendingConfirm.estimate.estimatedOutputTokens}</strong></div>
              <div>Est. cost: <strong>{pendingConfirm.estimate.estimatedInternalTokens} tokens</strong></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => setPendingConfirm(null)}
              >
                Don&apos;t proceed
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer' }}
                onClick={async () => {
                  const p = pendingConfirm
                  setPendingConfirm(null)
                  if (p) await executeSend(p.text, p.attachments)
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estimating indicator */}
      {estimating && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-teal)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Estimating cost...</span>
          </div>
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <Bot size={16} style={{ color: 'var(--accent-teal)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{title || 'Chat with local agent'}</span>
        {activeModel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-page)', color: 'var(--text-muted)' }}>
            {activeModel.replace('ollama/', '')}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {connState !== 'connected' && (
            <button onClick={connect} className="p-1 rounded hover:opacity-80" title="Reconnect">
              <RotateCcw size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} title={statusText} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-8">
            <Bot size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {connState === 'connected' ? `Send a message to your ${title ? 'cloud' : 'local'} agent` : connState === 'connecting' ? 'Connecting...' : `Not connected — check ${title ? 'cloud' : 'local'} agent is running`}
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
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {msg.attachments.map((att, j) => (
                    att.mimeType.startsWith('image/') && att.dataUrl ? (
                      <img key={j} src={att.dataUrl} alt={att.fileName} className="rounded-lg max-h-40 max-w-[200px] object-cover cursor-pointer" style={{ border: '1px solid var(--border-color)' }} onClick={() => window.open(att.dataUrl, '_blank')} />
                    ) : (
                      <div key={j} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px]" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <FileText size={12} />
                        <span className="truncate max-w-[120px]">{att.fileName}</span>
                      </div>
                    )
                  ))}
                </div>
              )}
              <div className="px-3 py-2 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap" style={{
                background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-page)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                border: msg.role === 'assistant' ? '1px solid var(--border-color)' : 'none',
              }}>
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

        {streaming && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg-strong)' }}>
              <Bot size={12} style={{ color: 'var(--accent-teal)' }} />
            </div>
            <div className="max-w-[85%] w-full">
              {/* Loading spinner with thinking quote */}
              <div className="px-3 py-2 rounded-xl flex flex-col items-center gap-2" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-teal)' }} />
                <span className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>"{thinkingQuote}"</span>
              </div>
              {/* Thought/process box — shows live streaming content */}
              {thoughtText && (
                <div className="mt-1.5 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-page)' }}>
                  <button
                    onClick={() => setThoughtExpanded(prev => !prev)}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium"
                    style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <span style={{ transform: thoughtExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                    Thinking & Process
                  </button>
                  {thoughtExpanded && (
                    <div className="px-2.5 pb-2 text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)', maxHeight: '200px', overflowY: 'auto', fontFamily: 'monospace' }}>
                      {thoughtText}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--border-color)' }}>
        {/* Attachment preview strip */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachments.map(att => (
              <div key={att.id} className="relative shrink-0 group">
                {att.mimeType.startsWith('image/') && att.dataUrl ? (
                  <img src={att.dataUrl} alt={att.fileName} className="h-16 w-16 rounded-lg object-cover" style={{ border: '1px solid var(--border-color)' }} />
                ) : (
                  <div className="h-16 w-16 rounded-lg flex flex-col items-center justify-center gap-1" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
                    <FileText size={16} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[9px] truncate max-w-[56px] px-1" style={{ color: 'var(--text-muted)' }}>{att.fileName.split('.').pop()}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'var(--accent-red, #f85149)' }}
                >
                  <X size={10} className="text-white" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 rounded-b-lg text-[8px] truncate text-center" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                  {att.fileName}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.html,.css,.zip"
            className="hidden"
            onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = '' } }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={connState !== 'connected' || attachments.length >= MAX_ATTACHMENTS}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-30 hover:opacity-80 transition-opacity"
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}
            title={`Attach files (${attachments.length}/${MAX_ATTACHMENTS})`}
          >
            <Paperclip size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            onPaste={handlePaste}
            placeholder={connState === 'connected' ? (attachments.length > 0 ? 'Add a message or send...' : 'Type a message...') : 'Connecting...'}
            disabled={connState !== 'connected'}
            className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
          />
          {streaming ? (
            <button onClick={abort} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-red, #f85149)' }} title="Stop">
              <Square size={12} className="text-white" fill="white" />
            </button>
          ) : (
            <button onClick={send} disabled={connState !== 'connected' || (!input.trim() && attachments.length === 0) || (attachments.length > 0 && attachments.some(a => !a.dataUrl))} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-30" style={{ background: 'var(--accent-blue)' }} title={attachments.length > 0 && attachments.some(a => !a.dataUrl) ? `Loading files (${attachments.filter(a => a.dataUrl).length}/${attachments.length})` : undefined}>
              <Send size={14} className="text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
