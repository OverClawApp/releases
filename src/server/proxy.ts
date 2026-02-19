/**
 * AI Model Proxy — Routes requests to optimal providers based on task classification.
 * 
 * Flow: Auth (JWT) → Balance check → Classify → Route → Stream → Deduct tokens
 */

import type { Request, Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ─── Model Definitions ─────────────────────────────────────────────────────

interface ModelDef {
  id: string
  provider: string
  apiModel: string
  baseUrl: string
  envKey: string
  costPer1kInput: number   // cost in tokens (our currency) per 1k input tokens
  costPer1kOutput: number  // cost in tokens per 1k output tokens
  maxContext: number
  capabilities: string[]
}

const MODELS: Record<string, ModelDef> = {
  'claude-sonnet-4': {
    id: 'claude-sonnet-4',
    provider: 'anthropic',
    apiModel: 'claude-sonnet-4-20250514',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    costPer1kInput: 30,
    costPer1kOutput: 150,
    maxContext: 200000,
    capabilities: ['coding', 'reasoning', 'creative', 'vision'],
  },
  'gpt-4.1-mini': {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    apiModel: 'gpt-4.1-mini',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    costPer1kInput: 4,
    costPer1kOutput: 16,
    maxContext: 1000000,
    capabilities: ['coding', 'chat', 'quick'],
  },
  'gpt-4.1': {
    id: 'gpt-4.1',
    provider: 'openai',
    apiModel: 'gpt-4.1',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    costPer1kInput: 20,
    costPer1kOutput: 80,
    maxContext: 1000000,
    capabilities: ['coding', 'reasoning', 'creative'],
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    provider: 'google',
    apiModel: 'gemini-2.5-pro',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GOOGLE_API_KEY',
    costPer1kInput: 12,
    costPer1kOutput: 50,
    maxContext: 1000000,
    capabilities: ['reasoning', 'coding', 'vision', 'long-context'],
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    provider: 'google',
    apiModel: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GOOGLE_API_KEY',
    costPer1kInput: 1.5,
    costPer1kOutput: 6,
    maxContext: 1000000,
    capabilities: ['chat', 'quick', 'vision', 'long-context'],
  },
  'deepseek-r1': {
    id: 'deepseek-r1',
    provider: 'deepseek',
    apiModel: 'deepseek-reasoner',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    costPer1kInput: 5.5,
    costPer1kOutput: 22,
    maxContext: 64000,
    capabilities: ['reasoning', 'math', 'coding'],
  },
  'deepseek-chat': {
    id: 'deepseek-chat',
    provider: 'deepseek',
    apiModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    costPer1kInput: 1.4,
    costPer1kOutput: 5.6,
    maxContext: 64000,
    capabilities: ['chat', 'coding', 'quick'],
  },
  'kimi-k2': {
    id: 'kimi-k2',
    provider: 'kimi',
    apiModel: 'kimi-k2-0711-preview',
    baseUrl: 'https://api.moonshot.ai/v1',
    envKey: 'KIMI_API_KEY',
    costPer1kInput: 2,
    costPer1kOutput: 8,
    maxContext: 128000,
    capabilities: ['chat', 'coding', 'quick'],
  },
}

// ─── Task Categories → Model Routing ────────────────────────────────────────

type TaskCategory = 'coding-hard' | 'coding-simple' | 'reasoning' | 'math' | 'creative' | 'chat' | 'quick' | 'vision'

const CATEGORY_MODELS: Record<TaskCategory, string[]> = {
  // Keep high-quality models available, but bias cheaper/faster models first where possible
  'coding-hard':   ['gpt-4.1', 'claude-sonnet-4', 'gemini-2.5-pro'],
  'coding-simple': ['kimi-k2', 'gpt-4.1-mini', 'deepseek-chat'],
  'reasoning':     ['gemini-2.5-pro', 'deepseek-r1', 'gpt-4.1'],
  'math':          ['deepseek-r1', 'gemini-2.5-pro', 'gpt-4.1'],
  'creative':      ['gpt-4.1', 'claude-sonnet-4', 'gemini-2.5-pro'],
  'chat':          ['kimi-k2', 'gemini-2.5-flash', 'deepseek-chat'],
  'quick':         ['kimi-k2', 'gemini-2.5-flash', 'gpt-4.1-mini'],
  'vision':        ['gemini-2.5-flash', 'gemini-2.5-pro', 'claude-sonnet-4'],
}

// ─── Classifier ─────────────────────────────────────────────────────────────

const CLASSIFIER_PROMPT = `You are a task classifier for an AI routing system. Analyze the user's message and classify it into exactly ONE category.

Categories:
- coding-hard: Complex programming tasks (architecture, debugging, multi-file changes, algorithms, system design)
- coding-simple: Simple code questions, small scripts, syntax help, basic code generation
- reasoning: Complex analysis, research, planning, strategy, long documents, comparisons
- math: Mathematics, statistics, equations, proofs, numerical analysis
- creative: Writing, storytelling, poetry, brainstorming, marketing copy, creative content
- chat: Casual conversation, simple questions, greetings, opinions, recommendations
- quick: One-line answers, facts, definitions, translations, formatting, simple lookups
- vision: Image analysis, describing images, visual tasks (ONLY if message contains images)

Respond with ONLY the category name, nothing else. Examples:
"Write a REST API in Python with auth" → coding-hard
"What's the syntax for a for loop in JS?" → coding-simple  
"Compare the pros and cons of React vs Vue" → reasoning
"Solve this integral: ∫x²dx" → math
"Write a poem about the ocean" → creative
"Hey, how's it going?" → chat
"What's the capital of France?" → quick`

async function classifyTask(messages: any[]): Promise<TaskCategory> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return 'chat' // fallback

  // Extract just the last user message for classification
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMsg) return 'chat'

  // Check for images (both OpenAI format and inline markers)
  const hasImages = (Array.isArray(lastUserMsg.content) && 
    lastUserMsg.content.some((p: any) => p.type === 'image_url' || p.type === 'image')) ||
    (typeof lastUserMsg.content === 'string' && /\[IMAGE:/.test(lastUserMsg.content))
  if (hasImages) return 'vision'

  // Check for file attachments — route to reasoning (large context models like Gemini Pro)
  const hasFiles = typeof lastUserMsg.content === 'string' && /\[FILE:/.test(lastUserMsg.content)
  if (hasFiles) return 'reasoning'

  const content = typeof lastUserMsg.content === 'string' 
    ? lastUserMsg.content 
    : lastUserMsg.content?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ') || ''

  // Quick heuristic for obvious cases (skip LLM call)
  const lower = content.toLowerCase().trim()
  if (lower.length < 20 && /^(hi|hey|hello|sup|yo|morning|afternoon|evening|how are|what'?s up)/i.test(lower)) return 'chat'
  if (lower.length < 50 && /^(what is|who is|when did|where is|how many|define|translate)/i.test(lower)) return 'quick'

  // Prevent over-routing to expensive/hard categories for normal dev chat
  if (/(architecture|system design|refactor\s+entire|multi[-\s]?file|distributed system|performance tuning|big[-\s]?o|algorithmic optimization)/i.test(lower)) {
    return 'coding-hard'
  }
  if (/(code|coding|debug|bug|fix|function|api|react|next\.js|typescript|javascript|python|sql|npm|build|compile|install)/i.test(lower) && lower.length < 320) {
    return 'coding-simple'
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: CLASSIFIER_PROMPT },
          { role: 'user', content: content.slice(0, 500) }, // limit to 500 chars for speed
        ],
        max_tokens: 10,
        temperature: 0,
      }),
    })

    if (!res.ok) return 'chat'
    const data = await res.json() as any
    const category = (data.choices?.[0]?.message?.content || '').trim().toLowerCase() as TaskCategory
    if (CATEGORY_MODELS[category]) return category
    return 'chat'
  } catch {
    return 'chat'
  }
}

