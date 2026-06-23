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

interface RotationGroup {
  key: string
  vessel_name: string
  voyage_no: string
  rotation_no: string
  status: string
  created_at: string
  files: any[]
}

export default function MyUploadsPage() {
  const { user } = useAuth()
  const [manifests, setManifests] = useState<any[]>([])
  const [vessels, setVessels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [zipping, setZipping] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Edit state — one panel per rotation (fields), one panel per file (file replacement)
  const [editingRotation, setEditingRotation] = useState<string | null>(null) // rotation_no being edited
  const [editFields, setEditFields] = useState({ vessel_name: '', voyage_no: '', rotation_no: '' })
  const [vesselSearch, setVesselSearch] = useState('')
  const [showVesselDrop, setShowVesselDrop] = useState(false)
  const [editAlert, setEditAlert] = useState<{ type: string; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // File replacement — per individual file
  const [replacingFileId, setReplacingFileId] = useState<string | null>(null)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [replaceMode, setReplaceMode] = useState(false)
  const [fileAlert, setFileAlert] = useState<{ type: string; msg: string } | null>(null)
  const [savingFile, setSavingFile] = useState(false)

  const vesselRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchData()
    supabase.from('vessels').select('name').order('name').then(({ data }) => {
      setVessels(data?.map((r: any) => r.name) || [])
    })
    function handleClick(e: MouseEvent) {
      if (vesselRef.current && !vesselRef.current.contains(e.target as Node)) setShowVesselDrop(false)
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

  function groupByRotation(items: any[]): RotationGroup[] {
    const map = new Map<string, RotationGroup>()
    for (const m of items) {
      const key = m.rotation_no
      if (!map.has(key)) {
        map.set(key, { key, vessel_name: m.vessel_name, voyage_no: m.voyage_no, rotation_no: m.rotation_no, status: m.status, created_at: m.created_at, files: [] })
      }
      map.get(key)!.files.push(m)
    }
    return Array.from(map.values())
  }

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  // Start editing fields for a rotation group
  function startEditRotation(group: RotationGroup) {
    setEditingRotation(group.key)
    setEditFields({ vessel_name: group.vessel_name, voyage_no: group.voyage_no, rotation_no: group.rotation_no })
    setVesselSearch(group.vessel_name)
    setEditAlert(null)
  }

  function cancelEditRotation() { setEditingRotation(null); setEditAlert(null) }

  // Save fields — updates ALL files in this rotation
  async function saveRotationFields(group: RotationGroup) {
    if (!editFields.vessel_name.trim()) { setEditAlert({ type: 'danger', msg: 'Vessel name required.' }); return }
    if (!editFields.voyage_no.trim()) { setEditAlert({ type: 'danger', msg: 'Voyage required.' }); return }
    if (!/^\d{7}$/.test(editFields.rotation_no.trim())) { setEditAlert({ type: 'danger', msg: 'Rotation must be exactly 7 digits.' }); return }
    setSaving(true)
    try {
      // Update all files in this rotation
      await Promise.all(group.files.map(f => supabase.from('manifests').update({
        vessel_name: editFields.vessel_name.trim(),
        voyage_no: editFields.voyage_no.trim(),
        rotation_no: editFields.rotation_no.trim(),
      }).eq('id', f.id)))

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
      </div>`

      const { data: chaUsers } = await supabase.from('profiles').select('email, name').eq('role', 'cha').eq('status', 'active')
      if (chaUsers && chaUsers.length > 0) {
        await Promise.all(chaUsers.map((cha: any) => sendEmail(cha.email, cha.name,
          `Manifest updated — ${editFields.vessel_name} · Voyage ${editFields.voyage_no} · Rotation ${editFields.rotation_no}`, notifyHtml)))
      }
      await sendEmail(user!.email, user!.name,
        `Your manifest was updated — ${editFields.vessel_name} · Rotation ${editFields.rotation_no}`,
        notifyHtml.replace('A manifest has been updated', 'Your manifest has been updated successfully'))

      cancelEditRotation(); fetchData()
    } catch (err: any) { setEditAlert({ type: 'danger', msg: err.message || 'Update failed.' }) }
    setSaving(false)
  }

  // Start replacing a specific file
  function startReplaceFile(fileId: string) {
    setReplacingFileId(fileId); setNewFile(null); setReplaceMode(false); setFileAlert(null)
  }

  function cancelReplaceFile() { setReplacingFileId(null); setNewFile(null); setFileAlert(null) }

  async function saveFileReplacement(m: any) {
    if (!newFile) { setFileAlert({ type: 'danger', msg: 'Please select a file.' }); return }
    setSavingFile(true)
    try {
      if (replaceMode && m.file_path) await supabase.storage.from('manifests').remove([m.file_path])
      const path = `${user!.id}/${m.rotation_no}/${Date.now()}_${newFile.name}`
      const { error: upErr } = await supabase.storage.from('manifests').upload(path, newFile, { contentType: 'application/json' })
      if (upErr) throw upErr
      await supabase.from('manifests').update({ file_path: path, file_name: newFile.name }).eq('id', m.id)
      cancelReplaceFile(); fetchData()
    } catch (err: any) { setFileAlert({ type: 'danger', msg: err.message || 'File update failed.' }) }
    setSavingFile(false)
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
      const date = group.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${cleanVessel}_${cleanVoyage}_${group.rotation_no}_${date}_ALL.zip`
      a.click()
    } catch { alert('ZIP download failed.') }
    setZipping(null)
  }

  const groups = groupByRotation(manifests)
  const filteredVessels = vessels.filter(v => v.toLowerCase().includes(vesselSearch.toLowerCase()))

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem' }}>
        {groups.length} rotation{groups.length !== 1 ? 's' : ''} · {manifests.length} file{manifests.length !== 1 ? 's' : ''} uploaded by you
      </div>
      <div className="card" style={{ padding: '0 1.5rem' }}>
        {loading ? (
          <div className="empty">Loading...</div>
        ) : groups.length === 0 ? (
          <div className="empty">No manifests uploaded yet.</div>
        ) : groups.map(group => (
          <div key={group.key} style={{ borderBottom: '0.5px solid var(--border)', padding: '12px 0' }}>

            {/* Rotation header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="mr-icon">📦</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mr-vessel">{group.vessel_name}</div>
                <div className="mr-meta">
                  Voyage {group.voyage_no} · Rotation {group.rotation_no} · {group.created_at?.slice(0, 10)}
                  {group.files.length > 1 && (
                    <span style={{ marginLeft: 8, background: 'var(--blue-light)', color: 'var(--blue-dark)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 500 }}>
                      {group.files.length} files
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                <span className={`badge ${BMAP[group.status] || 'badge-blue'}`}>{BLBL[group.status] || group.status}</span>
                {/* Edit fields button — always at rotation level */}
                <button className="btn btn-sm" onClick={() => editingRotation === group.key ? cancelEditRotation() : startEditRotation(group)}>
                  {editingRotation === group.key ? '✕ Cancel' : '✏ Edit'}
                </button>
                {group.files.length === 1 ? (
                  <button className="btn btn-dl" onClick={() => downloadFile(group.files[0])} disabled={downloadingId === group.files[0].id}>
                    {downloadingId === group.files[0].id ? '...' : '↓ Download'}
                  </button>
                ) : (
                  <>
                    <button className="btn btn-sm" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggleExpand(group.key)}>
                      {expanded.has(group.key) ? '▲ Hide' : `▼ ${group.files.length} files`}
                    </button>
                    <button className="btn btn-dl" onClick={() => downloadZip(group)} disabled={zipping === group.rotation_no}>
                      {zipping === group.rotation_no ? '...' : '↓ ZIP all'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Fields edit panel — ONE per rotation */}
            {editingRotation === group.key && (
              <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '1rem', marginTop: 10 }}>
                <p className="section-label" style={{ marginBottom: '0.75rem' }}>Edit manifest details</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  These fields apply to all {group.files.length} file{group.files.length > 1 ? 's' : ''} in this rotation.
                </p>

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
                  <button className="btn btn-primary" onClick={() => saveRotationFields(group)} disabled={saving}>
                    {saving ? 'Saving...' : '✓ Save changes'}
                  </button>
                  <button className="btn" onClick={cancelEditRotation}>Cancel</button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>All active CHA users will be notified of this update.</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>To replace or add a file, use the file buttons below.</p>
              </div>
            )}

            {/* Individual file rows — for multi-file or always visible for single file */}
            {(group.files.length > 1 && expanded.has(group.key)) && (
              <div style={{ marginTop: 8, marginLeft: 42, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.files.map((f, i) => (
                  <div key={f.id}>
                    {replacingFileId === f.id ? (
                      <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '0.75rem', marginBottom: 4 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Update file: {f.file_name}</p>
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
                        <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 20 }}>📄</span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{f.file_name || `File ${i + 1}`}</span>
                        <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => startReplaceFile(f.id)}>📎 File</button>
                        <button className="btn btn-dl btn-sm" onClick={() => downloadFile(f)} disabled={downloadingId === f.id}>
                          {downloadingId === f.id ? '...' : '↓'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Single file — show file update option when edit is open */}
            {group.files.length === 1 && editingRotation === group.key && (
              <div style={{ marginTop: 8, marginLeft: 42 }}>
                {replacingFileId === group.files[0].id ? (
                  <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Update file</p>
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
                      <button className="btn btn-primary btn-sm" onClick={() => saveFileReplacement(group.files[0])} disabled={savingFile}>{savingFile ? '...' : '✓ Save file'}</button>
                      <button className="btn btn-sm" onClick={cancelReplaceFile}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => startReplaceFile(group.files[0].id)}>📎 Update file</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}