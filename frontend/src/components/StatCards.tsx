import type { ComplaintStatus, StatusTotals } from '../types/complaint'
import StatusBadge from './StatusBadge'

const CARD_ORDER: ComplaintStatus[] = ['submitted', 'verified', 'assigned', 'under_review', 'in_progress', 'completed', 'rejected']

interface StatCardsProps {
  totals: StatusTotals
}

export default function StatCards({ totals }: StatCardsProps) {
  return (
    <div className="stat-grid">
      <div className="stat-card stat-total">
        <span className="stat-value">{totals.total}</span>
        <span className="stat-label">Total</span>
      </div>
      {CARD_ORDER.map((status) => (
        <div key={status} className={`stat-card stat-${status}`}>
          <span className="stat-value">{totals[status]}</span>
          <span className="stat-label">
            <StatusBadge status={status} />
          </span>
        </div>
      ))}
    </div>
  )
}