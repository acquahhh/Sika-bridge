const STYLES = {
  PAYOUT_PENDING: { label: 'Payout pending', cls: 'bg-amber-100 text-amber-900 ring-amber-300' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-sky-100 text-sky-900 ring-sky-300' },
  PAID: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  REFUNDED: { label: 'Refunded', cls: 'bg-slate-200 text-slate-800 ring-slate-300' },
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-900 ring-amber-300' },
  SUCCESSFUL: { label: 'Successful', cls: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  FAILED: { label: 'Failed', cls: 'bg-red-100 text-red-900 ring-red-300' },
}

export default function StatusBadge({ status }) {
  const s = STYLES[status] ?? { label: status, cls: 'bg-slate-100 text-slate-800 ring-slate-300' }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  )
}
