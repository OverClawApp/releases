import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AuthCard from '../../components/AuthCard'
import AuthInput from '../../components/AuthInput'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    const { error } = await resetPassword(email)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSuccess('Check your email for a password reset link.')
    }
  }

  return (
    <AuthCard>
      <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Forgot Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput label="Email" type="email" placeholder="alex@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
        {error && <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>}
        {success && <p className="text-xs" style={{ color: 'var(--accent-green)' }}>{success}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-sm font-medium text-white rounded-lg transition-opacity"
          style={{ background: 'var(--accent-blue)', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Sending...' : 'Reset Password'}
        </button>
        <div className="text-center">
          <Link to="/signin" className="text-xs" style={{ color: 'var(--accent-blue)' }}>Back to sign in</Link>
        </div>
      </form>
    </AuthCard>
  )
}
