import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import AuthPage from './pages/AuthPage'
import UploadPage from './pages/UploadPage'
import ManifestsPage from './pages/ManifestsPage'
import MyUploadsPage from './pages/MyUploadsPage'
import AdminPage from './pages/AdminPage'
import PendingPage from './pages/PendingPage'
import AppShell from './components/AppShell'

function Inner() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6B7280' }}>Loading...</div>
  if (!user) return <AuthPage />
  if (user.status === 'pending') return <PendingPage />
  if (user.status === 'rejected') return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#A32D2D' }}>Your account has been rejected. Contact admin.</div>

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={user.role === 'admin' ? '/admin' : user.role === 'cha' ? '/manifests' : '/upload'} />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/my-uploads" element={<MyUploadsPage />} />
        {(user.role === 'cha' || user.role === 'admin') && <Route path="/manifests" element={<ManifestsPage />} />}
        {user.role === 'admin' && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return <AuthProvider><Inner /></AuthProvider>
}