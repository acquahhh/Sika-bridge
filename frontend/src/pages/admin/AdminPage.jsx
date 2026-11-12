import { useRef, useState } from 'react'
import { api } from '../../api/endpoints'
import { Alert, Button, Card, EmptyState, ErrorAlert, PageTitle, SelectInput, Spinner, TextInput } from '../../components/ui'
import { COUNTRIES, COUNTRY_LIST } from '../../lib/countries'
import { formatMoney, toApiAmount, toMinor, validateAmount } from '../../lib/money'
import { useLoad } from '../../lib/useLoad'

// crypto.randomUUID only exists in secure contexts (https / localhost).
const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

function PoolsSection() {
  const { data, error, loading, reload } = useLoad(() => api.adminPools(), [], { intervalMs: 30_000 })
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Country pools</h2>
        <Button variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      {error && <ErrorAlert error={error} />}
      {loading && !data ? (
        <div className="flex justify-center py-6 text-emerald-700">
          <Spinner />
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {data.pools.map((p) => {
                const low = toMinor(p.available, p.currency) <= 0n
                return (
                  <Card key={p.country} className={low ? 'ring-2 ring-red-300' : ''}>
                    <p className="text-sm font-medium text-slate-600">
                      {COUNTRIES[p.country]?.flag} {COUNTRIES[p.country]?.name}
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(p.available, p.currency)}</p>
                    <p className="text-xs text-slate-500">available</p>
                    <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <dt>Cash in pool</dt>
                        <dd className="tabular-nums">{formatMoney(p.balance, p.currency, { code: false })}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Owed to recipients</dt>
                        <dd className="tabular-nums">{formatMoney(p.payable, p.currency, { code: false })}</dd>
                      </div>
                    </dl>
                  </Card>
                )
              })}
            </div>
            <Card>
              <p className="text-sm font-medium text-slate-600">Fees earned</p>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                {data.fees.map((f) => (
                  <p key={f.currency} className="text-sm font-semibold tabular-nums">
                    {formatMoney(f.earned, f.currency)}
                  </p>
                ))}
              </div>
            </Card>
            <FundPoolForm onFunded={reload} />
          </>
        )
      )}
    </section>
  )
}

function FundPoolForm({ onFunded }) {
  const [country, setCountry] = useState('GH')
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  // One idempotency key per intended funding, so a double-tap can't fund twice.
  const keyRef = useRef(newKey())
  const currency = COUNTRIES[country].currency
  const amountError = validateAmount(amount, currency)

  async function onSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (amountError) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const pool = await api.fundPool(country, toApiAmount(amount), keyRef.current)
      keyRef.current = newKey()
      setResult(pool)
      setAmount('')
      setTouched(false)
      onFunded()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <p className="font-medium text-slate-900">Prefund a pool</p>
        <div className="grid grid-cols-2 gap-3">
          <SelectInput label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRY_LIST.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code} ({c.currency})
              </option>
            ))}
          </SelectInput>
          <TextInput
            label={`Amount (${currency})`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              keyRef.current = newKey()
            }}
            error={touched && amountError}
          />
        </div>
        <ErrorAlert error={error} />
        {result && (
          <Alert tone="success">
            {COUNTRIES[result.country].name} pool now has {formatMoney(result.available, result.currency)} available.
          </Alert>
        )}
        <Button type="submit" variant="secondary" loading={busy} className="w-full">
          Add funds
        </Button>
      </form>
    </Card>
  )
}

function LedgerSection() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setResult(await api.ledgerCheck())
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-slate-900">Ledger check</h2>
      <Card className="space-y-3">
        <p className="text-sm text-slate-600">Confirms every journal and the whole ledger sum to zero in each currency.</p>
        <Button onClick={run} loading={busy} variant="secondary" className="w-full">
          Run ledger check
        </Button>
        <ErrorAlert error={error} />
        {result &&
          (result.balanced ? (
            <Alert tone="success" title="Ledger balanced">
              {result.journal_count} journals, {result.entry_count} entries. Totals:{' '}
              {Object.entries(result.totals_by_currency)
                .map(([cur, v]) => `${cur} ${v}`)
                .join(' · ') || '—'}
            </Alert>
          ) : (
            <Alert tone="error" title="Ledger is NOT balanced">
              <ul className="mt-1 list-inside list-disc font-mono text-xs">
                {result.unbalanced.map((u) => (
                  <li key={`${u.txn_id}-${u.currency}`}>
                    txn {u.txn_id}: {u.currency} off by {u.sum} minor units
                  </li>
                ))}
              </ul>
              <p className="mt-1">Totals: {JSON.stringify(result.totals_by_currency)}</p>
            </Alert>
          ))}
      </Card>
    </section>
  )
}

function KycSection() {
  const pending = useLoad(() => api.adminUsers('pending'), [])
  const [userId, setUserId] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [verified, setVerified] = useState(null)

  async function verify(id) {
    setBusyId(id)
    setError(null)
    setVerified(null)
    try {
      const u = await api.verifyKyc(id)
      setVerified(u)
      setUserId('')
      pending.reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusyId(null)
    }
  }

  const idValid = /^\d+$/.test(userId.trim())

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-slate-900">KYC verification</h2>
      <Card className="space-y-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (idValid) verify(userId.trim())
          }}
        >
          <div className="flex-1">
            <TextInput label="User ID" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <Button type="submit" disabled={!idValid} loading={busyId === userId.trim()}>
            Verify
          </Button>
        </form>
        <ErrorAlert error={error} />
        {verified && (
          <Alert tone="success">
            #{verified.id} {verified.full_name} ({verified.phone}) is now verified.
          </Alert>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Waiting for verification</p>
          {pending.error ? (
            <ErrorAlert error={pending.error} />
          ) : pending.loading && !pending.data ? (
            <Spinner />
          ) : (pending.data ?? []).length === 0 ? (
            <EmptyState>Nobody is waiting.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.data.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      #{u.id} {u.full_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {COUNTRIES[u.country]?.flag} {u.phone}
                    </p>
                  </div>
                  <Button variant="secondary" loading={busyId === String(u.id)} onClick={() => verify(String(u.id))}>
                    Verify
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  )
}

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <PageTitle>Admin</PageTitle>
      <PoolsSection />
      <KycSection />
      <LedgerSection />
    </div>
  )
}
