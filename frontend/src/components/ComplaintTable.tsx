import { Link } from 'react-router-dom'
import type { ComplaintView, Pagination } from '../types/complaint'
import StatusBadge from './StatusBadge'
import { formatDate, truncate } from '../utils/format'

interface ComplaintTableProps {
  items: ComplaintView[]
  detailPath: (complaintId: string) => string
}

export default function ComplaintTable({ items, detailPath }: ComplaintTableProps) {
  if (items.length === 0) {
    return <p className="empty">No complaints found.</p>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Complaint</th>
            <th>Category</th>
            <th>Description</th>
            <th>Place</th>
            <th>Authority</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.complaintId}>
              <td>
                <Link className="link" to={detailPath(item.complaintId)}>
                  {item.complaintId}
                </Link>
              </td>
              <td>{item.category ?? '—'}</td>
              <td>{truncate(item.originalDescription, 80)}</td>
              <td>{item.place ? `${item.place.name}, ${item.place.district}` : '—'}</td>
              <td title={item.authority?.code ?? ''}>{item.authority?.name ?? '—'}</td>
              <td>{item.severity ?? '—'}</td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>{formatDate(item.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface PaginationBarProps {
  pagination: Pagination
  onChange: (page: number) => void
}

export function PaginationBar({ pagination, onChange }: PaginationBarProps) {
  const { page, totalPages, total } = pagination
  if (totalPages <= 1) return null

  return (
    <div className="pagination">
      <span className="muted">
        Page {page} of {totalPages} · {total} results
      </span>
      <div className="pagination-actions">
        <button className="btn btn-ghost btn-sm" type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Prev
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}