// ─── Provider API Calls ─────────────────────────────────────────────────────

// Multi-key round-robin: env vars like OPENAI_API_KEY, OPENAI_API_KEY_2, OPENAI_API_KEY_3, etc.
interface KeyPool {
  keys: string[]
  index: number
  cooldowns: Map<string, number> // key → timestamp when cooldown expires
}

const keyPools: Record<string, KeyPool> = {}

function getKeyPool(envKey: string): KeyPool {
  if (!keyPools[envKey]) {
    const keys: string[] = []
    // Primary key
    const primary = process.env[envKey]
    if (primary) keys.push(primary)
    // Additional keys: ENVKEY_2, ENVKEY_3, ... ENVKEY_20
    for (let i = 2; i <= 20; i++) {
      const k = process.env[`${envKey}_${i}`]
      if (k) keys.push(k)
    }
    keyPools[envKey] = { keys, index: 0, cooldowns: new Map() }
  }
  return keyPools[envKey]
}

function getApiKey(model: ModelDef): string | null {
  const pool = getKeyPool(model.envKey)
  if (pool.keys.length === 0) return null
  return pool.keys[0] // just check availability
}

function getNextApiKey(model: ModelDef): string | null {
  const pool = getKeyPool(model.envKey)
  if (pool.keys.length === 0) return null

  const now = Date.now()
  // Try keys starting from current index, skip cooled-down ones
  for (let i = 0; i < pool.keys.length; i++) {
    const idx = (pool.index + i) % pool.keys.length
    const key = pool.keys[idx]
    const cooldownUntil = pool.cooldowns.get(key) || 0
    if (now >= cooldownUntil) {
      pool.index = (idx + 1) % pool.keys.length
      return key
    }
  }
  // All keys are on cooldown — return the one with shortest remaining cooldown
  let bestKey = pool.keys[0]
  let bestTime = Infinity
  for (const key of pool.keys) {
    const cd = pool.cooldowns.get(key) || 0
    if (cd < bestTime) { bestTime = cd; bestKey = key }
  }
  return bestKey
}

