import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BMAP: Record<string, string> = { arrived: 'badge-green', 'in-transit': 'badge-amber', departed: 'badge-blue' }
const BLBL: Record<string, string> = { arrived: 'Arrived', 'in-transit': 'In transit', departed: 'Departed' }

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { fetchManifests() }, [])

  async function fetchManifests() {
    const { data } = await supabase.from('manifests').select('*').order('created_at', { ascending: false })
    setManifests(data || [])
    setLoading(false)
  }

  async function download(m: any) {
    const content = m.raw_content || JSON.stringify({
      manifest_id: m.id,
      vessel_name: m.vessel_name,
      voyage_no: m.voyage_no,
      rotation_no: m.rotation_no,
      uploaded_by: m.uploader_name,
      company: m.uploader_company,
      date: m.created_at?.slice(0, 10),
      generated_by: 'Vessel Manifest Exchange'
    }, null, 2)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    a.download = `${m.vessel_name.replace(/\s+/g, '_')}_VOY${m.voyage_no.replace(/\//g, '-')}_ROT${m.rotation_no}_manifest.json`
    a.click()
  }

  const filtered = manifests.filter(m => {
    const q = search.toLowerCase()
    const mq = !q || (m.vessel_name + m.voyage_no + m.rotation_no + (m.uploader_company || '')).toLowerCase().includes(q)
    const ms = !statusFilter || m.status === statusFilter
    return mq && ms
  })

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
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} manifest{filtered.length !== 1 ? 's' : ''} available</div>
      </div>

      <div className="card" style={{ padding: '0 1.5rem' }}>
        {loading ? (
          <div className="empty">Loading manifests...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No manifests found.</div>
        ) : filtered.map(m => (
          <div className="manifest-row" key={m.id}>
            <div className="mr-icon">📄</div>
            <div className="mr-main">
              <div className="mr-vessel">{m.vessel_name}</div>
              <div className="mr-meta">Voyage {m.voyage_no} · Rotation {m.rotation_no} · {m.uploader_company} · {m.created_at?.slice(0, 10)}</div>
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
