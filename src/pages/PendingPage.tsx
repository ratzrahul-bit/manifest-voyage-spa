import { useAuth } from '../lib/auth'

export default function PendingPage() {
  const { signOut } = useAuth()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Awaiting approval</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
          Your registration is pending admin approval. You will be able to access the platform once approved.
        </div>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
