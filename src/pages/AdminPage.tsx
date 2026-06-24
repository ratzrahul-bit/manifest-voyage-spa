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

interface RotationGroup {
  key: string
  vessel_name: string
  voyage_no: string
  rotation_no: string
  uploader_name: string
  uploader_company: string
  status: string
  created_at: string
  files: any[]
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
  const [zipping, setZipping] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [editingVesselId, setEditingVesselId] = useState<string | null>(null)
  const [editVesselName, setEditVesselName] = useState('')
  const [editingRotation, setEditingRotation] = useState<string | null>(null)
  const [editFields, setEditFields] = useState({ vessel_name: '', voyage_no: '', rotation_no: '' })
  const [vesselSearch, setVesselSearch] = useState('')
  const [showVesselDrop, setShowVesselDrop] = useState(false)
  const [editAlert, setEditAlert] = useState<{ type: string; msg: string } | null>(null)
  const [savingRotation, setSavingRotation] = useState(false)
  const [replacingFileId, setReplacingFileId] = useState<string | null>(null)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [replaceMode, setReplaceMode] = useState(false)
  const [fileAlert, setFileAlert] = useState<{ type: string; msg: string } | null>(null)
  const [savingFile, setSavingFile] = useState(false)

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

  function groupByRotation(items: any[]): RotationGroup[] {
    const map = new Map<string, RotationGroup>()
    for (const m of items) {
      const key = m.rotation_no
      if (!map.has(key)) {
        map.set(key, {
          key, vessel_name: m.vessel_name, voyage_no: m.voyage_no,
          rotation_no: m.rotation_no, uploader_name: m.uploader_name,
          uploader_company: m.uploader_company, status: m.status,
          created_at: m.created_at, files: [],
        })
      }
      map.get(key)!.files.push(m)
    }
    return Array.from(map.values())
  }

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  function startEditRotation(group: RotationGroup) {
    setEditingRotation(group.key)
    setEditFields({ vessel_name: group.vessel_name, voyage_no: group.voyage_no, rotation_no: group.rotation_no })
    setVesselSearch(group.vessel_name)
    setEditAlert(null)
  }

  function cancelEditRotation() { setEditingRotation(null); setEditAlert(null) }

  async function saveRotationFields(group: RotationGroup) {
    if (!editFields.vessel_name.trim()) { setEditAlert({ type: 'danger', msg: 'Vessel required.' }); return }
    if (!editFields.voyage_no.trim()) { setEditAlert({ type: 'danger', msg: 'Voyage required.' }); return }
    if (!/^\d{7}$/.test(editFields.rotation_no.trim())) { setEditAlert({ type: 'danger', msg: 'Rotation must be 7 digits.' }); return }
    setSavingRotation(true)
    try {
      await Promise.all(group.files.map(f => supabase.from('manifests').update({
        vessel_name: editFields.vessel_name.trim(),
        voyage_no: editFields.voyage_no.trim(),
        rotation_no: editFields.rotation_no.trim(),
      }).eq('id', f.id)))

      const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#185FA5">Himalayan Manifest — Manifest Updated</h2>
        <p>A manifest has been updated by the admin.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Vessel</td><td style="padding:10px">${editFields.vessel_name}</td></tr>
          <tr><td style="padding:10px;font-weight:600">Voyage</td><td style="padding:10px">${editFields.voyage_no}</td></tr>
          <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Rotation</td><td style="padding:10px">${editFields.rotation_no}</td></tr>
        </table>
        <p><a href="https://himalayanmanifest.netlify.app/manifests" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Download manifest</a></p>
      </div>`

      const { data: chaUsers } = await supabase.from('profiles').select('email, name').eq('role', 'cha').eq('status', 'active')
      if (chaUsers && chaUsers.length > 0) {
        await Promise.all(chaUsers.map((cha: any) => sendEmail(cha.email, cha.name,
          `Manifest updated — ${editFields.vessel_name} · Voyage ${editFields.voyage_no} · Rotation ${editFields.rotation_no}`, html)))
      }
      cancelEditRotation(); fetchAll()
    } catch (err: any) { setEditAlert({ type: 'danger', msg: err.message || 'Update failed.' }) }
    setSavingRotation(false)
  }

  function startReplaceFile(fileId: string) {
    setReplacingFileId(fileId); setNewFile(null); setReplaceMode(false); setFileAlert(null)
  }

  function cancelReplaceFile() { setReplacingFileId(null); setNewFile(null); setFileAlert(null) }

  async function saveFileReplacement(m: any) {
    if (!newFile) { setFileAlert({ type: 'danger', msg: 'Please select a file.' }); return }
    setSavingFile(true)
    try {
      if (replaceMode && m.file_path) await supabase.storage.from('manifests').remove([m.file_path])
      const path = `admin/${m.rotation_no}/${Date.now()}_${newFile.name}`
      const { error: upErr } = await supabase.storage.from('manifests').upload(path, newFile, { contentType: 'application/json' })
      if (upErr) throw upErr
      await supabase.from('manifests').update({ file_path: path, file_name: newFile.name }).eq('id', m.id)
      cancelReplaceFile(); fetchAll()
    } catch (err: any) { setFileAlert({ type: 'danger', msg: err.message || 'File update failed.' }) }
    setSavingFile(false)
  }

  async function deleteManifest(m: any) {
    if (!confirm(`Delete this file "${m.file_name || m.rotation_no}"? This cannot be undone.`)) return
    setDeletingId(m.id)
    if (m.file_path) await supabase.storage.from('manifests').remove([m.file_path])
    await supabase.from('manifests').delete().eq('id', m.id)
    setDeletingId(null); fetchAll()
  }

  async function downloadFile(m: any) {
    setDownloadingId(m.id)
    try {
      if (m.file_path) {
        const { data, error } = await supabase.storage.from('manifests').download(m.file_path)
        if (error) throw error
        const a = document.createElement('a')
        a.href = URL.createObjectURL(data)
        a.download = getFileName(m)
        a.click()
      }
    } catch { alert('Download failed.') }
    setDownloadingId(null)
  }

  async function downloadZip(group: RotationGroup) {
    setZipping(group.rotation_no)
    try {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
      document.head.appendChild(script)
      await new Promise(resolve => { script.onload = resolve })
      const JSZip = (window as any).JSZip
      const zip = new JSZip()
      for (const m of group.files) {
        if (m.file_path) {
          const { data, error } = await supabase.storage.from('manifests').download(m.file_path)
          if (!error && data) zip.file(getFileName(m), await data.text())
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const cleanVessel = group.vessel_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
      const cleanVoyage = group.voyage_no.replace(/\//g, '-').replace(/\s+/g, '')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${cleanVessel}_${cleanVoyage}_${group.rotation_no}_${group.created_at?.slice(0, 10)}_ALL.zip`
      a.click()
    } catch { alert('ZIP download failed.') }
    setZipping(null)
  }

