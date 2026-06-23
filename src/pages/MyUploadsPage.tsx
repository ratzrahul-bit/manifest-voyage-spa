import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const BMAP: Record<string, string> = { arrived: 'badge-green', 'in-transit': 'badge-amber', departed: 'badge-blue' }
const BLBL: Record<string, string> = { arrived: 'Arrived', 'in-transit': 'In transit', departed: 'Departed' }

export default function MyUploadsPage() {
  const { user } = useAuth()
  const [manifests, setManifests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('manifests').select('*').eq('uploaded_by', user!.id).order('created_at', { ascending: false })
      .then(({ data }) => { setManifests(data || []); setLoading(false) })
  }, [])

  async function download(m: any) {
    setDownloadingId(m.id)
    try {
      if (m.file_path) {
        const { data, error } = await supabase.storage.from('manifests').download(m.file_path)
        if (error) throw error
        const a = document.createElement('a')
        a.href = URL.createObjectURL(data)
        a.download = m.file_name || `${m.vessel_name.replace(/\s+/g, '_')}_ROT${m.rotation_no}_manifest.json`
        a.click()
      }
    } catch { alert('Download failed. Please try again.') }
    setDownloadingId(null)
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem' }}>{manifests.length} manifest{manifests.length !== 1 ? 's' : ''} uploaded by you</div>
      <div className="card" style={{ padding: '0 1.5rem' }}>
        {loading ? (
          <div className="empty">Loading...</div>
        ) : manifests.length === 0 ? (
          <div className="empty">No manifests uploaded yet.</div>
        ) : manifests.map(m => (
          <div className="manifest-row" key={m.id}>
            <div className="mr-icon">📄</div>
            <div className="mr-main">
              <div className="mr-vessel">{m.vessel_name}</div>
              <div className="mr-meta">Voyage {m.voyage_no} · Rotation {m.rotation_no} · {m.created_at?.slice(0, 10)}</div>
            </div>
            <div className="mr-right">
              <span className={`badge ${BMAP[m.status] || 'badge-blue'}`}>{BLBL[m.status] || m.status}</span>
              <button className="btn btn-dl" onClick={() => download(m)} disabled={downloadingId === m.id}>
                {downloadingId === m.id ? '...' : '↓ Download'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
