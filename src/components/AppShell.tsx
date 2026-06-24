import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()

  if (!user) return null

  const roleLabel = user.role === 'admin' ? 'Admin' : user.role === 'cha' ? 'CHA' : 'Shipping line'
  const roleColor = user.role === 'admin' ? ['#EEEDFE', '#3C3489'] : user.role === 'cha' ? ['#E1F5EE', '#0F6E56'] : ['#E6F1FB', '#0C447C']
  const initials = user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const tabs = [
    { label: '↑ Upload', path: '/upload', roles: ['admin', 'shipping_line', 'cha'] },
    { label: '≡ My uploads', path: '/my-uploads', roles: ['shipping_line', 'cha', 'admin'] },
    { label: '↓ Download', path: '/manifests', roles: ['cha', 'admin'] },
    { label: '⚙ Admin', path: '/admin', roles: ['admin'] },
    { label: '✉ Contact', path: '/contact', roles: ['admin', 'shipping_line', 'cha'] },
  ].filter(t => t.roles.includes(user.role))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '1.5rem 1.5rem 0' }}>
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'var(--blue-light)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🚢</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>ManifestNepal</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>India-Nepal Manifest Exchange</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{user.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{roleLabel}</div>
            </div>
            <div className="avatar" style={{ background: roleColor[0], color: roleColor[1] }}>{initials}</div>
            <button className="btn btn-sm" onClick={signOut}>Sign out</button>
          </div>
        </div>

        <div className="tabs">
          {tabs.map(t => (
            <button key={t.path} className={`tab${loc.pathname === t.path ? ' active' : ''}`} onClick={() => nav(t.path)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ paddingBottom: '2rem' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
