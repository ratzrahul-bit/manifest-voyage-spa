import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const BMAP: Record<string, string> = { arrived: 'badge-green', 'in-transit': 'badge-amber', departed: 'badge-blue' }
const BLBL: Record<string, string> = { arrived: 'Arrived', 'in-transit': 'In transit', departed: 'Departed' }

function getFileName(m: any) {
  const uploadDate = m.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)
  const cleanVessel = m.vessel_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  const cleanVoyage = m.voyage_no.replace(/\//g, '-').replace(/\s+/g, '')
  return `${cleanVessel}_${cleanVoyage}_${m.rotation_no}_${uploadDate}.json`
}

async function sendEmail(to: string, toName: string, subject: string, html: string) {
  await fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, toName, subject, html }),
  })
}

export default function MyUploadsPage() {
  const { user } = useAuth()
  const [manifests, setManifests] = useState<any[]>([])
  const [vessels, setVessels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [replaceFile, setReplaceFile] = useState(false)
  const [editFields, setEditFields] = useState({ vessel_name: '', voyage_no: '', rotation_no: '' })
  const [editAlert, setEditAlert] = useState<{ type: string; msg: string } | null>(null)
  const [vesselSearch, setVesselSearch] = useState('')
  const [showVesselDropdown, setShowVesselDropdown] = useState(false)
  const vesselRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchData()
    supabase.from('vessels').select('name').order('name').then(({ data }) => {
      setVessels(data?.map((r: any) => r.name) || [])
    })
    function handleClick(e: MouseEvent) {
      if (vesselRef.current && !vesselRef.current.contains(e.target as Node)) setShowVesselDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchData() {
    const { data } = await supabase.from('manifests').select('*')
      .eq('uploaded_by', user!.id).order('created_at', { ascending: false })
    setManifests(data || [])
    setLoading(false)
  }

  function startEdit(m: any) {
    setEditingId(m.id)
    setEditFields({ vessel_name: m.vessel_name, voyage_no: m.voyage_no, rotation_no: m.rotation_no })
    setVesselSearch(m.vessel_name)
    setNewFile(null)
    setReplaceFile(false)
    setEditAlert(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setNewFile(null)
    setReplaceFile(false)
    setEditAlert(null)
  }

  async function saveEdit(m: any) {
    if (!editFields.vessel_name.trim()) { setEditAlert({ type: 'danger', msg: 'Vessel name required.' }); return }
    if (!editFields.voyage_no.trim()) { setEditAlert({ type: 'danger', msg: 'Voyage required.' }); return }
    if (!/^\d{7}$/.test(editFields.rotation_no.trim())) { setEditAlert({ type: 'danger', msg: 'Rotation must be exactly 7 digits.' }); return }

    setSaving(true)
    try {
      let filePath = m.file_path
      let fileName = m.file_name

      if (newFile) {
        if (replaceFile && m.file_path) {
          // Delete old file
          await supabase.storage.from('manifests').remove([m.file_path])
        }
        // Upload new file
        const path = `${user!.id}/${editFields.rotation_no.trim()}/${Date.now()}_${newFile.name}`
        const { error: upErr } = await supabase.storage.from('manifests').upload(path, newFile, { contentType: 'application/json' })
        if (upErr) throw upErr
        filePath = path
        fileName = newFile.name
      }

      await supabase.from('manifests').update({
        vessel_name: editFields.vessel_name.trim(),
        voyage_no: editFields.voyage_no.trim(),
        rotation_no: editFields.rotation_no.trim(),
        file_path: filePath,
        file_name: fileName,
      }).eq('id', m.id)

      // Notify all active CHAs
      const { data: chaUsers } = await supabase.from('profiles').select('email, name').eq('role', 'cha').eq('status', 'active')
      const notifyHtml = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#185FA5;margin-bottom:16px">ManifestNepal — Manifest Updated</h2>
        <p>A manifest has been updated and is available for download.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Vessel</td><td style="padding:10px">${editFields.vessel_name}</td></tr>
          <tr><td style="padding:10px;font-weight:600">Voyage</td><td style="padding:10px">${editFields.voyage_no}</td></tr>
          <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Rotation</td><td style="padding:10px">${editFields.rotation_no}</td></tr>
          <tr><td style="padding:10px;font-weight:600">Updated by</td><td style="padding:10px">${user!.name} · ${user!.company}</td></tr>
        </table>
        <p><a href="https://igmnepal.netlify.app/manifests" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Download manifest</a></p>
        <p style="color:#6B7280;font-size:13px;margin-top:16px">This is an automated message from ManifestNepal.</p>
      </div>`

      if (chaUsers && chaUsers.length > 0) {
        await Promise.all(chaUsers.map((cha: any) => sendEmail(
          cha.email, cha.name,
          `Manifest updated — ${editFields.vessel_name} · Voyage ${editFields.voyage_no} · Rotation ${editFields.rotation_no}`,
          notifyHtml
        )))
      }

      // Notify the uploader themselves
      await sendEmail(
        user!.email, user!.name,
        `Your manifest was updated — ${editFields.vessel_name} · Rotation ${editFields.rotation_no}`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#185FA5;margin-bottom:16px">ManifestNepal — Update Confirmed</h2>
          <p>Dear ${user!.name}, your manifest has been updated successfully.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Vessel</td><td style="padding:10px">${editFields.vessel_name}</td></tr>
            <tr><td style="padding:10px;font-weight:600">Voyage</td><td style="padding:10px">${editFields.voyage_no}</td></tr>
            <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Rotation</td><td style="padding:10px">${editFields.rotation_no}</td></tr>
          </table>
          <p style="color:#6B7280;font-size:13px">This is an automated message from ManifestNepal.</p>
        </div>`
      )

      setEditingId(null); setNewFile(null); setReplaceFile(false)
      setEditAlert(null)
      fetchData()
    } catch (err: any) {
      setEditAlert({ type: 'danger', msg: err.message || 'Update failed.' })
    }
    setSaving(false)
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
      }
    } catch { alert('Download failed. Please try again.') }
    setDownloadingId(null)
  }

  const filteredVessels = vessels.filter(v => v.toLowerCase().includes(vesselSearch.toLowerCase()))

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem' }}>
        {manifests.length} manifest{manifests.length !== 1 ? 's' : ''} uploaded by you
      </div>
      <div className="card" style={{ padding: '0 1.5rem' }}>
        {loading ? (
          <div className="empty">Loading...</div>
        ) : manifests.length === 0 ? (
          <div className="empty">No manifests uploaded yet.</div>
        ) : manifests.map(m => (
          <div key={m.id} style={{ borderBottom: '0.5px solid var(--border)', padding: '12px 0' }}>
            {editingId === m.id ? (
              // Edit mode
              <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                <p className="section-label" style={{ marginBottom: '0.75rem' }}>Edit manifest</p>

                {/* Vessel searchable dropdown */}
                <div className="field-group" ref={vesselRef} style={{ position: 'relative' }}>
                  <div className="field-label">Vessel name <span className="req">*</span></div>
                  <input type="text" value={vesselSearch}
                    onChange={e => { setVesselSearch(e.target.value); setEditFields(p => ({ ...p, vessel_name: e.target.value })); setShowVesselDropdown(true) }}
                    onFocus={() => setShowVesselDropdown(true)}
                    placeholder="Search or select vessel..." autoComplete="off" />
                  {showVesselDropdown && filteredVessels.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '0.5px solid var(--border-hover)', borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto', marginTop: 2 }}>
                      {filteredVessels.map(v => (
                        <div key={v} onMouseDown={() => { setEditFields(p => ({ ...p, vessel_name: v })); setVesselSearch(v); setShowVesselDropdown(false) }}
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
                    <div className="field-label">Rotation no. <span className="req">*</span> <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(7 digits)</span></div>
                    <input type="text" value={editFields.rotation_no} maxLength={7}
                      onChange={e => setEditFields(p => ({ ...p, rotation_no: e.target.value.replace(/\D/g, '') }))}
                      placeholder="e.g. 1198010" />
                  </div>
                </div>

                {/* File update section */}
                <div className="field-group">
                  <div className="field-label">Update file <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button className={`btn btn-sm${!replaceFile ? ' btn-primary' : ''}`} onClick={() => setReplaceFile(false)}>Add alongside old file</button>
                    <button className={`btn btn-sm${replaceFile ? ' btn-primary' : ''}`} onClick={() => setReplaceFile(true)}>Replace old file</button>
                  </div>
                  <div className="drop-zone" style={{ padding: '0.75rem', marginBottom: 0 }}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.json')) setNewFile(f) }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {newFile ? `✓ ${newFile.name} · ${(newFile.size / 1024).toFixed(1)} KB` : 'Click or drop new JSON file here'}
                    </div>
                  </div>
                  <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) setNewFile(e.target.files[0]) }} />
                </div>

                {editAlert && <div className={`alert alert-${editAlert.type}`} style={{ marginBottom: '0.75rem' }}>{editAlert.type === 'success' ? '✓' : '⚠'} {editAlert.msg}</div>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => saveEdit(m)} disabled={saving}>
                    {saving ? 'Saving...' : '✓ Save changes'}
                  </button>
                  <button className="btn" onClick={cancelEdit}>Cancel</button>
                </div>
                {!saving && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>All active CHA users will be notified of this update.</p>}
              </div>
            ) : (
              // View mode
              <div className="manifest-row" style={{ padding: 0, border: 'none', margin: 0 }}>
                <div className="mr-icon">📄</div>
                <div className="mr-main">
                  <div className="mr-vessel">{m.vessel_name}</div>
                  <div className="mr-meta">Voyage {m.voyage_no} · Rotation {m.rotation_no} · {m.created_at?.slice(0, 10)} {m.file_name && <span>· {m.file_name}</span>}</div>
                </div>
                <div className="mr-right">
                  <span className={`badge ${BMAP[m.status] || 'badge-blue'}`}>{BLBL[m.status] || m.status}</span>
                  <button className="btn btn-sm" onClick={() => startEdit(m)}>✏ Edit</button>
                  <button className="btn btn-dl" onClick={() => download(m)} disabled={downloadingId === m.id}>
                    {downloadingId === m.id ? '...' : '↓ Download'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}