import { useState } from 'react'
import { api } from '../../api/endpoints'
import { useAuth } from '../../auth/AuthContext'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../components/TransferListItem'
import { Alert, Button, Card, EmptyState, ErrorAlert, PageTitle, Row, Spinner, TextInput } from '../../components/ui'
import { COUNTRIES } from '../../lib/countries'
import { formatMoney } from '../../lib/money'
import { useLoad } from '../../lib/useLoad'

function PayoutCard({ payout: p, onChanged }) {
  const [mode, setMode] = useState(null) // 'complete' | 'fail'
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const mine = p.status === 'IN_PROGRESS'

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      setMode(null)
      setText('')
      onChanged(updated)
    } catch (err) {
      setError(err)
      if (err.status === 409 || err.status === 404) onChanged(null)
    } finally {
      setBusy(false)
    }
  }

  const minLen = 3
  return (
    <Card className={mine ? 'ring-2 ring-sky-400' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{p.recipient_name}</p>
          <p className="text-sm text-slate-600">{p.recipient_phone}</p>
        </div>
        <StatusBadge status={p.status} />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-800">{formatMoney(p.receive_amount, p.recv_currency)}</p>
      <dl className="mt-2 border-t border-slate-100 pt-1">
        <Row label="Pay via">{p.payout_method === 'bank' ? 'Bank transfer' : 'Mobile money'}</Row>
        {p.payout_method === 'bank' && (
          <>
            <Row label="Bank">{p.bank_name}</Row>
            <Row label="Account">
              <span className="font-mono">{p.bank_account}</span>
            </Row>
          </>
        )}
        <Row label="From">
          {COUNTRIES[p.send_country]?.flag} {p.send_country}
        </Row>
        <Row label="Created">{formatDate(p.created_at)}</Row>
        <Row label="ID">
          <span className="font-mono text-xs">{p.id.slice(0, 12)}…</span>
        </Row>
      </dl>

      <div className="mt-3 space-y-3">
        {p.status === 'PAYOUT_PENDING' && (
          <Button className="w-full" loading={busy} onClick={() => run(() => api.claimPayout(p.id))}>
            Claim payout
          </Button>
        )}

        {mine && !mode && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setMode('complete')}>Mark as paid</Button>
            <Button variant="danger" onClick={() => setMode('fail')}>
              Can't pay
            </Button>
          </div>
        )}

        {mine && mode && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim().length < minLen) return
              run(() => (mode === 'complete' ? api.completePayout(p.id, text.trim()) : api.failPayout(p.id, text.trim())))
            }}
          >
            {mode === 'complete' ? (
              <TextInput
                label="Payout reference"
                placeholder="MoMo / bank transaction ID"
                value={text}
                onChange={(e) => setText(e.target.value)}
                hint="The transaction ID from the MoMo or bank receipt."
                autoFocus
              />
            ) : (
              <TextInput
                label="Reason"
                placeholder="e.g. Recipient number not registered"
                value={text}
                onChange={(e) => setText(e.target.value)}
                hint="The sender is refunded in full, fee included."
                autoFocus
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setMode(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={mode === 'complete' ? 'primary' : 'danger'}
                loading={busy}
                disabled={text.trim().length < minLen}
              >
                {mode === 'complete' ? 'Confirm paid' : 'Fail & refund'}
              </Button>
            </div>
          </form>
        )}
        <ErrorAlert error={error} />
      </div>
    </Card>
  )
}

export default function AgentPayoutsPage() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useLoad(() => api.agentPayouts(), [], { intervalMs: 15_000 })
  const [notice, setNotice] = useState(null)
  const country = COUNTRIES[user.country]

  const rows = data ?? []
  const inProgress = rows.filter((p) => p.status === 'IN_PROGRESS')
  const queue = rows.filter((p) => p.status === 'PAYOUT_PENDING')

  function onChanged(updated) {
    if (updated?.status === 'PAID') setNotice({ tone: 'success', text: `Paid ${formatMoney(updated.receive_amount, updated.recv_currency)} to ${updated.recipient_name}.` })
    else if (updated?.status === 'REFUNDED') setNotice({ tone: 'info', text: `Payout to ${updated.recipient_name} failed and the sender was refunded.` })
    else setNotice(null)
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>
          Payouts · {country?.flag} {country?.name}
        </PageTitle>
        <Button variant="ghost" onClick={reload} className="-mt-4">
          Refresh
        </Button>
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {error && <ErrorAlert error={error} />}
      {loading && !data ? (
        <div className="flex justify-center py-10 text-emerald-700">
          <Spinner />
        </div>
      ) : (
        <>
          {inProgress.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Claimed by you ({inProgress.length})</h2>
              {inProgress.map((p) => (
                <PayoutCard key={p.id} payout={p} onChanged={onChanged} />
              ))}
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Waiting ({queue.length})</h2>
            {queue.length === 0 ? (
              <EmptyState>No payouts waiting. New ones appear here automatically.</EmptyState>
            ) : (
              queue.map((p) => <PayoutCard key={p.id} payout={p} onChanged={onChanged} />)
            )}
          </section>
        </>
      )}
    </div>
  )
}