function markKeyCooldown(model: ModelDef, key: string, retryAfterMs: number = 60000) {
  const pool = getKeyPool(model.envKey)
  pool.cooldowns.set(key, Date.now() + retryAfterMs)
  console.log(`[Proxy] Key cooldown: ${model.envKey} (${key.slice(0, 8)}...) for ${retryAfterMs}ms`)
}

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1000

function getCandidateModels(category: TaskCategory): ModelDef[] {
  const candidates: ModelDef[] = []
  const seen = new Set<string>()
  
  // Primary candidates for this category
  for (const modelId of (CATEGORY_MODELS[category] || CATEGORY_MODELS['chat'])) {
    const model = MODELS[modelId]
    if (model && getApiKey(model) && !seen.has(model.id)) {
      candidates.push(model)
      seen.add(model.id)
    }
  }
  // Fallback: any other available model
  for (const model of Object.values(MODELS)) {
    if (getApiKey(model) && !seen.has(model.id)) {
      candidates.push(model)
      seen.add(model.id)
    }
  }
  return candidates
}

interface StreamCallbacks {
  onChunk: (text: string) => void
  onRawChunk?: (chunk: any) => void  // Full parsed chunk for pass-through (tool_calls etc)
  onDone: (usage: { inputTokens: number; outputTokens: number }) => void
  onError: (error: string) => void
}

// Convert OpenAI image_url format to Anthropic image format
function convertToAnthropicContent(content: any): any {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content
  return content.map((part: any) => {
    if (part.type === 'text') return part
    if (part.type === 'image_url') {
      const url = part.image_url?.url || ''
      // data:image/png;base64,... → extract media type and base64
      const match = url.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        return {
          type: 'image',
          source: { type: 'base64', media_type: match[1], data: match[2] },
        }
      }
      // External URL — use url type
      return { type: 'image', source: { type: 'url', url } }
    }
    return part
  })
}

async function callAnthropicStream(model: ModelDef, messages: any[], cb: StreamCallbacks, apiKey?: string, extraParams?: Record<string, any>) {
  if (!apiKey) apiKey = getNextApiKey(model)!
  
  // Convert messages: separate system from rest
  const systemMsgs = messages.filter(m => m.role === 'system')
  const chatMsgs = messages.filter(m => m.role !== 'system')
  
  const body: any = {
    model: model.apiModel,
    max_tokens: 8192,
    stream: true,
    messages: chatMsgs.map(m => {
      // Tool results: convert OpenAI format to Anthropic format
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id || 'unknown', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
        }
      }
      // Assistant messages with tool_calls
      if (m.role === 'assistant' && m.tool_calls?.length) {
        const content: any[] = []
        if (typeof m.content === 'string' && m.content) content.push({ type: 'text', text: m.content })
        for (const tc of m.tool_calls) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input: JSON.parse(tc.function?.arguments || '{}') })
        }
        return { role: 'assistant', content }
      }
      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: convertToAnthropicContent(m.content),
      }
    }),
  }
  if (systemMsgs.length > 0) {
    body.system = systemMsgs.map(m => typeof m.content === 'string' ? m.content : '').join('\n')
  }
  // Convert OpenAI tool format to Anthropic format
  if (extraParams?.tools?.length) {
    body.tools = extraParams.tools.map((t: any) => ({
      name: t.function?.name || t.name,
      description: t.function?.description || t.description || '',
      input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
    }))
  }
  if (extraParams?.max_completion_tokens) body.max_tokens = extraParams.max_completion_tokens

  const res = await fetch(`${model.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10) * 1000
      markKeyCooldown(model, apiKey, retryAfter)
      throw Object.assign(new Error(`Anthropic rate limited (429)`), { rateLimited: true })
    }
    throw new Error(`Anthropic error ${res.status}: ${errText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No stream reader')

  const decoder = new TextDecoder()
  let buffer = ''
  let inputTokens = 0, outputTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const event = JSON.parse(data)
        if (event.type === 'content_block_delta' && event.delta?.text) {
          cb.onChunk(event.delta.text)
          if (cb.onRawChunk) {
            cb.onRawChunk({
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }],
            })
          }
        }
        // Forward tool_use blocks as OpenAI-format tool_calls
        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          if (cb.onRawChunk) {
            cb.onRawChunk({
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { tool_calls: [{ index: event.index || 0, id: event.content_block.id, type: 'function', function: { name: event.content_block.name, arguments: '' } }] }, finish_reason: null }],
            })
          }
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
          if (cb.onRawChunk) {
            cb.onRawChunk({
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { tool_calls: [{ index: event.index || 0, function: { arguments: event.delta.partial_json } }] }, finish_reason: null }],
            })
          }
        }
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0
        }
      } catch {}
    }
  }

  cb.onDone({ inputTokens, outputTokens })
}

