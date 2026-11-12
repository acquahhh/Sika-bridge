import { Link } from 'react-router-dom'
import { COUNTRIES } from '../lib/countries'
import { formatMoney } from '../lib/money'
import StatusBadge from './StatusBadge'

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function TransferListItem({ transfer: t }) {
  const dest = COUNTRIES[t.recv_country]
  return (
    <li>
      <Link
        to={`/transfers/${t.id}`}
        className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-slate-50"
      >
        <span className="text-2xl" aria-hidden="true">{dest?.flag}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">{t.recipient_name}</p>
          <p className="text-xs text-slate-500">{formatDate(t.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(t.receive_amount, t.recv_currency)}</p>
          <StatusBadge status={t.status} />
        </div>
      </Link>
    </li>
  )
}
