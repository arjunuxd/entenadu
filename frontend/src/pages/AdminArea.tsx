import PortalLayout from '../components/PortalLayout'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/complaints', label: 'Complaints' },
  { to: '/admin/authorities', label: 'Authorities' },
]

export default function AdminArea() {
  return <PortalLayout portalName="Admin Portal" navItems={NAV_ITEMS} />
}