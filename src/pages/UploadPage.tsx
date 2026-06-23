import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const VESSELS = [
  'MV Shree Tirupati','MV Balaji Express','MV Ganga Sagar','MV Sundarbans',
  'MV Hooghly Star','MV Eastern Pioneer','MV Raxaul Link','MV Birgunj Carrier',
  'MV Kolkata Bay','MV Nepal Gateway',
]

export default function UploadPage() {
  const { user } = useAuth()
  const [vessel, setVessel] = useState('')
  const [customVessel, setCustomVessel] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [voyage, setVoyage] = useState('')
  const [rotation, setRotation] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState<{ type: string; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const finalVessel = showCustom ? customVessel : vessel

  function handleVesselChange(val: string) {
    if (val === '__custom__') {
      setShowCustom(true)
      setVessel('__custom__')
      setCustomVessel('')
    } else {
      setShowCustom(false)
      setVessel(val)
      setCustomVessel('')
    }
    setErrors(p => ({ ...p, vessel: '' }))
  }

  function handleFile(f: File) {
    if (!f.name.endsWith('.json')) { setAlert({ type: 'danger', msg: 'Please upload a .json file only.' }); return }
    setFile(f)
    setErrors(prev => ({ ...prev, file: '' }))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!finalVessel.trim()) e.vessel = 'Required'
    if (!voyage.trim()) e.voyage = 'Required'
    if (!rotation.trim()) e.rotation = 'Required'
    if (!file) e.file = 'Please attach a JSON file'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true); setAlert(null)
    try {
      const content = await file!.text()
      const path = `${user!.id}/${Date.now()}_${file!.name}`
      const { error: uploadErr } = await supabase.storage.from('manifests').upload(path, file!, { contentType: 'application/json' })
      if (uploadErr) throw uploadErr

      const { error: dbErr } = await supabase.from('manifests').insert({
        vessel_name: finalVessel.trim(),
        voyage_no: voyage.trim(),
        rotation_no: rotation.trim(),
        file_path: path,
        file_name: file!.name,
        uploaded_by: user!.id,
        uploader_name: user!.name,
        uploader_company: user!.company,
        status: 'departed',
        raw_content: content,
      })
      if (dbErr) throw dbErr

      setAlert({ type: 'success', msg: `Manifest uploaded — ${finalVessel} · Voyage ${voyage} · Rotation ${rotation}` })
      setVessel(''); setCustomVessel(''); setShowCustom(false)
      setVoyage(''); setRotation(''); setFile(null)
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

        <div className="field-group">
          <div className="field-label">Vessel name <span className="req">*</span></div>
          <select value={vessel} onChange={e => handleVesselChange(e.target.value)}>
            <option value="">— Select vessel —</option>
            {VESSELS.map(v => <option key={v} value={v}>{v}</option>)}
            <option value="__custom__">+ Type new vessel name...</option>
          </select>
          {showCustom && (
            <input
              type="text"
              style={{ marginTop: 8 }}
              placeholder="Type vessel name here"
              value={customVessel}
              onChange={e => { setCustomVessel(e.target.value); setErrors(p => ({ ...p, vessel: '' })) }}
              autoFocus
            />
          )}
          {errors.vessel && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.vessel}</div>}
        </div>

        <div className="grid-2">
          <div className="field-group">
            <div className="field-label">Voyage no. <span className="req">*</span></div>
            <input type="text" value={voyage} onChange={e => { setVoyage(e.target.value); setErrors(p => ({ ...p, voyage: '' })) }} placeholder="e.g. 2025/44" />
            {errors.voyage && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.voyage}</div>}
          </div>
          <div className="field-group">
            <div className="field-label">Rotation no. <span className="req">*</span></div>
            <input type="text" value={rotation} onChange={e => { setRotation(e.target.value); setErrors(p => ({ ...p, rotation: '' })) }} placeholder="e.g. KOL-2025-081" />
            {errors.rotation && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.rotation}</div>}
          </div>
        </div>

        <hr className="divider" />
        <p className="section-label">Manifest file</p>

        <div
          className={`drop-zone${over ? ' over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 3 }}>Drop JSON manifest here or click to browse</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>.json files only</div>
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />

        {file && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            ✓ <strong>{file.name}</strong> · {(file.size / 1024).toFixed(1)} KB
          </div>
        )}
        {errors.file && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.file}</div>}

        {alert && <div className={`alert alert-${alert.type}`} style={{ marginTop: '1rem' }}>{alert.type === 'success' ? '✓' : '⚠'} {alert.msg}</div>}

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Uploading...' : '↑ Upload manifest'}
          </button>
          <button className="btn" onClick={() => { setVessel(''); setCustomVessel(''); setShowCustom(false); setVoyage(''); setRotation(''); setFile(null); setErrors({}); setAlert(null); if (fileRef.current) fileRef.current.value = '' }}>Clear</button>
        </div>
      </div>
    </div>
  )
}
