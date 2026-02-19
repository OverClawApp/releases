import React, { type ReactNode } from 'react'

export default function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="w-[400px] rounded-2xl p-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-2">
          <img src="/logo.jpg" alt="OverClaw" className="w-9 h-9 rounded-lg object-cover" />
          <div>
            <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>OverClaw</div>
            <div className="text-[11px]" style={{ color: 'var(--accent-teal)' }}>Powered by Openclaw</div>
          </div>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Deploy and Manage your own AI agents 24/7
        </p>
        {children}
      </div>
    </div>
  )
}