async function callOpenAICompatibleStream(model: ModelDef, messages: any[], cb: StreamCallbacks, apiKey?: string, extraParams?: Record<string, any>) {
  if (!apiKey) apiKey = getNextApiKey(model)!
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }

  const body: Record<string, any> = {
    model: model.apiModel,
    messages,
    stream: true,
  }
  // Forward tools, max_completion_tokens, stream_options from gateway
  if (extraParams?.tools?.length) body.tools = extraParams.tools
  if (extraParams?.max_completion_tokens) body.max_completion_tokens = extraParams.max_completion_tokens
  else body.max_tokens = 8192
  if (extraParams?.stream_options) body.stream_options = extraParams.stream_options

  const res = await fetch(`${model.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10) * 1000
      markKeyCooldown(model, apiKey, retryAfter)
      throw Object.assign(new Error(`${model.provider} rate limited (429)`), { rateLimited: true })
    }
    throw new Error(`${model.provider} error ${res.status}: ${errText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No stream reader')

  const decoder = new TextDecoder()
  let buffer = ''
  let inputTokens = 0, outputTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const chunk = JSON.parse(data)
        if (cb.onRawChunk) cb.onRawChunk(chunk)
        const text = chunk.choices?.[0]?.delta?.content
        if (text) cb.onChunk(text)
        // Usage in final chunk (OpenAI includes it)
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0
          outputTokens = chunk.usage.completion_tokens || 0
        }
      } catch {}
    }
  }

  cb.onDone({ inputTokens, outputTokens })
}

// Strip image_url parts from messages for non-vision models
function stripImagesFromMessages(messages: any[]): any[] {
  return messages.map(m => {
    if (!Array.isArray(m.content)) return m
    const filtered = m.content.filter((p: any) => p.type !== 'image_url' && p.type !== 'image')
    if (filtered.length === 0) return { ...m, content: '' }
    if (filtered.length === 1 && filtered[0].type === 'text') return { ...m, content: filtered[0].text }
    return { ...m, content: filtered }
  }).filter(m => m.content !== '' && m.content !== null) // Remove empty messages
}

async function streamToProviderOnce(model: ModelDef, messages: any[], cb: StreamCallbacks, apiKey?: string, extraParams?: Record<string, any>) {
  // Strip images from messages for non-vision models to avoid 400 errors
  const hasVision = model.capabilities.includes('vision')
  const cleanMessages = hasVision ? messages : stripImagesFromMessages(messages)
  
  if (model.provider === 'anthropic') {
    await callAnthropicStream(model, cleanMessages, cb, apiKey, extraParams)
  } else {
    await callOpenAICompatibleStream(model, cleanMessages, cb, apiKey, extraParams)
  }
}

async function streamToProvider(model: ModelDef, messages: any[], cb: StreamCallbacks, extraParams?: Record<string, any>) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const key = getNextApiKey(model)
    if (!key) throw new Error(`No API key available for ${model.provider}`)
    try {
      await streamToProviderOnce(model, messages, cb, key, extraParams)
      return
    } catch (err: any) {
      if (err.rateLimited && attempt < MAX_RETRIES) {
        console.log(`[Proxy] Rate limited on ${model.id}, retrying with next key (attempt ${attempt + 1}/${MAX_RETRIES})...`)
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      throw err
    }
  }
}

// ─── Request Queue (per-provider concurrency control) ───────────────────────

interface QueueEntry {
  resolve: () => void
  reject: (err: Error) => void
  enqueueTime: number
}

interface ProviderQueue {
  active: number
  maxConcurrent: number
  waiting: QueueEntry[]
}

const QUEUE_TIMEOUT_MS = 30000 // max 30s wait in queue
const providerQueues: Record<string, ProviderQueue> = {}

function getProviderQueue(provider: string): ProviderQueue {
  if (!providerQueues[provider]) {
    // Scale max concurrent based on number of keys for this provider
    const envKeyMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
      kimi: 'KIMI_API_KEY',
    }
    const envKey = envKeyMap[provider] || 'UNKNOWN'
    const pool = getKeyPool(envKey)
    // Allow 3 concurrent per key (most providers allow ~5-10 concurrent)
    const maxConcurrent = Math.max(3, pool.keys.length * 3)
    providerQueues[provider] = { active: 0, maxConcurrent, waiting: [] }
  }
  return providerQueues[provider]
}

async function acquireSlot(provider: string): Promise<void> {
  const q = getProviderQueue(provider)
  if (q.active < q.maxConcurrent) {
    q.active++
    return
  }
  // Wait in queue
  return new Promise<void>((resolve, reject) => {
    const entry: QueueEntry = { resolve, reject, enqueueTime: Date.now() }
    q.waiting.push(entry)
    console.log(`[Queue] ${provider}: queued (${q.waiting.length} waiting, ${q.active} active)`)
    // Timeout
    setTimeout(() => {
      const idx = q.waiting.indexOf(entry)
      if (idx !== -1) {
        q.waiting.splice(idx, 1)
        reject(new Error(`Queue timeout: waited ${QUEUE_TIMEOUT_MS}ms for ${provider} slot`))
      }
    }, QUEUE_TIMEOUT_MS)
  })
}

