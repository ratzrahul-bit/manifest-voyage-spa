import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

async function sendEmail(to: string, toName: string, subject: string, html: string) {
  await fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, toName, subject, html }),
  })
}

export default function AuthPage() {
  const { signIn } = useAuth()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [mobile, setMobile] = useState('')
  const [role, setRole] = useState<'shipping_line' | 'cha'>('shipping_line')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const err = await signIn(email, password)
    if (err) setError(err)
    setLoading(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'himalayanmanifest@gmail.com'
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        name,
        company,
        mobile: mobile.trim() || null,
        role: isAdmin ? 'admin' : role,
        status: isAdmin ? 'active' : 'pending',
      })

      if (!isAdmin) {
        const roleLabel = role === 'cha' ? 'CHA (Customs House Agent)' : 'Shipping Line / Liner Agent'
        await sendEmail(
          ADMIN_EMAIL, 'Admin',
          `New registration — ${name} · ${company}`,
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#185FA5;margin-bottom:16px">Himalayan Manifest — New User Registration</h2>
            <p>A new user has registered and is awaiting your approval.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Name</td><td style="padding:10px">${name}</td></tr>
              <tr><td style="padding:10px;font-weight:600">Company</td><td style="padding:10px">${company}</td></tr>
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Email</td><td style="padding:10px">${email}</td></tr>
              <tr><td style="padding:10px;font-weight:600">Mobile</td><td style="padding:10px">${mobile || '—'}</td></tr>
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">User type</td><td style="padding:10px">${roleLabel}</td></tr>
            </table>
            <p><a href="https://himalayanmanifest.netlify.app/admin" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Go to Admin Panel → Approve</a></p>
            <p style="color:#6B7280;font-size:13px;margin-top:16px">This is an automated message from Himalayan Manifest.</p>
          </div>`
        )
      }
    }
    setSuccess(isAdmin ? 'Admin account created. You can now sign in.' : 'Registration submitted. Awaiting admin approval.')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: 48, height: 48, background: 'var(--blue-light)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>🏔️</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Himalayan Manifest</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Free tool for manifest exchange for Nepal/Bhutan Transhipment Cargo</div>
        </div>

        <div className="card">
          <div className="tabs" style={{ marginBottom: '1.25rem' }}>
            <button className={`tab${tab === 'login' ? ' active' : ''}`} onClick={() => { setTab('login'); setError(''); setSuccess('') }}>Sign in</button>
            <button className={`tab${tab === 'register' ? ' active' : ''}`} onClick={() => { setTab('register'); setError(''); setSuccess('') }}>Register</button>
          </div>

          {error && <div className="alert alert-danger">⚠ {error}</div>}
          {success && <div className="alert alert-success">✓ {success}</div>}

          {tab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="field-group">
                <div className="field-label">Email</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
              <div className="field-group" style={{ marginBottom: '1.25rem' }}>
                <div className="field-label">Password</div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Signing in...' : '→ Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="field-group">
                <div className="field-label">Full name <span className="req">*</span></div>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required />
              </div>
              <div className="field-group">
                <div className="field-label">Company <span className="req">*</span></div>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" required />
              </div>
              <div className="field-group">
                <div className="field-label">Email <span className="req">*</span></div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
              <div className="field-group">
                <div className="field-label">Mobile number <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(for verification if needed)</span></div>
                <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div className="field-group">
                <div className="field-label">Password <span className="req">*</span></div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} />
              </div>
              <div className="field-group" style={{ marginBottom: '1.25rem' }}>
                <div className="field-label">User type <span className="req">*</span></div>
                <select value={role} onChange={e => setRole(e.target.value as any)}>
                  <option value="shipping_line">Shipping Line / Liner Agent</option>
                  <option value="cha">CHA (Customs House Agent)</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Submitting...' : '→ Submit registration'}
              </button>
            </form>
          )}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Access by admin approval only</p>
      </div>
    </div>
  )
}
