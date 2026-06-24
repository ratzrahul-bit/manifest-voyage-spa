export default function ContactPage() {
  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue-dark)', fontFamily: 'Cambria, serif' }}>Himalayan Manifest</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>India-Nepal Manifest Exchange</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Registration & Access */}
          <div style={{ background: 'var(--blue-light)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', borderLeft: '4px solid var(--blue-dark)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-dark)', marginBottom: 6 }}>📋 Registration & Access</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              Your account will be approved within <strong>6 hours</strong> of registration.
              <br />If not approved, please write to us at <strong>himalayanmanifest@gmail.com</strong>
            </div>
          </div>

          {/* Technical Support */}
          <div style={{ background: '#F0FDF4', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', borderLeft: '4px solid #166534' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>🛠 Technical Support</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              Facing any issues on the platform? Report to us and we will resolve them promptly.
            </div>
          </div>

          {/* Upload on behalf */}
          <div style={{ background: '#FFF7ED', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', borderLeft: '4px solid #92400E' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>📤 Upload on Your Behalf</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              Shipping lines without system access can email the manifest file to us. We will upload it on your behalf.
            </div>
          </div>

        </div>
      </div>

      {/* Contact details */}
      <div className="card" style={{ background: 'var(--blue-dark)', padding: '1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5BB8E8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Get in touch</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a href="mailto:himalayanmanifest@gmail.com" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius)', padding: '12px 16px', textDecoration: 'none' }}>
            <span style={{ fontSize: 20 }}>📧</span>
            <div>
              <div style={{ fontSize: 11, color: '#A0C4D8', marginBottom: 2 }}>Email</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>himalayanmanifest@gmail.com</div>
            </div>
          </a>
          <a href="tel:+919864111118" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius)', padding: '12px 16px', textDecoration: 'none' }}>
            <span style={{ fontSize: 20 }}>📞</span>
            <div>
              <div style={{ fontSize: 11, color: '#A0C4D8', marginBottom: 2 }}>Phone</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>+91 98641 11118</div>
            </div>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
            <span style={{ fontSize: 20 }}>🌐</span>
            <div>
              <div style={{ fontSize: 11, color: '#A0C4D8', marginBottom: 2 }}>Platform</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>himalayanmanifest.netlify.app</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: 11, color: '#A0C4D8', fontStyle: 'italic' }}>
          Access by admin approval only · Free to use
        </div>
      </div>
    </div>
  )
}
