import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AuthCard from '../../components/AuthCard'
import AuthInput from '../../components/AuthInput'

export default function SignInPage() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Redirect if already signed in
  if (user) { navigate('/dashboard', { replace: true }) }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <AuthCard>
      <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput label="Email" type="email" placeholder="alex@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
        <AuthInput label="Password" type="password" placeholder="••••••••••••" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
        {error && <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-sm font-medium text-white rounded-lg mt-1 transition-opacity"
          style={{ background: 'var(--accent-blue)', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="flex items-center justify-between text-xs">
          <a href="https://overclaw.app/signup" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>Create account</a>
          <Link to="/forgot-password" style={{ color: 'var(--accent-blue)' }}>Forgot password?</Link>
        </div>
        <p className="text-[11px] text-center pt-2" style={{ color: 'var(--text-muted)' }}>
          By continuing, you agree to Terms & Privacy.
        </p>
      </form>
    </AuthCard>
  )
}
