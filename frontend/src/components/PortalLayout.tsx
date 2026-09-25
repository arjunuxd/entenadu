import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export interface NavItem {
  to: string
  label: string
  end?: boolean
}

interface PortalLayoutProps {
  portalName: string
  navItems: NavItem[]
}

export default function PortalLayout({ portalName, navItems }: PortalLayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout(): void {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="portal">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-logo">Ente Nadu</span>
          <span className="topbar-role">{portalName}</span>
        </div>
        <nav className="portal-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user">
          <span className="topbar-name">{user?.name}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>
      <main className="portal-content">
        <Outlet />
      </main>
    </div>
  )
}