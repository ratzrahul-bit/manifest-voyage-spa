import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BMAP: Record<string, string> = { arrived: 'badge-green', 'in-transit': 'badge-amber', departed: 'badge-blue' }
const BLBL: Record<string, string> = { arrived: 'Arrived', 'in-transit': 'In transit', departed: 'Departed' }

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([])
  const [manifests, setManifests] = useState<any[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: u }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'admin').order('created_at', { ascending: false }),
      supabase.from('manifests').select('*').order('created_at', { ascending: false }),
    ])
    setUsers(u || []); setManifests(m || [])
    setLoading(false)
  }

  async function updateUserStatus(id: string, status: string) {
    await supabase.from('profiles').update({ status }).eq('id', id)
    fetchAll()
  }

  async function download(m: any) {
    const content = m.raw_content || JSON.stringify({ vessel_name: m.vessel_name, voyage_no: m.voyage_no, rotation_no: m.rotation_no }, null, 2)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    a.download = `${m.vessel_name.replace(/\s+/g, '_')}_manifest.json`
    a.click()
  }

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase()
    const mq = !q || (u.name + u.company + u.email + u.id).toLowerCase().includes(q)
    const rf = !roleFilter || u.role === roleFilter
    return mq && rf
  })

  const active = users.filter(u => u.status === 'active').length
  const pending = users.filter(u => u.status === 'pending').length

  if (loading) return <div className="empty">Loading...</div>

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-val">{manifests.length}</div><div className="stat-lbl">Total manifests</div></div>
        <div className="stat-card"><div className="stat-val">{active}</div><div className="stat-lbl">Active users</div></div>
        <div className="stat-card"><div className="stat-val">{pending}</div><div className="stat-lbl">Pending approval</div></div>
      </div>

      <div className="card">
        <p className="section-label">User management</p>
        <div className="search-bar">
          <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>🔍</span>
          <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users..." />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            <option value="shipping_line">Shipping line</option>
            <option value="cha">CHA</option>
          </select>
        </div>

        {filteredUsers.length === 0 ? <div className="empty">No users found.</div> : filteredUsers.map(u => {
          const roleBadge = u.role === 'cha' ? 'badge-teal' : 'badge-blue'
          const roleLabel = u.role === 'cha' ? 'CHA' : 'Shipping line'
          const statusBadge = u.status === 'active' ? 'badge-green' : u.status === 'pending' ? 'badge-amber' : 'badge-red'
          const statusLabel = u.status === 'active' ? 'Active' : u.status === 'pending' ? 'Pending' : 'Rejected'
          const initials = u.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '??'
          return (
            <div className="user-row" key={u.id}>
              <div className="avatar" style={{ background: u.role === 'cha' ? '#E1F5EE' : '#E6F1FB', color: u.role === 'cha' ? '#0F6E56' : '#0C447C', flexShrink: 0 }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.company} · {u.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span className={`badge ${roleBadge}`}>{roleLabel}</span>
                <span className={`badge ${statusBadge}`}>{statusLabel}</span>
                {u.status === 'pending' && <>
                  <button className="btn btn-success btn-sm" onClick={() => updateUserStatus(u.id, 'active')}>✓ Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => updateUserStatus(u.id, 'rejected')}>✕ Reject</button>
                </>}
                {u.status === 'active' && <button className="btn btn-sm" onClick={() => updateUserStatus(u.id, 'pending')}>Suspend</button>}
                {u.status === 'rejected' && <button className="btn btn-sm" onClick={() => updateUserStatus(u.id, 'active')}>Reinstate</button>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <p className="section-label">All manifests</p>
        {manifests.length === 0 ? <div className="empty">No manifests uploaded yet.</div> : manifests.map(m => (
          <div className="manifest-row" key={m.id}>
            <div className="mr-icon">📄</div>
            <div className="mr-main">
              <div className="mr-vessel">{m.vessel_name}</div>
              <div className="mr-meta">Voyage {m.voyage_no} · Rotation {m.rotation_no} · {m.uploader_name} · {m.created_at?.slice(0, 10)}</div>
            </div>
            <div className="mr-right">
              <span className={`badge ${BMAP[m.status] || 'badge-blue'}`}>{BLBL[m.status] || m.status}</span>
              <button className="btn btn-dl" onClick={() => download(m)}>↓ Download</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
