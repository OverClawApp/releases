import { supabase } from './supabase'

// ─── Profile ───
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) throw error
  return data
}

export async function updateProfile(updates: { display_name?: string; avatar_url?: string; timezone?: string }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function uploadAvatar(file: File) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const ext = file.name.split('.').pop()
  const path = `${user.id}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = data.publicUrl + '?t=' + Date.now()

  await updateProfile({ avatar_url: url })
  return url
}

// ─── Preferences (stored as JSONB on profiles) ───
export async function getPreferences() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', user.id)
    .single()

  if (error) throw error
  return data?.preferences || {}
}

export async function updatePreferences(prefs: Record<string, any>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Merge with existing preferences
  const existing = await getPreferences()
  const merged = { ...existing, ...prefs }

  const { error } = await supabase
    .from('profiles')
    .update({ preferences: merged })
    .eq('id', user.id)

  if (error) throw error
  return merged
}

// ─── Subscription ───
export async function getSubscription() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) throw error
  return data
}

export async function updateSubscription(updates: Record<string, any>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Bots ───
export async function getBots() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('bots')
    .select('*, node:nodes(id, name, status)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createBot(bot: { name: string; description?: string; model?: string; system_prompt?: string; node_id?: string; budget_limit?: number }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('bots')
    .insert({ ...bot, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateBot(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase
    .from('bots')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteBot(id: string) {
  const { error } = await supabase
    .from('bots')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ─── Nodes ───
export async function getNodes() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('nodes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createNode(node: { name: string; type?: string; region?: string }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('nodes')
    .insert({ ...node, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateNode(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase
    .from('nodes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteNode(id: string) {
  const { error } = await supabase
    .from('nodes')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ─── Usage ───
export async function recordUsage(record: { bot_id?: string; node_id?: string; model?: string; input_tokens?: number; output_tokens?: number; cost?: number; request_type?: string }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('usage_records')
    .insert({ ...record, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getUsageStats(period: 'day' | 'week' | 'month' = 'month') {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  let since: Date
  if (period === 'day') since = new Date(now.getTime() - 86400000)
  else if (period === 'week') since = new Date(now.getTime() - 7 * 86400000)
  else since = new Date(now.getFullYear(), now.getMonth(), 1)

  const { data, error } = await supabase
    .from('usage_records')
    .select('*')
    .eq('user_id', user.id)
    .gte('created_at', since.toISOString())

  if (error) throw error

  const records = data || []
  const totalRequests = records.length
  const totalInputTokens = records.reduce((s, r) => s + (r.input_tokens || 0), 0)
  const totalOutputTokens = records.reduce((s, r) => s + (r.output_tokens || 0), 0)
  const totalCost = records.reduce((s, r) => s + (r.cost || 0), 0)

  // Most used bot
  const botCounts: Record<string, number> = {}
  records.forEach(r => { if (r.bot_id) botCounts[r.bot_id] = (botCounts[r.bot_id] || 0) + 1 })
  const mostUsedBotId = Object.entries(botCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  // Most used model
  const modelCounts: Record<string, number> = {}
  records.forEach(r => { if (r.model) modelCounts[r.model] = (modelCounts[r.model] || 0) + 1 })
  const mostUsedModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  return { totalRequests, totalInputTokens, totalOutputTokens, totalCost, mostUsedBotId, mostUsedModel }
}

// ─── Invoices ───
export async function getInvoices() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// ─── API Keys ───
export async function getApiKeys() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, provider, created_at, updated_at')
    .eq('user_id', user.id)

  if (error) throw error
  return data || []
}

export async function saveApiKey(provider: string, encryptedKey: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('api_keys')
    .upsert({ user_id: user.id, provider, encrypted_key: encryptedKey }, { onConflict: 'user_id,provider' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteApiKey(provider: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)

  if (error) throw error
}
