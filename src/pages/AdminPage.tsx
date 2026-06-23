import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const BMAP: Record<string, string> = { arrived: 'badge-green', 'in-transit': 'badge-amber', departed: 'badge-blue' }
const BLBL: Record<string, string> = { arrived: 'Arrived', 'in-transit': 'In transit', departed: 'Departed' }

async function sendEmail(to: string, toName: string, subject: string, html: string) {
  await fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, toName, subject, html }),
  })
}

function getFileName(m: any) {
  const uploadDate = m.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)
  const cleanVessel = m.vessel_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  const cleanVoyage = m.voyage_no.replace(/\//g, '-').replace(/\s+/g, '')
  return `${cleanVessel}_${cleanVoyage}_${m.rotation_no}_${uploadDate}.json`
}

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([])
  const [manifests, setManifests] = useState<any[]>([])
  const [vessels, setVessels] = useState<any[]>([])
  const [vesselNames, setVesselNames] = useState<string[]>([])
  const [newVessel, setNewVessel] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [vesselMsg, setVesselMsg] = useState<{ type: string; msg: string } | null>(null)
  const [activeSection, setActiveSection] = useState<'users' | 'vessels' | 'manifests'>('users')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [editingVesselId, setEditingVesselId] = useState<string | null>(null)
  const [editVesselName, setEditVesselName] = useState('')
  // Manifest edit state
  const [editingManifestId, setEditingManifestId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState({ vessel_name: '', voyage_no: '', rotation_no: '' })
  const [vesselSearch, setVesselSearch] = useState('')
  const [showVesselDrop, setShowVesselDrop] = useState(false)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [replaceFile, setReplaceFile] = useState(false)
  const [editAlert, setEditAlert] = useState<{ type: string; msg: string } | null>(null)
  const [savingManifest, setSavingManifest] = useState(false)
  const vesselRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchAll()
    function handleClick(e: MouseEvent) {
      if (vesselRef.current && !vesselRef.current.contains(e.target as Node)) setShowVesselDrop(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchAll() {
    const [{ data: u }, { data: m }, { data: v }] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'admin').order('created_at', { ascending: false }),
      supabase.from('manifests').select('*').order('created_at', { ascending: false }),
      supabase.from('vessels').select('*').order('name'),
    ])
    setUsers(u || []); setManifests(m || []); setVessels(v || [])
    setVesselNames((v || []).map((x: any) => x.name))
    setLoading(false)
  }

  async function updateUserStatus(id: string, status: string) {
    await supabase.from('profiles').update({ status }).eq('id', id)
    if (status === 'active') {
      const u = users.find(x => x.id === id)
      if (u?.email) {
        const roleLabel = u.role === 'cha' ? 'CHA (Customs House Agent)' : 'Shipping Line / Liner Agent'
        await sendEmail(u.email, u.name, 'Your ManifestNepal account has been approved',
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#185FA5">ManifestNepal — Account Approved</h2>
            <p>Dear ${u.name}, your registration has been approved.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Name</td><td style="padding:10px">${u.name}</td></tr>
              <tr><td style="padding:10px;font-weight:600">Company</td><td style="padding:10px">${u.company}</td></tr>
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">User type</td><td style="padding:10px">${roleLabel}</td></tr>
            </table>
            <p><a href="https://igmnepal.netlify.app" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Sign in →</a></p>
          </div>`)
      }
    }
    if (status === 'rejected') {
      const u = users.find(x => x.id === id)
      if (u?.email) {
        await sendEmail(u.email, u.name, 'Your ManifestNepal registration was not approved',
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#A32D2D">ManifestNepal — Registration Update</h2>
            <p>Dear ${u.name}, your registration could not be approved. Contact <a href="mailto:manifestnepal@gmail.com">manifestnepal@gmail.com</a>.</p>
          </div>`)
      }
    }
    fetchAll()
  }

  async function saveUserName(id: string) {
    if (!editName.trim()) return
    setSavingUser(true)
    await supabase.from('profiles').update({ name: editName.trim() }).eq('id', id)
    setSavingUser(false); setEditingUser(null); setEditName(''); fetchAll()
  }

  async function addVessel() {
    const name = newVessel.trim()
    if (!name) return
    if (vessels.find(v => v.name.toLowerCase() === name.toLowerCase())) {
      setVesselMsg({ type: 'danger', msg: 'Vessel already exists.' }); return
    }
    const { error } = await supabase.from('vessels').insert({ name })
    if (error) { setVesselMsg({ type: 'danger', msg: error.message }); return }
    setNewVessel(''); setVesselMsg({ type: 'success', msg: `${name} added.` }); fetchAll()
  }

  async function saveVesselName(id: string) {
    if (!editVesselName.trim()) return
    if (vessels.find(v => v.name.toLowerCase() === editVesselName.trim().toLowerCase() && v.id !== id)) {
      setVesselMsg({ type: 'danger', msg: 'Vessel name already exists.' }); return
    }
    await supabase.from('vessels').update({ name: editVesselName.trim() }).eq('id', id)
    setEditingVesselId(null); setEditVesselName(''); fetchAll()
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Permanently delete user "${name}"?`)) return
    await supabase.from('profiles').delete().eq('id', id); fetchAll()
  }

  async function removeVessel(id: string, name: string) {
    if (!confirm(`Remove "${name}" from vessel list?`)) return
    await supabase.from('vessels').delete().eq('id', id); fetchAll()
  }

  async function deleteManifest(m: any) {
    if (!confirm(`Delete manifest "${m.file_name || m.rotation_no}"? This cannot be undone.`)) return
    setDeletingId(m.id)
    if (m.file_path) await supabase.storage.from('manifests').remove([m.file_path])
    await supabase.from('manifests').delete().eq('id', m.id)
    setDeletingId(null); fetchAll()
  }

  async function download(m: any) {
    setDownloadingId(m.id)
    try {
      if (m.file_path) {
        const { data, error } = await supabase.storage.from('manifests').download(m.file_path)
        if (error) throw error
        const a = document.createElement('a')
        a.href = URL.createObjectURL(data)
        a.download = getFileName(m)
        a.click()
      } else {
        const content = JSON.stringify({ vessel_name: m.vessel_name, voyage_no: m.voyage_no, rotation_no: m.rotation_no }, null, 2)
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
        a.download = getFileName(m)
        a.click()
      }
    } catch { alert('Download failed.') }
    setDownloadingId(null)
  }

  function startEditManifest(m: any) {
    setEditingManifestId(m.id)
    setEditFields({ vessel_name: m.vessel_name, voyage_no: m.voyage_no, rotation_no: m.rotation_no })
    setVesselSearch(m.vessel_name)
    setNewFile(null); setReplaceFile(false); setEditAlert(null)
  }

  function cancelEditManifest() {
    setEditingManifestId(null); setNewFile(null); setReplaceFile(false); setEditAlert(null)
  }

  async function saveManifest(m: any) {
    if (!editFields.vessel_name.trim()) { setEditAlert({ type: 'danger', msg: 'Vessel required.' }); return }
    if (!editFields.voyage_no.trim()) { setEditAlert({ type: 'danger', msg: 'Voyage required.' }); return }
    if (!/^\d{7}$/.test(editFields.rotation_no.trim())) { setEditAlert({ type: 'danger', msg: 'Rotation must be 7 digits.' }); return }
    setSavingManifest(true)
    try {
      let filePath = m.file_path
      let fileName = m.file_name
      if (newFile) {
        if (replaceFile && m.file_path) await supabase.storage.from('manifests').remove([m.file_path])
        const path = `admin/${editFields.rotation_no.trim()}/${Date.now()}_${newFile.name}`
        const { error: upErr } = await supabase.storage.from('manifests').upload(path, newFile, { contentType: 'application/json' })
        if (upErr) throw upErr
        filePath = path; fileName = newFile.name
      }
      await supabase.from('manifests').update({
        vessel_name: editFields.vessel_name.trim(),
        voyage_no: editFields.voyage_no.trim(),
        rotation_no: editFields.rotation_no.trim(),
        file_path: filePath, file_name: fileName,
      }).eq('id', m.id)

      // Notify all active CHAs
      const { data: chaUsers } = await supabase.from('profiles').select('email, name').eq('role', 'cha').eq('status', 'active')
      const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#185FA5">ManifestNepal — Manifest Updated</h2>
        <p>A manifest has been updated by the admin.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Vessel</td><td style="padding:10px">${editFields.vessel_name}</td></tr>
          <tr><td style="padding:10px;font-weight:600">Voyage</td><td style="padding:10px">${editFields.voyage_no}</td></tr>
          <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Rotation</td><td style="padding:10px">${editFields.rotation_no}</td></tr>
        </table>
        <p><a href="https://igmnepal.netlify.app/manifests" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Download manifest</a></p>
      </div>`
      if (chaUsers && chaUsers.length > 0) {
        await Promise.all(chaUsers.map((cha: any) => sendEmail(cha.email, cha.name,
          `Manifest updated — ${editFields.vessel_name} · Voyage ${editFields.voyage_no} · Rotation ${editFields.rotation_no}`, html)))
      }
      cancelEditManifest(); fetchAll()
    } catch (err: any) { setEditAlert({ type: 'danger', msg: err.message || 'Update failed.' }) }
    setSavingManifest(false)
  }

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase()
    return (!q || (u.name + u.company + u.email).toLowerCase().includes(q)) && (!roleFilter || u.role === roleFilter)
  })
  const filteredVessels = vesselNames.filter(v => v.toLowerCase().includes(vesselSearch.toLowerCase()))
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

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button className={`tab${activeSection === 'users' ? ' active' : ''}`} onClick={() => setActiveSection('users')}>
          👥 Users {pending > 0 && <span className="badge badge-amber" style={{ marginLeft: 4 }}>{pending}</span>}
        </button>
        <button className={`tab${activeSection === 'vessels' ? ' active' : ''}`} onClick={() => setActiveSection('vessels')}>🚢 Vessels</button>
        <button className={`tab${activeSection === 'manifests' ? ' active' : ''}`} onClick={() => setActiveSection('manifests')}>📄 Manifests</button>
      </div>

      {activeSection === 'users' && (
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
            const isEditing = editingUser === u.id
            return (
              <div className="user-row" key={u.id} style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="avatar" style={{ background: u.role === 'cha' ? '#E1F5EE' : '#E6F1FB', color: u.role === 'cha' ? '#0F6E56' : '#0C447C', flexShrink: 0 }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        style={{ fontSize: 13, padding: '4px 8px', flex: 1 }}
                        onKeyDown={e => e.key === 'Enter' && saveUserName(u.id)} autoFocus />
                      <button className="btn btn-success btn-sm" onClick={() => saveUserName(u.id)} disabled={savingUser}>{savingUser ? '...' : '✓'}</button>
                      <button className="btn btn-sm" onClick={() => { setEditingUser(null); setEditName('') }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                      <button onClick={() => { setEditingUser(u.id); setEditName(u.name) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }}>✏</button>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.company} · {u.email} {u.mobile ? `· ${u.mobile}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <span className={`badge ${roleBadge}`}>{roleLabel}</span>
                  <span className={`badge ${statusBadge}`}>{statusLabel}</span>
                  {u.status === 'pending' && <>
                    <button className="btn btn-success btn-sm" onClick={() => updateUserStatus(u.id, 'active')}>✓ Approve</button>
                    <button className="btn btn-danger btn-sm" onClick={() => updateUserStatus(u.id, 'rejected')}>✕ Reject</button>
                  </>}
                  {u.status === 'active' && <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id, u.name)}>🗑 Delete</button>}
                  {u.status === 'rejected' && <button className="btn btn-sm" onClick={() => updateUserStatus(u.id, 'active')}>Reinstate</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeSection === 'vessels' && (
        <div className="card">
          <p className="section-label">Vessel master</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
            <input type="text" value={newVessel} onChange={e => { setNewVessel(e.target.value); setVesselMsg(null) }}
              placeholder="Enter vessel name e.g. MV Kota Baru"
              onKeyDown={e => e.key === 'Enter' && addVessel()} style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={addVessel}>+ Add vessel</button>
          </div>
          {vesselMsg && <div className={`alert alert-${vesselMsg.type}`} style={{ marginBottom: '1rem' }}>{vesselMsg.type === 'success' ? '✓' : '⚠'} {vesselMsg.msg}</div>}
          {vessels.length === 0 ? <div className="empty">No vessels added yet.</div> : vessels.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
              <span style={{ fontSize: 16, marginRight: 10 }}>🚢</span>
              {editingVesselId === v.id ? (
                <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="text" value={editVesselName} onChange={e => setEditVesselName(e.target.value)}
                    style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
                    onKeyDown={e => e.key === 'Enter' && saveVesselName(v.id)} autoFocus />
                  <button className="btn btn-success btn-sm" onClick={() => saveVesselName(v.id)}>✓</button>
                  <button className="btn btn-sm" onClick={() => { setEditingVesselId(null); setEditVesselName('') }}>✕</button>
                </div>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{v.name}</span>
                  <button className="btn btn-sm" style={{ marginRight: 6 }} onClick={() => { setEditingVesselId(v.id); setEditVesselName(v.name) }}>✏ Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeVessel(v.id, v.name)}>Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {activeSection === 'manifests' && (
        <div className="card">
          <p className="section-label">All manifests</p>
          {manifests.length === 0 ? <div className="empty">No manifests uploaded yet.</div> : manifests.map(m => (
            <div key={m.id} style={{ borderBottom: '0.5px solid var(--border)', padding: '10px 0' }}>
              {editingManifestId === m.id ? (
                <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <p className="section-label" style={{ marginBottom: '0.75rem' }}>Edit manifest</p>
                  <div className="field-group" ref={vesselRef} style={{ position: 'relative' }}>
                    <div className="field-label">Vessel name <span className="req">*</span></div>
                    <input type="text" value={vesselSearch}
                      onChange={e => { setVesselSearch(e.target.value); setEditFields(p => ({ ...p, vessel_name: e.target.value })); setShowVesselDrop(true) }}
                      onFocus={() => setShowVesselDrop(true)} placeholder="Search or select vessel..." autoComplete="off" />
                    {showVesselDrop && filteredVessels.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '0.5px solid var(--border-hover)', borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto', marginTop: 2 }}>
                        {filteredVessels.map(v => (
                          <div key={v} onMouseDown={() => { setEditFields(p => ({ ...p, vessel_name: v })); setVesselSearch(v); setShowVesselDrop(false) }}
                            style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '0.5px solid var(--border)' }}
                            onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--gray-100)'}
                            onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}>
                            🚢 {v}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid-2">
                    <div className="field-group">
                      <div className="field-label">Voyage no. <span className="req">*</span></div>
                      <input type="text" value={editFields.voyage_no} onChange={e => setEditFields(p => ({ ...p, voyage_no: e.target.value }))} placeholder="e.g. 2025/44" />
                    </div>
                    <div className="field-group">
                      <div className="field-label">Rotation no. <span className="req">*</span></div>
                      <input type="text" value={editFields.rotation_no} maxLength={7}
                        onChange={e => setEditFields(p => ({ ...p, rotation_no: e.target.value.replace(/\D/g, '') }))} placeholder="e.g. 1198010" />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="field-label">Update file <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button className={`btn btn-sm${!replaceFile ? ' btn-primary' : ''}`} onClick={() => setReplaceFile(false)}>Add alongside</button>
                      <button className={`btn btn-sm${replaceFile ? ' btn-primary' : ''}`} onClick={() => setReplaceFile(true)}>Replace old file</button>
                    </div>
                    <div className="drop-zone" style={{ padding: '0.75rem' }} onClick={() => fileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.json')) setNewFile(f) }}>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{newFile ? `✓ ${newFile.name}` : 'Click or drop new JSON file'}</div>
                    </div>
                    <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
                      onChange={e => { if (e.target.files?.[0]) setNewFile(e.target.files[0]) }} />
                  </div>
                  {editAlert && <div className={`alert alert-${editAlert.type}`} style={{ marginBottom: '0.75rem' }}>{editAlert.msg}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => saveManifest(m)} disabled={savingManifest}>{savingManifest ? 'Saving...' : '✓ Save changes'}</button>
                    <button className="btn" onClick={cancelEditManifest}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="manifest-row" style={{ padding: 0, border: 'none', margin: 0 }}>
                  <div className="mr-icon">📄</div>
                  <div className="mr-main">
                    <div className="mr-vessel">{m.vessel_name} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>{m.file_name}</span></div>
                    <div className="mr-meta">Voyage {m.voyage_no} · Rotation {m.rotation_no} · {m.uploader_name} · {m.created_at?.slice(0, 10)}</div>
                  </div>
                  <div className="mr-right">
                    <span className={`badge ${BMAP[m.status] || 'badge-blue'}`}>{BLBL[m.status] || m.status}</span>
                    <button className="btn btn-sm" onClick={() => startEditManifest(m)}>✏ Edit</button>
                    <button className="btn btn-dl" onClick={() => download(m)} disabled={downloadingId === m.id}>
                      {downloadingId === m.id ? '...' : '↓ Download'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteManifest(m)}
                      disabled={deletingId === m.id} style={{ padding: '5px 10px' }}>
                      {deletingId === m.id ? '...' : '🗑'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}