function releaseSlot(provider: string) {
  const q = getProviderQueue(provider)
  q.active = Math.max(0, q.active - 1)
  // Drain waiting queue
  while (q.waiting.length > 0 && q.active < q.maxConcurrent) {
    const next = q.waiting.shift()!
    // Check if it hasn't timed out
    if (Date.now() - next.enqueueTime < QUEUE_TIMEOUT_MS) {
      q.active++
      next.resolve()
    }
  }
}

// Wrap streamToProvider with queue
const _streamToProviderRaw = streamToProvider
async function streamToProviderQueued(model: ModelDef, messages: any[], cb: StreamCallbacks, extraParams?: Record<string, any>) {
  await acquireSlot(model.provider)
  try {
    await _streamToProviderRaw(model, messages, cb, extraParams)
  } finally {
    releaseSlot(model.provider)
  }
}

// ─── Supabase Token Balance ─────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

async function verifyAuthAndGetUserId(authHeader: string | undefined): Promise<{ userId: string } | { error: string }> {
  if (!authHeader?.startsWith('Bearer ')) return { error: 'Missing auth token' }
  const token = authHeader.slice(7)
  
  const supabase = getSupabase()
  if (!supabase) return { error: 'Server not configured' }

  // Check if it's an OverClaw API key (oc_...)
  if (token.startsWith('oc_')) {
    const { data } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('api_key', token)
      .single()
    if (data?.user_id) return { userId: data.user_id }
    return { error: 'Invalid API key' }
  }

  // Otherwise treat as Supabase JWT
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { error: 'Invalid auth token' }
  
  return { userId: data.user.id }
}

async function getTokenBalance(userId: string): Promise<number> {
  const supabase = getSupabase()
  if (!supabase) return 0
  
  const { data } = await supabase
    .from('token_balances')
    .select('balance')
    .eq('user_id', userId)
    .single()
  
  return data?.balance || 0
}

async function deductTokens(userId: string, amount: number, model: string, inputTokens: number, outputTokens: number): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  // Deduct from balance
  await supabase.rpc('deduct_tokens', { p_user_id: userId, p_amount: Math.ceil(amount) })

  // Log usage
  await supabase.from('usage_logs').insert({
    user_id: userId,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    tokens_charged: Math.ceil(amount),
    created_at: new Date().toISOString(),
  })
}

function calculateTokenCost(model: ModelDef, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * model.costPer1kInput + (outputTokens / 1000) * model.costPer1kOutput
}

// ─── Extract inline images/files from message text ──────────────────────────
// Client embeds as [IMAGE:data:mime;base64,...] and [FILE:name:data:mime;base64,...]
function extractInlineMedia(messages: any[]): any[] {
  const IMAGE_RE = /\[IMAGE:(data:[^\]]+)\]/g
  const FILE_RE = /\[FILE:([^:]+):(data:[^\]]+)\]/g
  return messages.map(m => {
    if (typeof m.content !== 'string') return m
    const imageMatches = [...m.content.matchAll(IMAGE_RE)]
    const fileMatches = [...m.content.matchAll(FILE_RE)]
    if (imageMatches.length === 0 && fileMatches.length === 0) return m

    // Strip markers from text
    let textContent = m.content.replace(IMAGE_RE, '').replace(FILE_RE, '').trim()

    // Decode file attachments (PDF, text, etc.) to text
    for (const match of fileMatches) {
      const fileName = match[1]
      const dataUrl = match[2]
      try {
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        const decoded = Buffer.from(base64, 'base64')
        // For text-based files, include content directly
        const mime = dataUrl.match(/^data:([^;]+)/)?.[1] || ''
        if (mime === 'application/pdf') {
          // Extract readable text from PDF (basic: grab text between stream markers)
          const pdfText = decoded.toString('latin1')
          const textChunks: string[] = []
          // Extract text objects from PDF streams
          const btMatches = pdfText.matchAll(/BT\s([\s\S]*?)ET/g)
          for (const bt of btMatches) {
            const tjMatches = bt[1].matchAll(/\(([^)]*)\)\s*Tj/g)
            for (const tj of tjMatches) textChunks.push(tj[1])
            const tdMatches = bt[1].matchAll(/\[([^\]]*)\]\s*TJ/g)
            for (const td of tdMatches) {
              const parts = td[1].matchAll(/\(([^)]*)\)/g)
              for (const p of parts) textChunks.push(p[1])
            }
          }
          const extracted = textChunks.join(' ').trim()
          if (extracted) {
            textContent += `\n\n--- Content of ${fileName} ---\n${extracted}\n--- End of ${fileName} ---`
          } else {
            textContent += `\n\n[Attached file: ${fileName} (PDF, could not extract text)]`
          }
        } else {
          // Text-based files
          const text = decoded.toString('utf-8')
          textContent += `\n\n--- Content of ${fileName} ---\n${text}\n--- End of ${fileName} ---`
        }
      } catch (e) {
        textContent += `\n\n[Attached file: ${fileName} (could not decode)]`
      }
    }

    if (imageMatches.length === 0) return { ...m, content: textContent }

    // Build multimodal content parts for images
    const parts: any[] = []
    if (textContent) parts.push({ type: 'text', text: textContent })
    for (const match of imageMatches) {
      parts.push({ type: 'image_url', image_url: { url: match[1] } })
    }
    return { ...m, content: parts }
  })
}

