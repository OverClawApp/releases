import { useState, useEffect, useCallback } from 'react'
import { Trash2, Loader2, User, Bell, Shield, Palette, Moon, Sun, Monitor, AlertTriangle, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getProfile, updateProfile, uploadAvatar, getPreferences, updatePreferences } from '../lib/db'

type SettingsTab = 'profile' | 'notifications' | 'appearance' | 'security'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'security', label: 'Security', icon: Shield },
  ]

  return (
    <div className="flex gap-6 max-w-4xl">
      {/* Sidebar tabs */}
      <div className="w-48 shrink-0 flex flex-col gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
            style={{
              color: activeTab === id ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: activeTab === id ? 'var(--accent-bg)' : 'transparent',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}

        {/* About */}
        <div className="mt-auto pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div className="px-3 space-y-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <div className="font-medium text-xs" style={{ color: 'var(--text-secondary)' }}>OverClaw</div>
            <div>v2026.2.9</div>
            <div>{navigator.platform}</div>
            <div style={{ color: 'var(--accent-green)' }}>Supabase Connected</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {activeTab === 'profile' && <ProfileSettings />}
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'appearance' && <AppearanceSettings />}
        {activeTab === 'security' && <SecuritySettings />}
      </div>
    </div>
  )
}

/* ─── Profile ─── */
function ProfileSettings() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [timezone, setTimezone] = useState('Europe/London')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Load profile from Supabase profiles table
  useEffect(() => {
    if (user) {
      setEmail(user.email || '')
      getProfile().then(profile => {
        if (profile) {
          setDisplayName(profile.display_name || '')
          setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London')
          setAvatarUrl(profile.avatar_url || null)
        }
      }).catch(() => {
        // Fallback to auth metadata
        setDisplayName(user.user_metadata?.display_name || '')
        setTimezone(user.user_metadata?.timezone || 'Europe/London')
        setAvatarUrl(user.user_metadata?.avatar_url || null)
      })
    }
  }, [user])

  const getInitials = () => {
    if (displayName) {
      return displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    if (email) return email[0].toUpperCase()
    return '?'
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // Update profiles table
      await updateProfile({ display_name: displayName, timezone })

      // Update email if changed
      if (email !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email })
        if (emailError) throw emailError
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB')
      return
    }

    setUploadingAvatar(true)
    setError(null)
    try {
      const url = await uploadAvatar(file)
      setAvatarUrl(url)
    } catch (err: any) {
      setError(err.message || 'Failed to upload avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure? This will permanently delete your account and all associated data.')) return
    // Account deletion would typically go through a server-side function
    setError('Account deletion requires confirmation via email. Please contact support.')
  }

  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
  const lastSignIn = user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const provider = user?.app_metadata?.provider || 'email'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Profile</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Manage your account details and preferences</p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-xs" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
          {error}
        </div>
      )}

      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        {/* Avatar */}
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover" style={{ border: '2px solid var(--border-color)' }} />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold" style={{ background: 'var(--accent-bg-strong)', color: 'var(--accent-blue)' }}>
              {getInitials()}
            </div>
          )}
          <div>
            <label className="px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer inline-block" style={{ background: 'var(--accent-blue)', color: '#fff', opacity: uploadingAvatar ? 0.5 : 1 }}>
              {uploadingAvatar ? 'Uploading...' : 'Change Avatar'}
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploadingAvatar} />
            </label>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>JPG, PNG or GIF. Max 2MB.</p>
          </div>
        </div>

        <InputField label="Display Name" value={displayName} onChange={setDisplayName} placeholder="Your display name" />
        <InputField label="Email Address" value={email} onChange={setEmail} type="email" />

        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Timezone</label>
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="Europe/London">Europe/London (GMT/BST)</option>
            <option value="America/New_York">America/New_York (EST)</option>
            <option value="America/Chicago">America/Chicago (CST)</option>
            <option value="America/Denver">America/Denver (MST)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
            <option value="Europe/Paris">Europe/Paris (CET)</option>
            <option value="Europe/Berlin">Europe/Berlin (CET)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
            <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
            <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        <div className="flex justify-between items-center pt-2">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ background: 'var(--accent-blue)' }}>
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Account info */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Account Info</h3>
        <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex justify-between"><span>User ID</span><span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{user?.id?.slice(0, 8) || '—'}...</span></div>
          <div className="flex justify-between"><span>Auth provider</span><span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{provider}</span></div>
          <div className="flex justify-between"><span>Account created</span><span style={{ color: 'var(--text-primary)' }}>{createdAt}</span></div>
          <div className="flex justify-between"><span>Last sign in</span><span style={{ color: 'var(--text-primary)' }}>{lastSignIn}</span></div>
          <div className="flex justify-between"><span>Email confirmed</span><span style={{ color: user?.email_confirmed_at ? 'var(--accent-green, #22c55e)' : 'var(--accent-red)' }}>{user?.email_confirmed_at ? 'Yes' : 'No'}</span></div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(248,81,73,0.3)' }}>
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--accent-red)' }}>Danger Zone</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Irreversible actions. Proceed with caution.</p>
        <div className="flex gap-3">
          <button className="px-3 py-1.5 text-xs font-medium rounded-lg" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
            Export Data
          </button>
          <button onClick={handleDeleteAccount} className="px-3 py-1.5 text-xs font-medium rounded-lg" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Notifications ─── */
function NotificationSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [desktopNotifs, setDesktopNotifs] = useState(true)
  const [emailNotifs, setEmailNotifs] = useState(false)
  const [taskComplete, setTaskComplete] = useState(true)
  const [taskError, setTaskError] = useState(true)
  const [lowTokens, setLowTokens] = useState(true)
  const [lowTokenThreshold, setLowTokenThreshold] = useState(500)
  const [billingAlerts, setBillingAlerts] = useState(true)
  const [weeklyDigest, setWeeklyDigest] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  useEffect(() => {
    getPreferences().then(prefs => {
      const n = prefs.notifications || {}
      if (n.desktop !== undefined) setDesktopNotifs(n.desktop)
      if (n.email !== undefined) setEmailNotifs(n.email)
      if (n.taskComplete !== undefined) setTaskComplete(n.taskComplete)
      if (n.taskError !== undefined) setTaskError(n.taskError)
      if (n.lowTokens !== undefined) setLowTokens(n.lowTokens)
      if (n.lowTokenThreshold !== undefined) setLowTokenThreshold(n.lowTokenThreshold)
      if (n.billingAlerts !== undefined) setBillingAlerts(n.billingAlerts)
      if (n.weeklyDigest !== undefined) setWeeklyDigest(n.weeklyDigest)
      if (n.sound !== undefined) setSoundEnabled(n.sound)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updatePreferences({
        notifications: {
          desktop: desktopNotifs,
          email: emailNotifs,
          taskComplete,
          taskError,
          lowTokens,
          lowTokenThreshold,
          billingAlerts,
          weeklyDigest,
          sound: soundEnabled,
        }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const requestDesktopPermission = async () => {
    if (!('Notification' in window)) {
      setError('Desktop notifications are not supported')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      setDesktopNotifs(true)
      new Notification('OverClaw', { body: 'Desktop notifications enabled!' })
    } else {
      setError('Notification permission was denied')
      setDesktopNotifs(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin" /> Loading preferences...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Control how and when you receive alerts</p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-xs" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
          {error}
        </div>
      )}

      {/* Delivery channels */}
      <div className="rounded-xl p-5 space-y-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Delivery</h3>
        <ToggleRow label="Desktop notifications" desc="System notifications on your Mac" value={desktopNotifs} onChange={v => { if (v) requestDesktopPermission(); else setDesktopNotifs(false) }} />
        <ToggleRow label="Email notifications" desc="Receive alerts via email" value={emailNotifs} onChange={setEmailNotifs} />
        <ToggleRow label="Sound" desc="Play a sound when notifications arrive" value={soundEnabled} onChange={setSoundEnabled} />
      </div>

      {/* Task alerts */}
      <div className="rounded-xl p-5 space-y-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Tasks</h3>
        <ToggleRow label="Task completed" desc="When a scheduled task finishes successfully" value={taskComplete} onChange={setTaskComplete} />
        <ToggleRow label="Task errors" desc="When a scheduled task fails or times out" value={taskError} onChange={setTaskError} />
      </div>

      {/* Token & billing alerts */}
      <div className="rounded-xl p-5 space-y-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Tokens & Billing</h3>
        <ToggleRow label="Low token balance" desc="Alert when your token balance is running low" value={lowTokens} onChange={setLowTokens} />
        {lowTokens && (
          <div className="py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Low balance threshold</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Alert when tokens drop below this amount</div>
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{lowTokenThreshold.toLocaleString()}</span>
            </div>
            <input
              type="range" min={100} max={5000} step={100} value={lowTokenThreshold}
              onChange={e => setLowTokenThreshold(parseInt(e.target.value))}
              className="w-full mt-2" style={{ accentColor: 'var(--accent-blue)' }}
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>100</span><span>5,000</span>
            </div>
          </div>
        )}
        <ToggleRow label="Billing alerts" desc="Payment issues and subscription changes" value={billingAlerts} onChange={setBillingAlerts} />
      </div>

      {/* Digest */}
      <div className="rounded-xl p-5 space-y-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Digest</h3>
        <ToggleRow label="Weekly summary" desc="Usage summary and activity report every Monday" value={weeklyDigest} onChange={setWeeklyDigest} />
      </div>

      <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ background: 'var(--accent-blue)' }}>
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Preferences'}
      </button>
    </div>
  )
}

/* ─── Appearance ─── */
function applyTheme(theme: string) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme
  document.documentElement.setAttribute('data-theme', resolved)
}

function AppearanceSettings() {
  const [theme, setThemeState] = useState<string>('dark')
  const [accentColor, setAccentColor] = useState('#EF4444')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const themes: { id: string; label: string; icon: any; preview: { bg: string; card: string; text: string } }[] = [
    { id: 'dark', label: 'Dark', icon: Moon, preview: { bg: '#0D1117', card: '#161B22', text: '#E6EDF3' } },
    { id: 'light', label: 'Light', icon: Sun, preview: { bg: '#F6F8FA', card: '#FFFFFF', text: '#1F2328' } },
    { id: 'midnight', label: 'Midnight', icon: Moon, preview: { bg: '#000000', card: '#0A0A0A', text: '#FAFAFA' } },
    { id: 'system', label: 'System', icon: Monitor, preview: { bg: '#0D1117', card: '#161B22', text: '#E6EDF3' } },
  ]

  const accentPresets = [
    { color: '#EF4444', label: 'Red' },
    { color: '#3B82F6', label: 'Blue' },
    { color: '#8B5CF6', label: 'Purple' },
    { color: '#22C55E', label: 'Green' },
    { color: '#F59E0B', label: 'Amber' },
    { color: '#EC4899', label: 'Pink' },
    { color: '#06B6D4', label: 'Cyan' },
    { color: '#F97316', label: 'Orange' },
  ]

  // Load preferences
  useEffect(() => {
    getPreferences().then(prefs => {
      const a = prefs.appearance || {}
      if (a.theme) { setThemeState(a.theme); applyTheme(a.theme) }
      if (a.accentColor) { setAccentColor(a.accentColor); applyAccent(a.accentColor) }
    }).catch(() => {}).finally(() => setLoading(false))

    // Listen for system theme changes
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => { if (theme === 'system') applyTheme('system') }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const applyAccent = (color: string) => {
    document.documentElement.style.setProperty('--accent-blue', color)
    document.documentElement.style.setProperty('--accent-teal', color)
    // Parse hex to rgb for alpha variants
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    document.documentElement.style.setProperty('--accent-bg', `rgba(${r},${g},${b},0.12)`)
    document.documentElement.style.setProperty('--accent-bg-subtle', `rgba(${r},${g},${b},0.08)`)
    document.documentElement.style.setProperty('--accent-border', `rgba(${r},${g},${b},0.3)`)
    document.documentElement.style.setProperty('--accent-bg-strong', `rgba(${r},${g},${b},0.15)`)
  }

  const setTheme = (t: string) => {
    setThemeState(t)
    applyTheme(t)
  }

  const handleAccentChange = (color: string) => {
    setAccentColor(color)
    applyAccent(color)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePreferences({
        appearance: {
          theme,
          accentColor,
        }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {} finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin" /> Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Appearance</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Customise the look and feel of the dashboard</p>
      </div>

      {/* Theme */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Theme</h3>
        <div className="grid grid-cols-4 gap-3">
          {themes.map(({ id, label, icon: Icon, preview }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className="flex flex-col items-center gap-2 py-3 rounded-xl transition-all"
              style={{
                background: theme === id ? 'var(--accent-bg)' : 'var(--bg-page)',
                border: theme === id ? '2px solid var(--accent-blue)' : '2px solid var(--border-color)',
              }}
            >
              {/* Mini preview */}
              <div className="w-12 h-8 rounded-md overflow-hidden" style={{ background: preview.bg, border: '1px solid var(--border-color)' }}>
                <div className="w-8 h-1.5 rounded-sm mt-1.5 mx-auto" style={{ background: preview.card }} />
                <div className="w-6 h-1 rounded-sm mt-1 mx-auto" style={{ background: preview.text, opacity: 0.4 }} />
              </div>
              <span className="text-[11px] font-medium" style={{ color: theme === id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Styling Colour</h3>
        <div className="flex gap-2.5 flex-wrap">
          {accentPresets.map(({ color, label }) => (
            <button
              key={color}
              onClick={() => handleAccentChange(color)}
              title={label}
              className="w-8 h-8 rounded-full transition-transform"
              style={{
                background: color,
                border: accentColor === color ? '3px solid var(--text-primary)' : '3px solid transparent',
                transform: accentColor === color ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
          {/* Custom color picker */}
          <label className="w-8 h-8 rounded-full cursor-pointer overflow-hidden relative" style={{ border: '2px dashed var(--border-light)' }}>
            <input type="color" value={accentColor} onChange={e => handleAccentChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: 'var(--text-muted)' }}>+</div>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ background: accentColor }} />
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{accentColor.toUpperCase()}</span>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ background: 'var(--accent-blue)' }}>
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Appearance'}
      </button>
    </div>
  )
}

/* ─── Security ─── */
function SecuritySettings() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [sessionTimeout, setSessionTimeout] = useState('24h')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load security preferences
  useEffect(() => {
    getPreferences().then(prefs => {
      const s = prefs.security || {}
      if (s.sessionTimeout) setSessionTimeout(s.sessionTimeout)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handlePasswordUpdate = async () => {
    setPasswordError(null)
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    setPasswordSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSavePrefs = async () => {
    setSaving(true)
    try {
      await updatePreferences({ security: { sessionTimeout } })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {} finally { setSaving(false) }
  }

  const handleSignOutAll = async () => {
    if (!confirm('Sign out of all other sessions? You will stay signed in here.')) return
    try {
      await supabase.auth.signOut({ scope: 'others' })
    } catch {}
  }

  // Password strength indicator
  const getPasswordStrength = (pw: string): { label: string; color: string; width: string } => {
    if (!pw) return { label: '', color: 'transparent', width: '0%' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++

    if (score <= 1) return { label: 'Weak', color: 'var(--accent-red)', width: '20%' }
    if (score <= 2) return { label: 'Fair', color: 'var(--accent-yellow)', width: '40%' }
    if (score <= 3) return { label: 'Good', color: 'var(--accent-yellow)', width: '60%' }
    if (score <= 4) return { label: 'Strong', color: 'var(--accent-green)', width: '80%' }
    return { label: 'Very Strong', color: 'var(--accent-green)', width: '100%' }
  }

  const strength = getPasswordStrength(newPassword)

  const provider = user?.app_metadata?.provider || 'email'
  const emailConfirmed = !!user?.email_confirmed_at
  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin" /> Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Security</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Protect your account and manage access</p>
      </div>

      {/* Account status */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Account Status</h3>
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between items-center">
            <span style={{ color: 'var(--text-secondary)' }}>Auth provider</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--accent-bg)', color: 'var(--accent-blue)', textTransform: 'capitalize' }}>{provider}</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: 'var(--text-secondary)' }}>Email verified</span>
            <span className="flex items-center gap-1.5" style={{ color: emailConfirmed ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {emailConfirmed ? <><CheckCircle size={12} /> Verified</> : <><Shield size={12} /> Not verified</>}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: 'var(--text-secondary)' }}>Last sign in</span>
            <span style={{ color: 'var(--text-primary)' }}>{lastSignIn}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Change Password</h3>

        {passwordError && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
            {passwordError}
          </div>
        )}
        {passwordSuccess && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: 'var(--accent-green)' }}>
            ✓ Password updated successfully
          </div>
        )}

        <InputField label="New Password" value={newPassword} onChange={setNewPassword} type="password" placeholder="Enter new password" />

        {/* Strength indicator */}
        {newPassword && (
          <div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-page)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: strength.width, background: strength.color }} />
            </div>
            <div className="text-[10px] mt-1" style={{ color: strength.color }}>{strength.label}</div>
          </div>
        )}

        <InputField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="Confirm new password" />

        {confirmPassword && confirmPassword !== newPassword && (
          <div className="text-[11px]" style={{ color: 'var(--accent-red)' }}>Passwords do not match</div>
        )}

        <button
          onClick={handlePasswordUpdate}
          disabled={passwordSaving || !newPassword || newPassword !== confirmPassword}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
          style={{ background: 'var(--accent-blue)' }}
        >
          {passwordSaving ? 'Updating...' : 'Update Password'}
        </button>
      </div>

      {/* Session management */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Sessions</h3>

        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Session Timeout</label>
          <select
            value={sessionTimeout}
            onChange={e => setSessionTimeout(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="1h">1 hour</option>
            <option value="4h">4 hours</option>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Automatically sign out after this period of inactivity</p>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSavePrefs} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ background: 'var(--accent-blue)' }}>
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
          <button onClick={handleSignOutAll} className="px-3 py-2 text-xs font-medium rounded-lg" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)' }}>
            Sign Out All Other Sessions
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <NukeSection />
    </div>
  )
}

function NukeSection() {
  const [nuking, setNuking] = useState(false)
  const [nukeLog, setNukeLog] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const isElectron = !!window.electronAPI?.isElectron

  const sh = useCallback(async (cmd: string) => {
    if (!isElectron) throw new Error('Not in Electron')
    const platform = window.electronAPI?.platform || 'darwin'
    if (platform === 'win32') {
      cmd = cmd.replace(/ 2>\/dev\/null/g, ' 2>nul')
      cmd = cmd.replace(/ >\/dev\/null/g, ' >nul')
      cmd = cmd.replace(/ 2>&1/g, '')
      cmd = cmd.replace(/ \|\| true/g, '')
    }
    return window.electronAPI!.exec(cmd, [])
  }, [isElectron])

  const handleNuke = useCallback(async () => {
    const confirmed = confirm(
      '⚠️ NUCLEAR OPTION ⚠️\n\n' +
      'This will DELETE:\n' +
      '• ~/.openclaw (main OpenClaw state)\n' +
      '• ~/.overclaw (local + cloud state dirs)\n' +
      '• Kill all gateway processes\n' +
      '• Uninstall openclaw + clawhub globally\n\n' +
      'Your OverClaw Desktop app will remain installed.\n' +
      'You can re-setup from scratch on the Local/Cloud pages.\n\n' +
      'Are you sure?'
    )
    if (!confirmed) return

    const doubleConfirm = confirm('Really? This cannot be undone.')
    if (!doubleConfirm) return

    setNuking(true)
    setNukeLog([])
    setDone(false)
    const log = (msg: string) => setNukeLog(prev => [...prev, msg])

    try {
      // Kill gateway processes
      log('Killing gateway processes...')
      const ea = window.electronAPI!
      const platform = ea.platform || 'darwin'
      if (ea.killPort) {
        try { await ea.killPort(18789) } catch {}
        try { await ea.killPort(18790) } catch {}
      } else {
        try { await sh('lsof -ti:18789 | xargs kill -9 2>/dev/null || true') } catch {}
        try { await sh('lsof -ti:18790 | xargs kill -9 2>/dev/null || true') } catch {}
      }
      if (platform === 'win32') {
        try { await sh('taskkill /F /IM openclaw.exe 2>nul') } catch {}
      } else {
        try { await sh('pkill -f "openclaw gateway" 2>/dev/null || true') } catch {}
      }
      log('✓ Gateways stopped')

      // Remove state directories
      const homedir = await ea.getHomedir()
      log('Removing ~/.openclaw...')
      if (platform === 'win32') {
        try { await sh(`rmdir /s /q "${homedir}\\.openclaw" 2>nul`) } catch {}
      } else {
        try { await sh('rm -rf ~/.openclaw') } catch {}
      }
      log('✓ ~/.openclaw removed')

      log('Removing ~/.overclaw...')
      if (platform === 'win32') {
        try { await sh(`rmdir /s /q "${homedir}\\.overclaw" 2>nul`) } catch {}
      } else {
        try { await sh('rm -rf ~/.overclaw') } catch {}
      }
      log('✓ ~/.overclaw removed')

      // Uninstall global packages
      log('Uninstalling openclaw + clawhub...')
      try { await sh('npm uninstall -g openclaw clawhub') } catch {}
      log('✓ Global packages removed')

      // Clear localStorage device tokens
      log('Clearing cached device tokens...')
      try { localStorage.removeItem('openclaw.device.auth.v1') } catch {}
      log('✓ Device tokens cleared')

      log('')
      log('🧹 All clean! Restart the app or go to Local/Cloud to set up fresh.')
      setDone(true)
    } catch (e: any) {
      log(`❌ Error: ${e.message}`)
    }
    setNuking(false)
  }, [sh])

  if (!isElectron) return null

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid rgba(248,81,73,0.4)' }}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} style={{ color: 'var(--accent-red, #f85149)' }} />
        <h3 className="font-semibold text-sm" style={{ color: 'var(--accent-red, #f85149)' }}>Danger Zone</h3>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Delete all OpenClaw installations and state. This removes <code>~/.openclaw</code>, <code>~/.overclaw</code>, kills gateways, and uninstalls global packages. Use this to start completely fresh.
      </p>

      {nukeLog.length > 0 && (
        <div className="rounded-lg px-3 py-2.5 text-[11px] font-mono space-y-0.5 max-h-40 overflow-auto" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)' }}>
          {nukeLog.map((line, i) => (
            <div key={i} style={{ color: line.startsWith('✓') ? 'var(--accent-green, #22c55e)' : line.startsWith('❌') ? 'var(--accent-red, #f85149)' : line.startsWith('🧹') ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
              {line}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleNuke}
        disabled={nuking}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-all hover:opacity-90"
        style={{ background: 'var(--accent-red, #f85149)', color: '#fff' }}
      >
        {nuking ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        {nuking ? 'Nuking...' : done ? 'Nuke Again' : 'Delete All OpenClaw Data'}
      </button>
    </div>
  )
}

/* ─── Shared Components ─── */
function InputField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
        style={{ background: 'var(--bg-page)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
      />
    </div>
  )
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className="w-10 h-5 rounded-full relative transition-colors"
        style={{ background: value ? 'var(--accent-blue)' : 'var(--border-color)' }}
      >
        <div
          className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
          style={{ background: '#fff', left: value ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}

