import { Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface Props {
  title: string
  showCreate?: boolean
  onCreateBot?: () => void
}

export default function TopBar({ title, showCreate, onCreateBot }: Props) {
  const { user } = useAuth()

  const initials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : '??'

  return (
    <div className="h-14 flex items-center justify-between px-6 shrink-0" style={{ borderBottom: '1px solid var(--border-color)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Search...</span>
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-page)', color: 'var(--text-muted)' }}>⌘K</span>
        </div>
{/* buttons removed */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--border-light)', color: 'var(--text-secondary)' }}>
          {initials}
        </div>
      </div>
    </div>
  )
}
