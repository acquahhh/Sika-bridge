import { useEffect, useState } from 'react'
import { api, canSimulateMomo } from '../../api/endpoints'
import { useAuth } from '../../auth/AuthContext'
import StatusBadge from '../../components/StatusBadge'
import { Alert, Button, ButtonLink, Card, ErrorAlert, PageTitle, Row, Spinner, TextInput } from '../../components/ui'
import { formatMoney, toApiAmount, validateAmount } from '../../lib/money'

const QUICK_AMOUNTS = { RWF: ['10000', '50000', '100000'], GHS: ['100', '500', '1000'], NGN: ['10000', '50000', '100000'] }

export default function TopUpPage() {
  const { user } = useAuth()
  const currency = user.currency
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)
  const [deposit, setDeposit] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [simBusy, setSimBusy] = useState(false)
  const [balance, setBalance] = useState(null)

  const amountError = validateAmount(amount, currency)
  const pending = deposit?.status === 'PENDING'

  // Poll the deposit while we wait for MoMo to call back.
  useEffect(() => {
    if (!pending) return undefined
    const id = setInterval(async () => {
      try {
        setDeposit(await api.getDeposit(deposit.id))
      } catch {
        /* keep polling */
      }
    }, 3000)
    return () => clearInterval(id)
  }, [pending, deposit?.id])

  useEffect(() => {
    if (deposit?.status === 'SUCCESSFUL') api.wallet().then(setBalance).catch(() => {})
  }, [deposit?.status])

  async function onSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (amountError) return
    setBusy(true)
    setError(null)
    try {
      setDeposit(await api.createDeposit(toApiAmount(amount)))
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function simulate(status) {
    setSimBusy(true)
    setError(null)
    try {
      setDeposit(await api.simulateMomo(deposit.momo_reference, status))
    } catch (err) {
      setError(err)
    } finally {
      setSimBusy(false)
    }
  }

  if (deposit) {
    return (
      <div className="space-y-4">
        <PageTitle back="/home">Top up</PageTitle>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Mobile money request</p>
            <StatusBadge status={deposit.status} />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{formatMoney(deposit.amount, deposit.currency)}</p>
          <dl className="mt-3 border-t border-slate-100 pt-2">
            <Row label="MoMo number">{user.phone}</Row>
            <Row label="Reference">
              <span className="font-mono text-xs">{deposit.momo_reference}</span>
            </Row>
          </dl>
        </Card>

        {pending && (
          <Alert tone="info" title="Check your phone">
            <span className="flex items-center gap-2">
              <Spinner className="size-4" /> Approve the payment prompt on {user.phone} with your MoMo PIN. This page
              updates automatically.
            </span>
          </Alert>
        )}

        {pending && canSimulateMomo && (
          <Card className="border-2 border-dashed border-amber-300 bg-amber-50/60 shadow-none ring-0">
            <p className="text-sm font-semibold text-amber-900">Developer tools</p>
            <p className="mt-1 text-xs text-amber-800">
              Sends the MoMo callback to <code>/webhooks/momo</code> with your dev webhook secret.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="gold" loading={simBusy} onClick={() => simulate('SUCCESSFUL')}>
                Simulate MoMo confirmation
              </Button>
              <Button variant="danger" disabled={simBusy} onClick={() => simulate('FAILED')}>
                Simulate failure
              </Button>
            </div>
          </Card>
        )}

        {deposit.status === 'SUCCESSFUL' && (
          <Alert tone="success" title="Wallet topped up">
            {balance ? <>New balance: {formatMoney(balance.balance, balance.currency)}</> : 'Your wallet has been credited.'}
          </Alert>
        )}
        {deposit.status === 'FAILED' && (
          <Alert tone="error" title="Payment not completed">
            The MoMo payment was declined or timed out. No money was taken.
          </Alert>
        )}
        <ErrorAlert error={error} />

        {!pending && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setDeposit(null)
                setAmount('')
                setTouched(false)
              }}
            >
              Top up again
            </Button>
            <ButtonLink to={deposit.status === 'SUCCESSFUL' ? '/send' : '/home'}>
              {deposit.status === 'SUCCESSFUL' ? 'Send money' : 'Home'}
            </ButtonLink>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageTitle back="/home">Top up</PageTitle>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Card className="space-y-4">
          <TextInput
            label={`Amount (${currency})`}
            inputMode="decimal"
            placeholder={currency === 'RWF' ? '50000' : '500.00'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={touched && amountError}
            hint={`We'll send a mobile money request to ${user.phone}.`}
            className="text-xl font-semibold tabular-nums"
          />
          <div className="flex flex-wrap gap-2">
            {(QUICK_AMOUNTS[currency] ?? []).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200"
              >
                {formatMoney(a, currency, { code: false })}
              </button>
            ))}
          </div>
        </Card>
        <ErrorAlert error={error} />
        <Button type="submit" className="w-full" loading={busy}>
          Request {amount && !amountError ? formatMoney(toApiAmount(amount), currency) : 'payment'}
        </Button>
      </form>
    </div>
  )
}
