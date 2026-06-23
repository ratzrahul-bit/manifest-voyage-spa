import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BMAP: Record<string, string> = { arrived: 'badge-green', 'in-transit': 'badge-amber', departed: 'badge-blue' }
const BLBL: Record<string, string> = { arrived: 'Arrived', 'in-transit': 'In transit', departed: 'Departed' }

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
  uploader_company: string
  uploader_name: string
  status: string
  created_at: string
  files: any[]
}

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [zipping, setZipping] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => { fetchManifests() }, [])

  async function fetchManifests() {
    const { data } = await supabase.from('manifests').select('*').order('created_at', { ascending: false })
    setManifests(data || [])
    setLoading(false)
  }

  // Group by rotation_no
  function groupByRotation(items: any[]): RotationGroup[] {
    const map = new Map<string, RotationGroup>()
    for (const m of items) {
      const key = m.rotation_no
      if (!map.has(key)) {
        map.set(key, {
          key,
          vessel_name: m.vessel_name,
          voyage_no: m.voyage_no,
          rotation_no: m.rotation_no,
          uploader_company: m.uploader_company,
          uploader_name: m.uploader_name,
          status: m.status,
          created_at: m.created_at,
          files: [],
        })
      }
      map.get(key)!.files.push(m)
    }
    return Array.from(map.values())
  }

  async function downloadFile(m: any) {
    setDownloading(m.id)
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
    setDownloading(null)
  }

  async function downloadZip(group: RotationGroup) {
    setZipping(group.rotation_no)
    try {
      // Dynamic import of JSZip from CDN
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
      document.head.appendChild(script)
      await new Promise(resolve => { script.onload = resolve })

      const JSZip = (window as any).JSZip
      const zip = new JSZip()

      for (const m of group.files) {
        if (m.file_path) {
          const { data, error } = await supabase.storage.from('manifests').download(m.file_path)
          if (!error && data) {
            const text = await data.text()
            zip.file(getFileName(m), text)
          }
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
    } catch { alert('ZIP download failed. Please try again.') }
    setZipping(null)
  }

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = manifests.filter(m => {
    const q = search.toLowerCase()
    const mq = !q || (m.vessel_name + m.voyage_no + m.rotation_no + (m.uploader_company || '')).toLowerCase().includes(q)
    const ms = !statusFilter || m.status === statusFilter
    return mq && ms
  })

  const groups = groupByRotation(filtered)

  return (
    <div>
      <div className="card" style={{ padding: '1rem 1.5rem' }}>
        <div className="search-bar">
          <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vessel, voyage, rotation, company..." />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="arrived">Arrived</option>
            <option value="in-transit">In transit</option>
            <option value="departed">Departed</option>
          </select>
          <button className="btn btn-sm" onClick={() => { setSearch(''); setStatusFilter('') }}>↺</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{groups.length} rotation{groups.length !== 1 ? 's' : ''} available</div>
      </div>

      <div className="card" style={{ padding: '0 1.5rem' }}>
        {loading ? (
          <div className="empty">Loading manifests...</div>
        ) : groups.length === 0 ? (
          <div className="empty">No manifests found.</div>
        ) : groups.map(group => (
          <div key={group.key} style={{ borderBottom: '0.5px solid var(--border)', padding: '12px 0' }}>
            {/* Rotation header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="mr-icon">📦</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mr-vessel">{group.vessel_name}</div>
                <div className="mr-meta">
                  Voyage {group.voyage_no} · Rotation {group.rotation_no} · {group.uploader_company} · {group.created_at?.slice(0, 10)}
                  {group.files.length > 1 && (
                    <span style={{ marginLeft: 8, background: 'var(--blue-light)', color: 'var(--blue-dark)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 500 }}>
                      {group.files.length} files
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span className={`badge ${BMAP[group.status] || 'badge-blue'}`}>{BLBL[group.status] || group.status}</span>
                {group.files.length === 1 ? (
                  <button className="btn btn-dl" onClick={() => downloadFile(group.files[0])} disabled={downloading === group.files[0].id}>
                    {downloading === group.files[0].id ? '...' : '↓ Download'}
                  </button>
                ) : (
                  <>
                    <button className="btn btn-sm" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggleExpand(group.key)}>
                      {expanded.has(group.key) ? '▲ Hide files' : `▼ ${group.files.length} files`}
                    </button>
                    <button className="btn btn-dl" onClick={() => downloadZip(group)} disabled={zipping === group.rotation_no}>
                      {zipping === group.rotation_no ? '...' : '↓ ZIP all'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expanded file list for multi-file rotations */}
            {group.files.length > 1 && expanded.has(group.key) && (
              <div style={{ marginTop: 8, marginLeft: 42, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.files.map((f, i) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '7px 12px' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 20 }}>📄</span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
                      {f.file_name || `File ${i + 1}`}
                    </span>
                    <button className="btn btn-dl btn-sm" onClick={() => downloadFile(f)} disabled={downloading === f.id}>
                      {downloading === f.id ? '...' : '↓ Download'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}