// ─── Proxy Endpoint ─────────────────────────────────────────────────────────

export async function handleProxy(req: Request, res: Response) {
  const { messages: rawMessages, stream = true, model: requestedModel, tools, max_completion_tokens, stream_options } = req.body
  const extraParams = { tools, max_completion_tokens, stream_options }
  console.log(`[Proxy] Request body keys: ${Object.keys(req.body).join(', ')}`)
  if (!rawMessages || !Array.isArray(rawMessages)) {
    return res.status(400).json({ error: { message: 'messages array required' } })
  }
  // Extract inline [IMAGE:...] and [FILE:...] markers into proper content parts
  const messages = extractInlineMedia(rawMessages)

  // Debug: log message content types
  console.log(`[Proxy] ${messages.length} messages total`)
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      const types = m.content.map((p: any) => `${p.type}${p.type === 'image_url' ? '('+((p.image_url?.url||'').substring(0,30))+'...)' : p.type === 'text' ? '("'+String(p.text||'').substring(0,80)+'")' : ''}`).join(', ')
      console.log(`[Proxy] Message role=${m.role} content: [${types}]`)
    } else {
      const preview = String(m.content || '').substring(0, 200)
      console.log(`[Proxy] Message role=${m.role} content type: ${typeof m.content}, len=${String(m.content || '').length}, preview: ${preview}`)
    }
  }

  // Auth
  const authResult = await verifyAuthAndGetUserId(req.headers.authorization)
  if ('error' in authResult) {
    return res.status(401).json({ error: { message: authResult.error } })
  }
  const { userId } = authResult

  // Balance check
  const balance = await getTokenBalance(userId)
  if (balance < 2000) {
    return res.status(402).json({ error: { message: 'Insufficient token balance. Please purchase more tokens.' } })
  }

  // Classify
  const category = await classifyTask(messages)

  // Get ordered candidate models for this category
  const candidates = getCandidateModels(category)
  if (candidates.length === 0) {
    return res.status(503).json({ error: { message: 'No available model. Server misconfigured.' } })
  }
  console.log(`[Proxy] Classified as: ${category}, candidates: ${candidates.map(m => m.id).join(', ')}`)

  if (stream) {
    // SSE streaming response (OpenAI-compatible format)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Task-Category', category)

    const runId = `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Try each candidate model, falling back on provider errors
    let succeeded = false
    for (const model of candidates) {
      if (succeeded) break
      console.log(`[Proxy] Trying: ${model.id} (${model.provider})`)

      try {
        await new Promise<void>((resolve, reject) => {
          let gotContent = false
          streamToProviderQueued(model, messages, {
            onChunk: (text) => {
              if (!gotContent) {
                res.setHeader('X-Model-Used', model.id)
                gotContent = true
              }
            },
            onRawChunk: (chunk) => {
              // Forward raw chunk from provider (preserves tool_calls, content, etc.)
              if (!gotContent) {
                res.setHeader('X-Model-Used', model.id)
                gotContent = true
              }
              // Override model name and id for consistency
              chunk.id = runId
              chunk.model = model.id
              res.write(`data: ${JSON.stringify(chunk)}\n\n`)
            },
            onDone: async ({ inputTokens, outputTokens }) => {
              // Provider stream already ended; just send [DONE] and close
              res.write('data: [DONE]\n\n')
              res.end()

              const cost = calculateTokenCost(model, inputTokens, outputTokens)
              await deductTokens(userId, cost, model.id, inputTokens, outputTokens).catch(e =>
                console.error('[Proxy] Failed to deduct tokens:', e)
              )
              console.log(`[Proxy] Done: ${model.id} in=${inputTokens} out=${outputTokens} cost=${Math.ceil(cost)} tokens`)
              succeeded = true
              resolve()
            },
            onError: (error) => {
              console.warn(`[Proxy] ${model.id} failed: ${error}`)
              // If we already sent content to the client, we can't retry — surface the error
              if (gotContent) {
                const errChunk = {
                  id: runId,
                  object: 'chat.completion.chunk',
                  model: model.id,
                  choices: [{ index: 0, delta: { content: `\n\n[Error: ${error}]` }, finish_reason: 'stop' }],
                }
                res.write(`data: ${JSON.stringify(errChunk)}\n\n`)
                res.write('data: [DONE]\n\n')
                res.end()
                succeeded = true
                resolve()
              } else {
                // No content sent yet — reject to try next model
                reject(new Error(error))
              }
            },
          }, extraParams).catch(reject)
        })
      } catch (err: any) {
        console.warn(`[Proxy] Fallback from ${model.id}: ${err.message}`)
        continue
      }
    }

    if (!succeeded) {
      if (!res.headersSent) {
        res.status(502).json({ error: { message: 'All models failed. Please try again.' } })
      } else if (!res.writableEnded) {
        const errChunk = {
          id: runId,
          object: 'chat.completion.chunk',
          model: 'unknown',
          choices: [{ index: 0, delta: { content: '\n\n[Error: All models failed. Please try again.]' }, finish_reason: 'stop' }],
        }
        res.write(`data: ${JSON.stringify(errChunk)}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      }
    }
  } else {
    // Non-streaming response — try candidates with fallback
    for (const model of candidates) {
      try {
        let fullText = ''
        let finalUsage = { inputTokens: 0, outputTokens: 0 }

        await new Promise<void>((resolve, reject) => {
          streamToProviderQueued(model, messages, {
            onChunk: (text) => { fullText += text },
            onDone: ({ inputTokens, outputTokens }) => { finalUsage = { inputTokens, outputTokens }; resolve() },
            onError: (error) => { reject(new Error(error)) },
          }, extraParams).catch(reject)
        })

        const cost = calculateTokenCost(model, finalUsage.inputTokens, finalUsage.outputTokens)
        await deductTokens(userId, cost, model.id, finalUsage.inputTokens, finalUsage.outputTokens).catch(() => {})

        return res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model.id,
          choices: [{ index: 0, message: { role: 'assistant', content: fullText }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: finalUsage.inputTokens,
            completion_tokens: finalUsage.outputTokens,
            total_tokens: finalUsage.inputTokens + finalUsage.outputTokens,
          },
        })
      } catch (err: any) {
        console.warn(`[Proxy] Non-stream fallback from ${model.id}: ${err.message}`)
        continue
      }
    }

    res.status(502).json({ error: { message: 'All models failed. Please try again.' } })
  }
}

