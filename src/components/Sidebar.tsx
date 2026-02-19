import { useState, useEffect } from 'react'
import { Home, HardDrive, CreditCard, Settings, Bot, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getProfile } from '../lib/db'

const navItems = [
  { name: 'Home', icon: Home },
  { name: 'Cloud', icon: Bot },
  { name: 'Local', icon: HardDrive },
  { name: 'Settings', icon: Settings },
]

interface Props {
  activeTab: string
  onTabChange: (tab: string) => void
}

export default function Sidebar({ activeTab, onTabChange }: Props) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/signin')
  }

  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    if (user) getProfile().then(setProfile).catch(() => {})
  }, [user])

  const displayName = profile?.display_name || (user?.email?.split('@')[0] ?? 'User')
  const avatarUrl = profile?.avatar_url || null

  return (
    <div className="w-56 flex flex-col shrink-0" style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)' }}>
      {/* Drag region for window movement — clears traffic lights */}
      <div className="h-8 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      {/* Logo */}
      <div className="px-5 pb-5 pt-1 flex items-center gap-2.5">
        <img src="/logo.jpg" alt="OverClaw" className="w-8 h-8 rounded-lg object-cover" />
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>OverClaw</div>
          <div className="text-[11px]" style={{ color: 'var(--accent-teal)' }}>Dashboard</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 mt-2">
        {navItems.map(({ name, icon: Icon }) => {
          const active = activeTab === name
          return (
            <button
              key={name}
              onClick={() => onTabChange(name)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors relative"
              style={{
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--accent-bg)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
              }}
            >
              <Icon size={16} />
              {name}
            </button>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-bg-strong)', color: 'var(--accent-blue)' }}>
              {(displayName?.[0] ?? 'U').toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{user?.email ?? ''}</div>
          </div>
          <button onClick={handleSignOut} title="Sign out" className="p-1 rounded hover:opacity-80 transition-opacity" style={{ color: 'var(--text-muted)' }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
