import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

async function sendEmail(to: string, toName: string, subject: string, html: string) {
  await fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, toName, subject, html }),
  })
}

export default function UploadPage() {
  const { user } = useAuth()
  const [vessels, setVessels] = useState<string[]>([])
  const [vessel, setVessel] = useState('')
  const [vesselSearch, setVesselSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [voyage, setVoyage] = useState('')
  const [rotation, setRotation] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState<{ type: string; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const vesselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('vessels').select('name').order('name').then(({ data }) => {
      setVessels(data?.map((r: any) => r.name) || [])
    })
    function handleClick(e: MouseEvent) {
      if (vesselRef.current && !vesselRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredVessels = vessels.filter(v =>
    v.toLowerCase().includes(vesselSearch.toLowerCase())
  )

  function selectVessel(name: string) {
    setVessel(name); setVesselSearch(name); setShowDropdown(false)
    setErrors(p => ({ ...p, vessel: '' }))
  }

  function handleFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming)
    const invalid = arr.filter(f => !f.name.endsWith('.json'))
    if (invalid.length) { setAlert({ type: 'danger', msg: 'Only .json files allowed.' }); return }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...arr.filter(f => !names.has(f.name))]
    })
    setErrors(p => ({ ...p, file: '' }))
  }

  function removeFile(name: string) { setFiles(prev => prev.filter(f => f.name !== name)) }

  function validate() {
    const e: Record<string, string> = {}
    if (!vessel.trim()) e.vessel = 'Please select a vessel'
    if (!voyage.trim()) e.voyage = 'Required'
    if (!/^\d{7}$/.test(rotation.trim())) e.rotation = 'Rotation must be exactly 7 digits'
    if (files.length === 0) e.file = 'Please attach at least one JSON file'
    setErrors(e); return Object.keys(e).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true); setAlert(null)
    try {
      // Duplicate check
      const { data: existing } = await supabase.from('manifests')
        .select('id, uploader_name, uploaded_by').eq('rotation_no', rotation.trim()).limit(1)
      if (existing && existing.length > 0 && existing[0].uploaded_by !== user!.id) {
        setAlert({ type: 'danger', msg: `Rotation ${rotation} already uploaded by ${existing[0].uploader_name}. Duplicate not allowed.` })
        setLoading(false); return
      }

      // Upload files
      const uploaded: string[] = []
      for (const file of files) {
        const path = `${user!.id}/${rotation.trim()}/${Date.now()}_${file.name}`
        const { error: uploadErr } = await supabase.storage.from('manifests').upload(path, file, { contentType: 'application/json' })
        if (uploadErr) throw uploadErr
        uploaded.push(path)
      }

      // Insert DB rows
      const rows = await Promise.all(files.map(async (file, i) => ({
        vessel_name: vessel.trim(), voyage_no: voyage.trim(), rotation_no: rotation.trim(),
        file_path: uploaded[i], file_name: file.name,
        uploaded_by: user!.id, uploader_name: user!.name, uploader_company: user!.company,
        status: 'departed', raw_content: await file.text(),
      })))
      const { error: dbErr } = await supabase.from('manifests').insert(rows)
      if (dbErr) throw dbErr

      // Send acknowledgement to uploader
      await sendEmail(
        user!.email, user!.name,
        `Manifest uploaded — ${vessel} · Voyage ${voyage} · Rotation ${rotation}`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#185FA5;margin-bottom:16px">IGM Nepal — Upload Acknowledgement</h2>
          <p>Dear ${user!.name},</p>
          <p>Your manifest has been successfully uploaded to the IGM Nepal platform.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Vessel</td><td style="padding:10px">${vessel}</td></tr>
            <tr><td style="padding:10px;font-weight:600">Voyage</td><td style="padding:10px">${voyage}</td></tr>
            <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Rotation</td><td style="padding:10px">${rotation}</td></tr>
            <tr><td style="padding:10px;font-weight:600">Files uploaded</td><td style="padding:10px">${files.length}</td></tr>
            <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Uploaded by</td><td style="padding:10px">${user!.name} · ${user!.company}</td></tr>
          </table>
          <p style="color:#6B7280;font-size:13px">This is an automated message from IGM Nepal Manifest Exchange.</p>
        </div>`
      )

      // Notify all active CHA users
      const { data: chaUsers } = await supabase.from('profiles')
        .select('email, name').eq('role', 'cha').eq('status', 'active')
      if (chaUsers && chaUsers.length > 0) {
        await Promise.all(chaUsers.map((cha: any) => sendEmail(
          cha.email, cha.name,
          `New manifest available — ${vessel} · Voyage ${voyage} · Rotation ${rotation}`,
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#185FA5;margin-bottom:16px">IGM Nepal — New Manifest Available</h2>
            <p>Dear ${cha.name},</p>
            <p>A new manifest has been uploaded and is available for download on the IGM Nepal platform.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Vessel</td><td style="padding:10px">${vessel}</td></tr>
              <tr><td style="padding:10px;font-weight:600">Voyage</td><td style="padding:10px">${voyage}</td></tr>
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Rotation</td><td style="padding:10px">${rotation}</td></tr>
              <tr><td style="padding:10px;font-weight:600">Uploaded by</td><td style="padding:10px">${user!.name} · ${user!.company}</td></tr>
              <tr style="background:#E6F1FB"><td style="padding:10px;font-weight:600">Files</td><td style="padding:10px">${files.length} file${files.length > 1 ? 's' : ''}</td></tr>
            </table>
            <p><a href="https://igmnepal.netlify.app/manifests" style="background:#185FA5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Download manifest</a></p>
            <p style="color:#6B7280;font-size:13px;margin-top:16px">This is an automated message from IGM Nepal Manifest Exchange.</p>
          </div>`
        )))
      }

      setAlert({ type: 'success', msg: `${files.length} file${files.length > 1 ? 's' : ''} uploaded — ${vessel} · Voyage ${voyage} · Rotation ${rotation}. Notifications sent.` })
      setVessel(''); setVesselSearch(''); setVoyage(''); setRotation(''); setFiles([])
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: any) {
      setAlert({ type: 'danger', msg: err.message || 'Upload failed. Please try again.' })
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="card">
        <p className="section-label">Manifest details</p>

        <div className="field-group" ref={vesselRef} style={{ position: 'relative' }}>
          <div className="field-label">Vessel name <span className="req">*</span></div>
          <input type="text" value={vesselSearch}
            onChange={e => { setVesselSearch(e.target.value); setVessel(''); setShowDropdown(true); setErrors(p => ({ ...p, vessel: '' })) }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search or select vessel..." autoComplete="off" />
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '0.5px solid var(--border-hover)', borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
              {filteredVessels.length === 0 ? (
                <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                  {vessels.length === 0 ? 'No vessels added yet. Contact admin.' : 'No vessels match your search.'}
                </div>
              ) : filteredVessels.map(v => (
                <div key={v} onMouseDown={() => selectVessel(v)}
                  style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: vessel === v ? 'var(--blue-light)' : 'transparent', color: vessel === v ? 'var(--blue-dark)' : 'var(--text)', fontWeight: vessel === v ? 500 : 400, borderBottom: '0.5px solid var(--border)' }}
                  onMouseEnter={e => { if (vessel !== v) (e.target as HTMLElement).style.background = 'var(--gray-100)' }}
                  onMouseLeave={e => { if (vessel !== v) (e.target as HTMLElement).style.background = 'transparent' }}>
                  🚢 {v}
                </div>
              ))}
            </div>
          )}
          {vessel && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>✓ {vessel} selected</div>}
          {errors.vessel && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.vessel}</div>}
        </div>

        <div className="grid-2">
          <div className="field-group">
            <div className="field-label">Voyage no. <span className="req">*</span></div>
            <input type="text" value={voyage} onChange={e => { setVoyage(e.target.value); setErrors(p => ({ ...p, voyage: '' })) }} placeholder="e.g. 2025/44" />
            {errors.voyage && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.voyage}</div>}
          </div>
          <div className="field-group">
            <div className="field-label">Rotation no. <span className="req">*</span> <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(7 digits)</span></div>
            <input type="text" value={rotation} maxLength={7}
              onChange={e => { const v = e.target.value.replace(/\D/g, ''); setRotation(v); setErrors(p => ({ ...p, rotation: '' })) }}
              placeholder="e.g. 1198010" />
            {errors.rotation && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.rotation}</div>}
          </div>
        </div>

        <hr className="divider" />
        <p className="section-label">Manifest files <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(multiple allowed)</span></p>

        <div className={`drop-zone${over ? ' over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files) }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 3 }}>Drop JSON files here or click to browse</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Multiple .json files allowed</div>
        </div>
        <input ref={fileRef} type="file" accept=".json" multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files) handleFiles(e.target.files) }} />

        {files.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {files.map(f => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--green)' }}>✓</span>
                <span style={{ flex: 1 }}><strong>{f.name}</strong> · {(f.size / 1024).toFixed(1)} KB</span>
                <button onClick={() => removeFile(f.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14, padding: '0 4px' }}>✕</button>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{files.length} file{files.length > 1 ? 's' : ''} selected</div>
          </div>
        )}
        {errors.file && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.file}</div>}

        {alert && <div className={`alert alert-${alert.type}`} style={{ marginTop: '1rem' }}>{alert.type === 'success' ? '✓' : '⚠'} {alert.msg}</div>}

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Uploading...' : `↑ Upload ${files.length > 1 ? files.length + ' files' : 'manifest'}`}
          </button>
          <button className="btn" onClick={() => { setVessel(''); setVesselSearch(''); setVoyage(''); setRotation(''); setFiles([]); setErrors({}); setAlert(null); if (fileRef.current) fileRef.current.value = '' }}>Clear</button>
        </div>
      </div>
    </div>
  )
}