// ─── Web Search Proxy ───────────────────────────────────────────────────────

export async function handleWebSearch(req: Request, res: Response) {
  const { query, count = 5 } = req.body
  if (!query) return res.status(400).json({ error: { message: 'query is required' } })

  // Auth
  const authResult = await verifyAuthAndGetUserId(req.headers.authorization)
  if ('error' in authResult) return res.status(401).json({ error: { message: authResult.error } })

  try {
    // Use DuckDuckGo HTML search (free, no API key)
    const params = new URLSearchParams({ q: query })
    const ddgRes = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OverClaw/1.0)',
        'Accept': 'text/html',
      },
    })

    if (!ddgRes.ok) {
      return res.status(ddgRes.status).json({ error: { message: `Search failed: ${ddgRes.status}` } })
    }

    const html = await ddgRes.text()

    // Parse results from DuckDuckGo HTML response
    const results: { title: string; url: string; description: string }[] = []
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    let match
    while ((match = resultRegex.exec(html)) !== null && results.length < count) {
      const rawUrl = match[1]
      const title = match[2].replace(/<[^>]+>/g, '').trim()
      const description = match[3].replace(/<[^>]+>/g, '').trim()

      // DDG wraps URLs in a redirect — extract the actual URL
      let url = rawUrl
      try {
        const parsed = new URL(rawUrl, 'https://duckduckgo.com')
        url = parsed.searchParams.get('uddg') || rawUrl
      } catch { /* use raw */ }

      if (title && url) results.push({ title, url, description })
    }

    // Fallback: try simpler pattern if above didn't match
    if (results.length === 0) {
      const simpleRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
      while ((match = simpleRegex.exec(html)) !== null && results.length < count) {
        const rawUrl = match[1]
        const title = match[2].replace(/<[^>]+>/g, '').trim()
        let url = rawUrl
        try {
          const parsed = new URL(rawUrl, 'https://duckduckgo.com')
          url = parsed.searchParams.get('uddg') || rawUrl
        } catch { /* use raw */ }
        if (title && url) results.push({ title, url, description: '' })
      }
    }

    // Deduct 1 token for the search
    await deductTokens(authResult.userId, 1, 'web-search', 0, 0).catch(() => {})

    res.json({ results, query })
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } })
  }
}

