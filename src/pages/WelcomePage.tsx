import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Cpu, Globe, Shield, Zap } from 'lucide-react'

const features = [
  { icon: Cpu, title: 'Local AI Models', desc: 'Run Ollama models privately on your machine — no data leaves your device.' },
  { icon: Globe, title: 'Cloud AI Access', desc: 'Connect to Claude, GPT, Gemini and more through our keyless proxy.' },
  { icon: Shield, title: 'Secure by Default', desc: 'SSH tunnels, rate limiting, and full control over what your assistant can do.' },
  { icon: Zap, title: 'Web Relay', desc: 'Chat from anywhere — your web messages appear right here in the app.' },
]

export default function WelcomePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'var(--bg-page)',
      color: 'var(--text-primary)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Drag region */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '32px', WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Background glow */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      {step === 0 ? (
        /* Step 1: Hero */
        <div style={{
          textAlign: 'center',
          maxWidth: '480px',
          animation: 'fadeIn 0.5s ease',
        }}>
          <img
            src="/logo.jpg"
            alt="OverClaw"
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              marginBottom: '24px',
              boxShadow: '0 0 40px rgba(239,68,68,0.2)',
            }}
          />
          <h1 style={{
            fontSize: '32px',
            fontWeight: 700,
            marginBottom: '12px',
            lineHeight: 1.2,
          }}>
            Welcome to <span style={{ color: '#EF4444' }}>OverClaw</span>
          </h1>
          <p style={{
            fontSize: '16px',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '40px',
          }}>
            Your AI assistant, running locally on your machine. Private, powerful, and completely yours.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '40px',
            textAlign: 'left',
          }}>
            {features.map((f, i) => {
              const Icon = f.icon
              return (
                <div key={i} style={{
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                  background: 'rgba(255,255,255,0.02)',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}>
                  <Icon size={20} style={{ color: '#EF4444', marginBottom: '8px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{f.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{f.desc}</div>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setStep(1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 32px',
              borderRadius: '14px',
              border: 'none',
              background: '#EF4444',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'box-shadow 0.2s ease, transform 0.1s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 20px rgba(239,68,68,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
          >
            Get Started
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        /* Step 2: Sign in or create account */
        <div style={{
          textAlign: 'center',
          maxWidth: '400px',
          animation: 'fadeIn 0.5s ease',
        }}>
          <img
            src="/logo.jpg"
            alt="OverClaw"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              marginBottom: '20px',
            }}
          />
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
            Let&apos;s set you up
          </h2>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            marginBottom: '32px',
          }}>
            Sign in to sync your settings, access cloud models, and chat from the web.
          </p>

          <button
            onClick={() => window.open('https://overclaw.app/signup', '_blank')}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              border: 'none',
              background: '#EF4444',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '12px',
              transition: 'box-shadow 0.2s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 20px rgba(239,68,68,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
          >
            Create Account
          </button>

          <button
            onClick={() => navigate('/signin')}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '24px',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color, rgba(255,255,255,0.08))')}
          >
            I already have an account
          </button>

          <button
            onClick={() => setStep(0)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