  async function updateUserStatus(id: string, status: string) {
    await supabase.from('profiles').update({ status }).eq('id', id)
    if (status === 'active') {
      const u = users.find(x => x.id === id)
      if (u?.email) {
        const roleLabel = u.role === 'cha' ? 'CHA (Customs House Agent)' : 'Shipping Line / Liner Agent'
        await sendEmail(u.email, u.name, 'Your Himalayan Manifest account has been approved',
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#185FA5">Himalayan Manifest — Account Approved</h2>
            <p>Dear ${u.name}, your registration has been approved.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Name</td><td style="padding:10px">${u.name}</td></tr>
              <tr><td style="padding:10px;font-weight:600">Company</td><td style="padding:10px">${u.company}</td></tr>
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">User type</td><td style="padding:10px">${roleLabel}</td></tr>
            </table>
            <p><a href="https://himalayanmanifest.netlify.app" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Sign in →</a></p>
          </div>`)
      }
    }
    if (status === 'rejected') {
      const u = users.find(x => x.id === id)
      if (u?.email) {
        await sendEmail(u.email, u.name, 'Your Himalayan Manifest registration was not approved',
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#A32D2D">Himalayan Manifest — Registration Update</h2>
            <p>Dear ${u.name}, your registration could not be approved. Contact <a href="mailto:himalayanmanifest@gmail.com">himalayanmanifest@gmail.com</a>.</p>
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

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase()
    return (!q || (u.name + u.company + u.email).toLowerCase().includes(q)) && (!roleFilter || u.role === roleFilter)
  })
  const filteredVessels = vesselNames.filter(v => v.toLowerCase().includes(vesselSearch.toLowerCase()))
  const active = users.filter(u => u.status === 'active').length
  const pending = users.filter(u => u.status === 'pending').length
  const groups = groupByRotation(manifests)

  if (loading) return <div className="empty">Loading...</div>

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-val">{groups.length}</div><div className="stat-lbl">Total rotations</div></div>
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
          <p className="section-label">All manifests — {groups.length} rotation{groups.length !== 1 ? 's' : ''} · {manifests.length} file{manifests.length !== 1 ? 's' : ''}</p>
          {groups.length === 0 ? <div className="empty">No manifests uploaded yet.</div> : groups.map(group => (
            <div key={group.key} style={{ borderBottom: '0.5px solid var(--border)', padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="mr-icon">📦</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mr-vessel">{group.vessel_name}
                    {group.files.length > 1 && (
                      <span style={{ marginLeft: 8, background: 'var(--blue-light)', color: 'var(--blue-dark)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 500 }}>
                        {group.files.length} files
                      </span>
                    )}
                  </div>
                  <div className="mr-meta">Voyage {group.voyage_no} · Rotation {group.rotation_no} · {group.uploader_name} · {group.created_at?.slice(0, 10)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  <span className={`badge ${BMAP[group.status] || 'badge-blue'}`}>{BLBL[group.status] || group.status}</span>
                  <button className="btn btn-sm" onClick={() => editingRotation === group.key ? cancelEditRotation() : startEditRotation(group)}>
                    {editingRotation === group.key ? '✕' : '✏ Edit'}
                  </button>
                  {group.files.length === 1 ? (
                    <>
                      <button className="btn btn-dl" onClick={() => downloadFile(group.files[0])} disabled={downloadingId === group.files[0].id}>
                        {downloadingId === group.files[0].id ? '...' : '↓'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteManifest(group.files[0])} disabled={deletingId === group.files[0].id} style={{ padding: '5px 10px' }}>
                        {deletingId === group.files[0].id ? '...' : '🗑'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggleExpand(group.key)}>
                        {expanded.has(group.key) ? '▲ Hide' : `▼ ${group.files.length} files`}
                      </button>
                      <button className="btn btn-dl" onClick={() => downloadZip(group)} disabled={zipping === group.rotation_no}>
                        {zipping === group.rotation_no ? '...' : '↓ ZIP'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingRotation === group.key && (
                <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '1rem', marginTop: 10 }}>
                  <p className="section-label" style={{ marginBottom: '0.75rem' }}>Edit manifest details</p>
                  {group.files.length > 1 && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      These fields apply to all {group.files.length} files in this rotation.
                    </p>
                  )}
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
                  {editAlert && <div className={`alert alert-${editAlert.type}`} style={{ marginBottom: '0.75rem' }}>{editAlert.msg}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => saveRotationFields(group)} disabled={savingRotation}>
                      {savingRotation ? 'Saving...' : '✓ Save changes'}
                    </button>
                    <button className="btn" onClick={cancelEditRotation}>Cancel</button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>To replace individual files, use the file buttons below.</p>
                </div>
              )}

              {group.files.length === 1 && editingRotation === group.key && (
                <div style={{ marginTop: 8, marginLeft: 42 }}>
                  {replacingFileId === group.files[0].id ? (
                    <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button className={`btn btn-sm${!replaceMode ? ' btn-primary' : ''}`} onClick={() => setReplaceMode(false)}>Add alongside</button>
                        <button className={`btn btn-sm${replaceMode ? ' btn-primary' : ''}`} onClick={() => setReplaceMode(true)}>Replace this file</button>
                      </div>
                      <div className="drop-zone" style={{ padding: '0.6rem' }} onClick={() => fileRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.json')) setNewFile(f) }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{newFile ? `✓ ${newFile.name}` : 'Click or drop new JSON file'}</div>
                      </div>
                      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.[0]) setNewFile(e.target.files[0]) }} />
                      {fileAlert && <div className={`alert alert-${fileAlert.type}`} style={{ marginTop: 6 }}>{fileAlert.msg}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => saveFileReplacement(group.files[0])} disabled={savingFile}>{savingFile ? '...' : '✓ Save file'}</button>
                        <button className="btn btn-sm" onClick={cancelReplaceFile}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => startReplaceFile(group.files[0].id)}>📎 Update file</button>
                  )}
                </div>
              )}

              {group.files.length > 1 && expanded.has(group.key) && (
                <div style={{ marginTop: 8, marginLeft: 42, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.files.map((f, i) => (
                    <div key={f.id}>
                      {replacingFileId === f.id ? (
                        <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <button className={`btn btn-sm${!replaceMode ? ' btn-primary' : ''}`} onClick={() => setReplaceMode(false)}>Add alongside</button>
                            <button className={`btn btn-sm${replaceMode ? ' btn-primary' : ''}`} onClick={() => setReplaceMode(true)}>Replace this file</button>
                          </div>
                          <div className="drop-zone" style={{ padding: '0.6rem' }} onClick={() => fileRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); const fl = e.dataTransfer.files[0]; if (fl?.name.endsWith('.json')) setNewFile(fl) }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{newFile ? `✓ ${newFile.name}` : 'Click or drop new JSON file'}</div>
                          </div>
                          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
                            onChange={e => { if (e.target.files?.[0]) setNewFile(e.target.files[0]) }} />
                          {fileAlert && <div className={`alert alert-${fileAlert.type}`} style={{ marginTop: 6 }}>{fileAlert.msg}</div>}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => saveFileReplacement(f)} disabled={savingFile}>{savingFile ? '...' : '✓ Save file'}</button>
                            <button className="btn btn-sm" onClick={cancelReplaceFile}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '7px 12px' }}>
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📄</span>
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{f.file_name || `File ${i + 1}`}</span>
                          <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => startReplaceFile(f.id)}>📎</button>
                          <button className="btn btn-dl btn-sm" onClick={() => downloadFile(f)} disabled={downloadingId === f.id}>
                            {downloadingId === f.id ? '...' : '↓'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteManifest(f)} disabled={deletingId === f.id} style={{ padding: '4px 8px' }}>
                            {deletingId === f.id ? '...' : '🗑'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
