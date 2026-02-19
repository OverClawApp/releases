import { useState, useRef, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { OpenClawProvider } from './context/OpenClawContext'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import BotsPage from './pages/BotsPage'
import CloudPage from './pages/CloudPage'
import DashboardPage from './pages/DashboardPage'
import LocalPage from './pages/LocalPage'
import SettingsPage from './pages/SettingsPage'
// BillingPage removed — billing is now on overclaw.app
import RightPanel from './components/RightPanel'
import DeployModal from './components/DeployModal'
import SignInPage from './pages/auth/SignInPage'
import CreateAccountPage from './pages/auth/CreateAccountPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import WelcomePage from './pages/WelcomePage'

// Global refs for gateway wsRequest functions (set by Cloud/Local pages, read by Dashboard)
export const gatewayRefs = {
  local: null as ((method: string, params: any) => Promise<any>) | null,
  cloud: null as ((method: string, params: any) => Promise<any>) | null,
}

function DashboardLayout() {
  const [activeTab, setActiveTab] = useState('Home')
  const [showDeploy, setShowDeploy] = useState(false)

  const isLocal = activeTab === 'Local'

  // Listen for navigation events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail === 'string') setActiveTab(detail)
    }
    window.addEventListener('navigate', handler)
    return () => window.removeEventListener('navigate', handler)
  }, [])

  const content = (
    <div className="flex h-screen" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top spacer matching sidebar drag region — clears traffic lights on right side */}
        <div className="h-8 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <TopBar
          title={activeTab}
          showCreate={activeTab === 'Cloud'}
          onCreateBot={() => setShowDeploy(true)}
        />
        <main className="flex-1 overflow-auto p-6">
          {/* Keep Local and Cloud always mounted so gateways stay connected */}
          <div style={{ display: activeTab === 'Local' ? 'contents' : 'none' }}><LocalPage /></div>
          <div style={{ display: activeTab === 'Cloud' ? 'contents' : 'none' }}><CloudPage /></div>
          {activeTab === 'Home' && <DashboardPage />}
          {activeTab === 'Settings' && <SettingsPage />}
          {activeTab === 'Billing' && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Billing has moved to the web.</p>
              <button
                onClick={() => window.open('https://overclaw.app/dashboard/billing', '_blank')}
                style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Open Billing →
              </button>
            </div>
          )}
          {!['Cloud', 'Home', 'Local', 'Settings', 'Billing'].includes(activeTab) && (
            <div className="text-center pt-20" style={{ color: 'var(--text-muted)' }}>{activeTab} — coming soon</div>
          )}
        </main>
      </div>
      {!['Billing', 'Settings', 'Local', 'Cloud', 'Home'].includes(activeTab) && <RightPanel />}
      {showDeploy && <DeployModal onClose={() => setShowDeploy(false)} onCreated={() => { setShowDeploy(false) }} />}
    </div>
  )

  return <OpenClawProvider>{content}</OpenClawProvider>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/create-account" element={<CreateAccountPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/dashboard/*" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </AuthProvider>
  )
}
