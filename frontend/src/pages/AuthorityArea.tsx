import PortalLayout from '../components/PortalLayout'

const NAV_ITEMS = [
  { to: '/authority', label: 'Dashboard', end: true },
  { to: '/authority/complaints', label: 'My Complaints' },
]

export default function AuthorityArea() {
  return <PortalLayout portalName="Authority Portal" navItems={NAV_ITEMS} />
}