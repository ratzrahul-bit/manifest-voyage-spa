import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function UploadPage() {
  const { user } = useAuth()
  const [vessels, setVessels] = useState<string[]>([])
  const [vessel, setVessel] = useState('')
  const [customVessel, setCustomVessel] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [voyage, setVoyage] = useState('')
  const [rotation, setRotation] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState<{ type: string; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('vessels').select('name').order('name').then(({ data }) => {
      setVessels(data?.map((r: any) => r.name) || [])
    })
  }, [])

  const finalVessel = showCustom ? customVessel : vessel

  function handleVesselChange(val: string) {
    if (val === '__custom__') {
      setShowCustom(true); setVessel('__custom__'); setCustomVessel('')
    } else {
      setShowCustom(false); setVessel(val); setCustomVessel('')
    }
    setErrors(p => ({ ...p, vessel: '' }))
  }

  function handleFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming)
    const invalid = arr.filter(f => !f.name.endsWith('.json'))
    if (invalid.length) { setAlert({ type: 'danger', msg: 'Only .json files allowed.' }); return }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      const newOnes = arr.filter(f => !names.has(f.name))
      return [...prev, ...newOnes]
    })
    setErrors(p => ({ ...p, file: '' }))
  }

  function removeFile(name: string) {
    setFiles(prev => prev.filter(f => f.name !== name))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!finalVessel.trim()) e.vessel = 'Required'
    if (!voyage.trim()) e.voyage = 'Required'
    if (!/^\d{7}$/.test(rotation.trim())) e.rotation = 'Rotation must be exactly 7 digits'
    if (files.length === 0) e.file = 'Please attach at least one JSON file'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true); setAlert(null)

    try {
      // Check if rotation already exists
      const { data: existing } = await supabase
        .from('manifests')
        .select('id, uploader_name, uploaded_by')
        .eq('rotation_no', rotation.trim())
        .limit(1)

      if (existing && existing.length > 0) {
        const orig = existing[0]
        if (orig.uploaded_by !== user!.id) {
          setAlert({ type: 'danger', msg: `Rotation ${rotation} already uploaded by ${orig.uploader_name}. Duplicate not allowed.` })
          setLoading(false); return
        }
        // Same user — allow adding more parts
      }

      // Upload all files
      const uploaded: string[] = []
      for (const file of files) {
        const path = `${user!.id}/${rotation.trim()}/${Date.now()}_${file.name}`
        const { error: uploadErr } = await supabase.storage
          .from('manifests')
          .upload(path, file, { contentType: 'application/json' })
        if (uploadErr) throw uploadErr
        uploaded.push(path)
      }

      // Insert one DB record per file
      const rows = await Promise.all(files.map(async (file, i) => {
        const content = await file.text()
        return {
          vessel_name: finalVessel.trim(),
          voyage_no: voyage.trim(),
          rotation_no: rotation.trim(),
          file_path: uploaded[i],
          file_name: file.name,
          uploaded_by: user!.id,
          uploader_name: user!.name,
          uploader_company: user!.company,
          status: 'departed',
          raw_content: content,
        }
      }))

      const { error: dbErr } = await supabase.from('manifests').insert(rows)
      if (dbErr) throw dbErr

      setAlert({ type: 'success', msg: `${files.length} file${files.length > 1 ? 's' : ''} uploaded — ${finalVessel} · Voyage ${voyage} · Rotation ${rotation}` })
      setVessel(''); setCustomVessel(''); setShowCustom(false)
      setVoyage(''); setRotation(''); setFiles([])
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
            {vessels.map(v => <option key={v} value={v}>{v}</option>)}
            <option value="__custom__">+ Type new vessel name...</option>
          </select>
          {showCustom && (
            <input type="text" style={{ marginTop: 8 }} placeholder="Type vessel name"
              value={customVessel}
              onChange={e => { setCustomVessel(e.target.value); setErrors(p => ({ ...p, vessel: '' })) }}
              autoFocus />
          )}
          {errors.vessel && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.vessel}</div>}
        </div>

        <div className="grid-2">
          <div className="field-group">
            <div className="field-label">Voyage no. <span className="req">*</span></div>
            <input type="text" value={voyage}
              onChange={e => { setVoyage(e.target.value); setErrors(p => ({ ...p, voyage: '' })) }}
              placeholder="e.g. 2025/44" />
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
                <span>✓</span>
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
          <button className="btn" onClick={() => { setVessel(''); setCustomVessel(''); setShowCustom(false); setVoyage(''); setRotation(''); setFiles([]); setErrors({}); setAlert(null); if (fileRef.current) fileRef.current.value = '' }}>Clear</button>
        </div>
      </div>
    </div>
  )
}
