import { Link } from 'react-router-dom'
import { api } from '../../api/endpoints'
import { useAuth } from '../../auth/AuthContext'
import TransferListItem from '../../components/TransferListItem'
import { Alert, ButtonLink, Card, EmptyState, ErrorAlert, Spinner } from '../../components/ui'
import { formatMoney } from '../../lib/money'
import { useLoad } from '../../lib/useLoad'

export function KycPendingNotice() {
  return (
    <Alert tone="warning" title="Identity check pending">
      You can top up your wallet now. Sending money unlocks as soon as our team verifies your ID.
    </Alert>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const wallet = useLoad(() => api.wallet(), [], { intervalMs: 30_000 })
  const transfers = useLoad(() => api.listTransfers(), [], { intervalMs: 30_000 })
  const recent = (transfers.data ?? []).slice(0, 5)

  return (
    <div className="space-y-5">
      {user.kyc_status !== 'verified' && <KycPendingNotice />}

      <Card className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white ring-0">
        <p className="text-sm text-emerald-100">Wallet balance</p>
        <p className="mt-1 text-3xl font-bold tabular-nums" aria-live="polite">
          {wallet.data ? (
            formatMoney(wallet.data.balance, wallet.data.currency)
          ) : wallet.loading ? (
            <Spinner className="size-7" />
          ) : (
            '—'
          )}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <ButtonLink to="/topup" variant="gold">
            Top up
          </ButtonLink>
          <ButtonLink to="/send" variant="secondary" className="ring-0">
            Send
          </ButtonLink>
        </div>
      </Card>
      {wallet.error && <ErrorAlert error={wallet.error} />}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent transfers</h2>
          {recent.length > 0 && (
            <Link to="/transfers" className="text-sm font-medium text-emerald-700">
              See all
            </Link>
          )}
        </div>
        {transfers.error ? (
          <ErrorAlert error={transfers.error} />
        ) : transfers.loading && !transfers.data ? (
          <div className="flex justify-center py-6 text-emerald-700">
            <Spinner />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState>No transfers yet. Tap Send to make your first one.</EmptyState>
        ) : (
          <Card className="p-2">
            <ul className="divide-y divide-slate-100">
              {recent.map((t) => (
                <TransferListItem key={t.id} transfer={t} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
