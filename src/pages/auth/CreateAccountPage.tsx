import { useEffect } from 'react'

export default function CreateAccountPage() {
  useEffect(() => {
    window.open('https://overclaw.app/signup', '_blank')
    window.history.back()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-page)',
      color: 'var(--text-muted)',
      fontSize: '14px',
    }}>
      Opening overclaw.app...
    </div>
  )
}
