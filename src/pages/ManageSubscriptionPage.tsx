import { useState, useEffect } from 'react'
import { API_BASE } from '../lib/api'
import { CreditCard, ArrowLeft, Receipt, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { getSubscription, getUsageStats, getInvoices } from '../lib/db'
import { useAuth } from '../context/AuthContext'

const PLAN_PRICES: Record<string, number> = { local: 0, personal: 9, pro: 49, team: 129 }

interface Invoice {
  id: string
  amount: number
  status: string
  period_start: string
  period_end: string
  stripe_invoice_id: string | null
  created_at: string
}

export default function ManageSubscriptionPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<any>(null)
  const [usageStats, setUsageStats] = useState<any>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [showInvoices, setShowInvoices] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getSubscription(),
      getUsageStats('month'),
      getInvoices(),
    ]).then(([sub, usage, invs]) => {
      setSubscription(sub)
      setUsageStats(usage)
      setInvoices(invs || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const plan = subscription?.plan || 'local'
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)
  const interval = subscription?.billing_interval || 'monthly'
  const status = subscription?.status || 'active'
  const monthlyCost = PLAN_PRICES[plan] ?? 0
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—'
  const nextBilling = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  const totalRequests = usageStats?.totalRequests || 0
  const totalTokens = (usageStats?.totalInputTokens || 0) + (usageStats?.totalOutputTokens || 0)
  const totalCost = usageStats?.totalCost || 0

  const handleManagePayment = async () => {
    if (!subscription?.stripe_customer_id) return
    try {
      const res = await fetch(`${API_BASE}/api/stripe/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: subscription.stripe_customer_id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) {
      console.error('Portal error:', err)
    }
  }

  const handleCancel = async () => {
    if (!subscription?.stripe_subscription_id) return
    // Redirect to Stripe portal for cancellation
    handleManagePayment()
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 40, textAlign: 'center' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 mb-6 text-sm transition-opacity hover:opacity-70"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft size={16} /> Back to Billing
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Manage Subscription</h1>

      {/* Current Plan Card */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: 20 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-bg)' }}>
              <CreditCard size={20} style={{ color: 'var(--accent-blue)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Current Plan</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Member since {memberSince}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold" style={{ background: 'var(--accent-bg)', color: 'var(--accent-blue)' }}>
              {planLabel}
            </span>
            {status !== 'active' && (
              <span className="px-2 py-1 rounded-full text-[10px] font-medium" style={{ background: 'rgba(248,81,73,0.15)', color: 'var(--accent-red)' }}>
                {status}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-page)' }}>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Monthly Cost</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {monthlyCost === 0 ? 'Free' : `$${monthlyCost}`}
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-page)' }}>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Next Billing</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{nextBilling}</div>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-page)' }}>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Billing Cycle</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {plan === 'local' ? 'Free' : interval === 'annual' ? 'Annual' : 'Monthly'}
            </div>
          </div>
        </div>

        <button
          onClick={onBack}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-85"
          style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          {plan === 'local' ? 'Upgrade Plan' : 'Change Plan'}
        </button>
      </div>

      {/* Usage Overview */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: 20 }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Usage This Period</h2>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-page)' }}>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Requests</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{totalRequests.toLocaleString()}</div>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-page)' }}>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Tokens</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{totalTokens.toLocaleString()}</div>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-page)' }}>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>API Cost</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>${totalCost.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      {subscription?.stripe_customer_id && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: 20 }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Payment Method</h2>
          <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Managed by Stripe</span>
            <button
              onClick={handleManagePayment}
              className="text-xs font-medium"
              style={{ color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Manage →
            </button>
          </div>
        </div>
      )}

      {/* Invoice History */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: 20 }}>
        <button
          onClick={() => setShowInvoices(!showInvoices)}
          className="flex items-center justify-between w-full"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div className="flex items-center gap-2">
            <Receipt size={16} style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Invoice History</h2>
          </div>
          {showInvoices ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {showInvoices && (
          invoices.length === 0 ? (
            <div className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              No invoices yet
            </div>
          ) : (
            <div className="space-y-0">
              {invoices.map((inv, i) => (
                <div key={inv.id} className="flex items-center justify-between py-3" style={{ borderBottom: i < invoices.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {inv.stripe_invoice_id || inv.id.slice(0, 8)}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(inv.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' — '}
                      {new Date(inv.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>${inv.amount.toFixed(2)}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                      background: inv.status === 'paid' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
                      color: inv.status === 'paid' ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}>
                      {inv.status === 'paid' && <Check size={10} className="inline mr-0.5" />}
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Danger Zone — only show for paid plans */}
      {plan !== 'local' && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid rgba(248,81,73,0.3)', marginBottom: 20 }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} style={{ color: 'var(--accent-red)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--accent-red)' }}>Danger Zone</h2>
          </div>
          {!showCancel ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>Cancel Subscription</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Downgrade to Local (free) at end of billing period</div>
              </div>
              <button
                onClick={() => setShowCancel(true)}
                className="px-4 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)', cursor: 'pointer' }}
              >
                Cancel Plan
              </button>
            </div>
          ) : (
            <div className="rounded-lg p-4 space-y-3" style={{ background: 'rgba(248,81,73,0.05)', border: '1px solid rgba(248,81,73,0.2)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Are you sure? Your cloud bots and AWS nodes will be stopped at the end of your billing period. Local features will continue to work.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCancel(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium"
                  style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', background: 'transparent' }}
                >
                  Keep Plan
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--accent-red)', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
