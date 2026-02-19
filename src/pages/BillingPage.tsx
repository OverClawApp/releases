import { useState, useEffect } from 'react'
import { API_BASE } from '../lib/api'
import { Check, Zap, Cloud, Crown, CreditCard, Coins, ArrowRight, Loader2, CheckCircle, PartyPopper } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getSubscription } from '../lib/db'
import { supabase } from '../lib/supabase'

const PROXY_BASE_URL = import.meta.env.VITE_API_URL || 'https://overclaw-api-production.up.railway.app'

const TOKEN_PACKS = [
  { tokens: 5000, price: 4.99, perToken: '~$1.00/1k', popular: false },
  { tokens: 15000, price: 9.99, perToken: '~$0.67/1k', popular: true },
  { tokens: 50000, price: 24.99, perToken: '~$0.50/1k', popular: false },
  { tokens: 150000, price: 59.99, perToken: '~$0.40/1k', popular: false },
]

export default function BillingPage() {
  const { user } = useAuth()
  const [currentPlan, setCurrentPlan] = useState<'free' | 'pro'>('free')
  const [tokenBalance, setTokenBalance] = useState(0)
  const [tokensUsed, setTokensUsed] = useState(0)
  const [totalRequests, setTotalRequests] = useState(0)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [successScreen, setSuccessScreen] = useState<{ type: 'pro' | 'tokens'; tokens?: string } | null>(null)
  const [countdown, setCountdown] = useState(5)

  // Check for payment success return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const billing = params.get('billing')
    if (billing === 'success') {
      const plan = params.get('plan')
      setSuccessScreen({ type: 'pro' })
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (billing === 'tokens-success') {
      const tokens = params.get('tokens') || ''
      setSuccessScreen({ type: 'tokens', tokens })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Countdown and reboot on success
  useEffect(() => {
    if (!successScreen) return
    if (countdown <= 0) {
      window.location.reload()
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [successScreen, countdown])

  useEffect(() => {
    const load = async () => {
      try {
        // Check subscription
        const sub = await getSubscription()
        if (sub?.plan === 'pro' && sub?.status === 'active') {
          setCurrentPlan('pro')
        }

        // Fetch token balance & usage
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const headers = { 'Authorization': `Bearer ${session.access_token}` }
          const [balRes, usageRes] = await Promise.all([
            fetch(`${PROXY_BASE_URL}/api/proxy/balance`, { headers }),
            fetch(`${PROXY_BASE_URL}/api/proxy/usage`, { headers }),
          ])
          if (balRes.ok) {
            const { balance } = await balRes.json()
            setTokenBalance(balance || 0)
          }
          if (usageRes.ok) {
            const { usage } = await usageRes.json()
            if (Array.isArray(usage)) {
              setTotalRequests(usage.length)
              let used = 0
              for (const log of usage) used += log.tokens_charged || 0
              setTokensUsed(used)
            }
          }
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const handleSubscribe = async () => {
    if (!user) return
    setCheckoutLoading('pro')
    try {
      const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', interval: 'monthly', userId: user.id, email: user.email }),
      })
      const data = await res.json()
      if (data.url) window.electronAPI?.exec('open "' + data.url + '"', []).catch(() => window.open(data.url, '_blank'))
    } catch (err) {
      console.error('Checkout error:', err)
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleBuyTokens = async (tokens: number, price: number) => {
    if (!user || currentPlan !== 'pro') return
    setCheckoutLoading(`tokens-${tokens}`)
    try {
      const res = await fetch(`${API_BASE}/api/stripe/checkout-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, price, userId: user.id, email: user.email }),
      })
      const data = await res.json()
      if (data.url) window.electronAPI?.exec('open "' + data.url + '"', []).catch(() => window.open(data.url, '_blank'))
    } catch (err) {
      console.error('Token checkout error:', err)
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleManage = async () => {
    if (!user) return
    try {
      const res = await fetch(`${API_BASE}/api/stripe/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.url) window.electronAPI?.exec('open "' + data.url + '"', []).catch(() => window.open(data.url, '_blank'))
    } catch {}
  }

  // Success screen
  if (successScreen) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <CheckCircle size={40} style={{ color: '#22c55e' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {successScreen.type === 'pro' ? 'Welcome to Pro!' : 'Tokens Added!'}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {successScreen.type === 'pro'
              ? 'Your Pro subscription is now active. Cloud AI and 2,000 tokens are ready to go.'
              : `${parseInt(successScreen.tokens || '0').toLocaleString()} tokens have been added to your balance.`}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
            Restarting in {countdown}s...
          </p>
          <div className="w-48 mx-auto h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-main)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${((5 - countdown) / 5) * 100}%`,
                background: '#22c55e',
                transition: 'width 1s linear',
              }}
            />
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 text-sm font-medium rounded-lg"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            Restart Now
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Billing</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
          Manage your plan and token balance
        </p>
      </div>

      {/* Current status banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CreditCard size={18} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
            Current plan: <strong style={{ color: currentPlan === 'pro' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
              {currentPlan === 'pro' ? 'Pro' : 'Free'}
            </strong>
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 8 }}>
            {tokenBalance.toLocaleString()} tokens remaining · {totalRequests} requests
          </span>
        </div>
        {currentPlan === 'pro' && (
          <button onClick={handleManage} style={{
            background: 'none', border: 'none', color: 'var(--accent-blue)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}>
            Manage subscription →
          </button>
        )}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 40 }}>
        {/* Free tier */}
        <div style={{
          flex: 1,
          background: 'var(--bg-card)',
          border: currentPlan === 'free' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
          borderRadius: 16,
          padding: 28,
          position: 'relative',
        }}>
          {currentPlan === 'free' && (
            <div style={{
              position: 'absolute', top: -12, left: 20,
              background: 'var(--accent-blue)', color: '#fff',
              fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 20,
            }}>Current Plan</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.1)' }}>
              <Zap size={20} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Free</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Local AI forever</div>
            </div>
          </div>

          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>$0</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Free forever</div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'Local AI models (Ollama)',
              'Unlimited local requests',
              'All local tools & skills',
              'Scheduled tasks',
              'Community support',
            ].map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                <Check size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 24 }}>
            <button disabled style={{
              width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid var(--border-color)',
              fontSize: 14, fontWeight: 600, cursor: 'default',
              background: 'var(--bg-page)', color: 'var(--text-muted)',
            }}>
              {currentPlan === 'free' ? '✓ Current Plan' : 'Downgrade'}
            </button>
          </div>
        </div>

        {/* Pro tier */}
        <div style={{
          flex: 1,
          background: 'var(--bg-card)',
          border: currentPlan === 'pro' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
          borderRadius: 16,
          padding: 28,
          position: 'relative',
        }}>
          {currentPlan === 'pro' ? (
            <div style={{
              position: 'absolute', top: -12, left: 20,
              background: 'var(--accent-blue)', color: '#fff',
              fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 20,
            }}>Current Plan</div>
          ) : (
            <div style={{
              position: 'absolute', top: -12, left: 20,
              background: 'var(--accent-blue)', color: '#fff',
              fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 20,
            }}>Recommended</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.1)' }}>
              <Crown size={20} style={{ color: '#6366f1' }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Pro</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cloud AI included</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)' }}>$24.99</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/mo</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--accent-blue)', marginBottom: 24 }}>Includes 2,000 free tokens/mo</div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'Everything in Free',
              'Cloud AI models (GPT, Claude, Gemini, etc.)',
              'Smart model routing',
              '2,000 tokens included monthly',
              'Buy additional tokens as needed',
              'Priority support',
              'All skills & tools',
            ].map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                <Check size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 24 }}>
            {currentPlan === 'pro' ? (
              <button disabled style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                fontSize: 14, fontWeight: 600, cursor: 'default',
                background: 'var(--bg-hover)', color: 'var(--text-muted)',
              }}>
                ✓ Current Plan
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={!!checkoutLoading}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--accent-blue)', color: '#fff',
                  opacity: checkoutLoading ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {checkoutLoading === 'pro' ? (
                  <Loader2 size={16} className="animate-spin" style={{ display: 'inline' }} />
                ) : (
                  <>Upgrade to Pro <ArrowRight size={14} style={{ display: 'inline', marginLeft: 4 }} /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Token Packs */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 16,
        padding: 28,
        marginBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Coins size={20} style={{ color: 'var(--accent-blue)' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Buy Tokens</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
          {currentPlan === 'pro'
            ? 'Top up your token balance. Tokens never expire.'
            : 'Upgrade to Pro to purchase additional tokens.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {TOKEN_PACKS.map(pack => (
            <div
              key={pack.tokens}
              style={{
                border: pack.popular ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                borderRadius: 12,
                padding: 20,
                textAlign: 'center',
                position: 'relative',
                opacity: currentPlan !== 'pro' ? 0.5 : 1,
                transition: 'transform 0.15s, box-shadow 0.15s',
                cursor: currentPlan === 'pro' ? 'pointer' : 'default',
              }}
              onMouseEnter={e => { if (currentPlan === 'pro') { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
              onClick={() => currentPlan === 'pro' && handleBuyTokens(pack.tokens, pack.price)}
            >
              {pack.popular && (
                <div style={{
                  position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--accent-blue)', color: '#fff',
                  fontSize: 10, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                }}>Best Value</div>
              )}
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {pack.tokens.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>tokens</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                ${pack.price}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pack.perToken}</div>
              <button
                disabled={currentPlan !== 'pro' || !!checkoutLoading}
                style={{
                  marginTop: 16, width: '100%', padding: '8px 0', borderRadius: 8,
                  border: 'none', fontSize: 13, fontWeight: 600, cursor: currentPlan === 'pro' ? 'pointer' : 'default',
                  background: currentPlan === 'pro' ? (pack.popular ? 'var(--accent-blue)' : 'var(--bg-hover)') : 'var(--bg-page)',
                  color: currentPlan === 'pro' ? (pack.popular ? '#fff' : 'var(--text-primary)') : 'var(--text-muted)',
                  transition: 'opacity 0.15s',
                }}
              >
                {checkoutLoading === `tokens-${pack.tokens}` ? (
                  <Loader2 size={14} className="animate-spin" style={{ display: 'inline' }} />
                ) : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Buy VPS — Coming Soon */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 16,
        padding: 28,
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Cloud size={20} style={{ color: '#8b5cf6' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Buy VPS</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
          Deploy your own cloud server with OverClaw pre-installed. Always-on AI with dedicated resources.
        </p>

        {/* Blurred content */}
        <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { name: 'Starter', cpu: '2 vCPU', ram: '4 GB', storage: '80 GB', price: '$12/mo' },
              { name: 'Standard', cpu: '4 vCPU', ram: '8 GB', storage: '160 GB', price: '$24/mo' },
              { name: 'Performance', cpu: '8 vCPU', ram: '16 GB', storage: '320 GB', price: '$48/mo' },
            ].map(vps => (
              <div key={vps.name} style={{
                border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{vps.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{vps.cpu} · {vps.ram} RAM</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{vps.storage} SSD</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{vps.price}</div>
                <button style={{
                  marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 8,
                  border: 'none', fontSize: 13, fontWeight: 600,
                  background: 'var(--bg-hover)', color: 'var(--text-primary)',
                }}>Deploy</button>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Soon overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(1px)',
          borderRadius: 16, zIndex: 10,
        }}>
          <span style={{
            fontSize: 16, fontWeight: 700, color: '#fff',
            background: '#8b5cf6', padding: '10px 28px', borderRadius: 24,
            letterSpacing: 0.5,
          }}>Coming Soon</span>
        </div>
      </div>

      {/* Usage summary */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 16,
        padding: 28,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, margin: 0 }}>Usage Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
          {[
            { label: 'Tokens Used', value: tokensUsed.toLocaleString(), color: '#f59e0b' },
            { label: 'Tokens Remaining', value: tokenBalance.toLocaleString(), color: '#22c55e' },
            { label: 'Total Requests', value: totalRequests.toLocaleString(), color: '#6366f1' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-page)', border: '1px solid var(--border-color)',
              borderRadius: 10, padding: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