export async function handleWebFetch(req: Request, res: Response) {
  const { url, maxChars = 50000 } = req.body
  if (!url) return res.status(400).json({ error: { message: 'url is required' } })

  // Auth
  const authResult = await verifyAuthAndGetUserId(req.headers.authorization)
  if ('error' in authResult) return res.status(401).json({ error: { message: authResult.error } })

  try {
    const fetchRes = await fetch(url, {
      headers: { 'User-Agent': 'OverClaw/1.0 (compatible; bot)' },
      redirect: 'follow',
    })

    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({ error: { message: `Fetch failed: ${fetchRes.status}` } })
    }

    const contentType = fetchRes.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return res.json({ url, content: `[Non-text content: ${contentType}]`, truncated: false })
    }

    let text = await fetchRes.text()
    const truncated = text.length > maxChars
    if (truncated) text = text.slice(0, maxChars)

    // Basic HTML → text stripping
    text = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Deduct 1 token
    await deductTokens(authResult.userId, 1, 'web-fetch', 0, 0).catch(() => {})

    res.json({ url, content: text, truncated })
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } })
  }
}

// ─── Balance & Usage Endpoints ──────────────────────────────────────────────

export async function handleGetBalance(req: Request, res: Response) {
  const authResult = await verifyAuthAndGetUserId(req.headers.authorization)
  if ('error' in authResult) return res.status(401).json({ error: authResult.error })
  
  const balance = await getTokenBalance(authResult.userId)
  res.json({ balance })
}

export async function handleGetUsage(req: Request, res: Response) {
  const authResult = await verifyAuthAndGetUserId(req.headers.authorization)
  if ('error' in authResult) return res.status(401).json({ error: authResult.error })

  const supabase = getSupabase()
  if (!supabase) return res.json({ usage: [] })

  const { data } = await supabase
    .from('usage_logs')
    .select('*')
    .eq('user_id', authResult.userId)
    .order('created_at', { ascending: false })
    .limit(100)

  res.json({ usage: data || [] })
}

export async function handleGetApiKey(req: Request, res: Response) {
  const authResult = await verifyAuthAndGetUserId(req.headers.authorization)
  if ('error' in authResult) return res.status(401).json({ error: authResult.error })

  const supabase = getSupabase()
  if (!supabase) return res.status(503).json({ error: 'Server not configured' })

  // Get or create API key
  let { data } = await supabase
    .from('user_api_keys')
    .select('api_key')
    .eq('user_id', authResult.userId)
    .single()

  if (!data) {
    const { data: newKey } = await supabase
      .from('user_api_keys')
      .insert({ user_id: authResult.userId })
      .select('api_key')
      .single()
    data = newKey
  }

  res.json({ apiKey: data?.api_key || null })
}

// ─── Project Planner ────────────────────────────────────────────────────────

const PROJECT_PLANNER_PROMPT = `You are a project planner for an AI coding agent system. Given a project name and description, break it down into sequential, actionable tasks.

Each task should have:
- title: Short, clear task name
- description: Specific instructions an AI agent can follow to complete this task
- estimatedMinutes: Realistic time for an AI coding agent (typically 2-30 min per task)
- dependencies: Array of task indices (0-based) that must complete before this task can start

Rules:
- Return 5-15 tasks
- Order logically: setup → implementation → testing → deployment
- Be specific and actionable — each task should be a single unit of work
- Include setup, core implementation, integration, testing, and documentation phases
- Dependencies should form a valid DAG (no cycles)
- Return ONLY valid JSON, no markdown or explanation

Return format: { "tasks": [{ "title": "...", "description": "...", "estimatedMinutes": N, "dependencies": [] }] }`

export async function handleProjectPlan(req: Request, res: Response) {
  const authResult = await verifyAuthAndGetUserId(req.headers.authorization)
  if ('error' in authResult) return res.status(401).json({ error: authResult.error })

  const { name, description } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Project name is required' })

  // Check balance
  const balance = await getTokenBalance(authResult.userId)
  if (balance < 500) return res.status(402).json({ error: 'Insufficient token balance (need 500 tokens)' })

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return res.status(503).json({ error: 'Planning service unavailable' })

  try {
    const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: PROJECT_PLANNER_PROMPT },
          { role: 'user', content: `Project: ${name}\n\nDescription: ${description || 'No description provided'}` },
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })

    if (!apiRes.ok) {
      const err = await apiRes.text()
      console.error('[ProjectPlan] OpenAI error:', err)
      return res.status(502).json({ error: 'Planning service error' })
    }

    const data = await apiRes.json() as any
    const content = data.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    const tasks = parsed.tasks || []

    // Deduct tokens
    const inputTokens = data.usage?.prompt_tokens || 0
    const outputTokens = data.usage?.completion_tokens || 0
    await deductTokens(authResult.userId, 500, 'gpt-4.1-mini', inputTokens, outputTokens)

    res.json({ tasks })
  } catch (err) {
    console.error('[ProjectPlan] Error:', err)
    res.status(500).json({ error: 'Failed to generate project plan' })
  }
}

export async function handleGetModels(_req: Request, res: Response) {
  const available = Object.values(MODELS)
    .filter(m => getApiKey(m))
    .map(m => ({
      id: m.id,
      provider: m.provider,
      capabilities: m.capabilities,
      maxContext: m.maxContext,
    }))
  
  res.json({ models: available, routing: CATEGORY_MODELS })
}
