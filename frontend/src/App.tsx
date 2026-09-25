import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AdminArea from './pages/AdminArea'
import AuthorityArea from './pages/AuthorityArea'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminComplaints from './pages/admin/AdminComplaints'
import AdminComplaintDetail from './pages/admin/AdminComplaintDetail'
import AdminAuthorities from './pages/admin/AdminAuthorities'
import AuthorityDashboard from './pages/authority/AuthorityDashboard'
import AuthorityComplaints from './pages/authority/AuthorityComplaints'
import AuthorityComplaintDetail from './pages/authority/AuthorityComplaintDetail'
import Home from './pages/Home'
import Login from './pages/Login'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminArea />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="complaints" element={<AdminComplaints />} />
        <Route path="complaints/:complaintId" element={<AdminComplaintDetail />} />
        <Route path="authorities" element={<AdminAuthorities />} />
      </Route>
      <Route
        path="/authority"
        element={
          <ProtectedRoute roles={['authority']}>
            <AuthorityArea />
          </ProtectedRoute>
        }
      >
        <Route index element={<AuthorityDashboard />} />
        <Route path="complaints" element={<AuthorityComplaints />} />
        <Route path="complaints/:complaintId" element={<AuthorityComplaintDetail />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  )
}