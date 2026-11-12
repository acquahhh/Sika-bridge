import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { api } from '../../api/endpoints'
import StatusBadge from '../../components/StatusBadge'
import TransferListItem, { formatDate } from '../../components/TransferListItem'
import { Alert, Button, ButtonLink, Card, EmptyState, ErrorAlert, PageTitle, Row, Spinner } from '../../components/ui'
import { COUNTRIES } from '../../lib/countries'
import { formatMoney, formatRate } from '../../lib/money'
import { useLoad } from '../../lib/useLoad'

const FILTERS = [
  ['ALL', 'All'],
  ['PAYOUT_PENDING', 'Pending'],
  ['IN_PROGRESS', 'In progress'],
  ['PAID', 'Paid'],
  ['REFUNDED', 'Refunded'],
]

export function TransfersPage() {
  const { data, error, loading } = useLoad(() => api.listTransfers(), [], { intervalMs: 20_000 })
  const [filter, setFilter] = useState('ALL')
  const rows = (data ?? []).filter((t) => filter === 'ALL' || t.status === filter)

  return (
    <div className="space-y-4">
      <PageTitle back="/home">History</PageTitle>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
              filter === value ? 'bg-emerald-700 text-white ring-emerald-700' : 'bg-white text-slate-700 ring-slate-300'
            }`}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorAlert error={error} />
      ) : loading && !data ? (
        <div className="flex justify-center py-8 text-emerald-700">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState>{filter === 'ALL' ? 'No transfers yet.' : 'No transfers with this status.'}</EmptyState>
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-slate-100">
            {rows.map((t) => (
              <TransferListItem key={t.id} transfer={t} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

const STEPS = ['PAYOUT_PENDING', 'IN_PROGRESS', 'PAID']
const STEP_LABELS = { PAYOUT_PENDING: 'Sent, waiting for payout', IN_PROGRESS: 'Agent is paying out', PAID: 'Paid to recipient' }

function Timeline({ status }) {
  if (status === 'REFUNDED') return null
  const current = STEPS.indexOf(status)
  return (
    <ol className="mt-4 space-y-3">
      {STEPS.map((s, i) => {
        const done = i <= current
        return (
          <li key={s} className="flex items-center gap-3 text-sm">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={done ? 'font-medium text-slate-900' : 'text-slate-500'}>{STEP_LABELS[s]}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function TransferDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { data: t, error, loading, reload } = useLoad(() => api.getTransfer(id), [id], { intervalMs: 15_000 })

  if (loading && !t) {
    return (
      <div className="flex justify-center py-10 text-emerald-700">
        <Spinner />
      </div>
    )
  }
  if (error && !t) {
    return (
      <div className="space-y-4">
        <PageTitle back="/transfers">Transfer</PageTitle>
        <ErrorAlert error={error} />
      </div>
    )
  }

  const dest = COUNTRIES[t.recv_country]
  return (
    <div className="space-y-4">
      <PageTitle back="/transfers">Transfer</PageTitle>
      {location.state?.justSent && t.status === 'PAYOUT_PENDING' && (
        <Alert tone="success" title="Money sent">
          {t.recipient_name} will receive {formatMoney(t.receive_amount, t.recv_currency)} once a local agent pays out.
        </Alert>
      )}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              To {dest?.flag} {t.recipient_name}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(t.receive_amount, t.recv_currency)}</p>
          </div>
          <StatusBadge status={t.status} />
        </div>
        <Timeline status={t.status} />
        {t.status === 'REFUNDED' && (
          <div className="mt-4">
            <Alert tone="info" title="Refunded to your wallet">
              {formatMoney(t.send_amount, t.send_currency)} (including the fee) was returned to your wallet.
              {t.failure_reason && <span className="mt-1 block">Reason: {t.failure_reason}</span>}
            </Alert>
          </div>
        )}
      </Card>

      <Card>
        <dl className="divide-y divide-slate-100">
          <Row label="You sent">{formatMoney(t.send_amount, t.send_currency)}</Row>
          <Row label="Fee">{formatMoney(t.fee, t.send_currency)}</Row>
          <Row label="Converted">{formatMoney(t.net_amount, t.send_currency)}</Row>
          <Row label="Rate">
            1 {t.send_currency} = {formatRate(t.rate)} {t.recv_currency}
          </Row>
          <Row label="Recipient gets" strong>
            {formatMoney(t.receive_amount, t.recv_currency)}
          </Row>
        </dl>
      </Card>

      <Card>
        <dl className="divide-y divide-slate-100">
          <Row label="Recipient">{t.recipient_name}</Row>
          <Row label="Phone">{t.recipient_phone}</Row>
          <Row label="Payout">{t.payout_method === 'bank' ? `${t.bank_name} · ${t.bank_account}` : 'Mobile money'}</Row>
          {t.payout_reference && (
            <Row label="Payout ref">
              <span className="font-mono text-xs">{t.payout_reference}</span>
            </Row>
          )}
          <Row label="Created">{formatDate(t.created_at)}</Row>
          <Row label="Updated">{formatDate(t.updated_at)}</Row>
          <Row label="Transfer ID">
            <span className="font-mono text-xs">{t.id}</span>
          </Row>
        </dl>
      </Card>

      {error && <ErrorAlert error={error} />}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={reload}>
          Refresh
        </Button>
        <ButtonLink to="/send">Send again</ButtonLink>
      </div>
    </div>
  )
}
