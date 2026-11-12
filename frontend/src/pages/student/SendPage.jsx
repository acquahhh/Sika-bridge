import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/endpoints'
import { useAuth } from '../../auth/AuthContext'
import { Alert, Button, Card, ErrorAlert, PageTitle, Row, SelectInput, Spinner, TextInput } from '../../components/ui'
import { COUNTRIES, normalizePhone, validatePhone } from '../../lib/countries'
import { formatMoney, formatRate, toApiAmount, toMinor, validateAmount } from '../../lib/money'
import { formatSeconds, useCountdown } from '../../lib/useCountdown'
import { useLoad } from '../../lib/useLoad'
import { KycPendingNotice } from './HomePage'

const EMPTY_RECIPIENT = { recipient_name: '', recipient_phone: '', payout_method: 'momo', bank_name: '', bank_account: '' }

export default function SendPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const sendCurrency = user.currency
  const corridors = useLoad(() => api.corridors(), [])
  const wallet = useLoad(() => api.wallet(), [])

  const mine = useMemo(
    () => (corridors.data ?? []).filter((c) => c.from_country === user.country),
    [corridors.data, user.country],
  )
  const enabled = mine.filter((c) => c.enabled)

  const [dest, setDest] = useState('')
  const destCountry = dest || enabled[0]?.to_country || ''
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)
  const [quote, setQuote] = useState(null)
  const [deadline, setDeadline] = useState(null)
  const [quoteError, setQuoteError] = useState(null)
  const [quoting, setQuoting] = useState(false)

  const [recipient, setRecipient] = useState(EMPTY_RECIPIENT)
  const [recipientTouched, setRecipientTouched] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [sending, setSending] = useState(false)

  const secondsLeft = useCountdown(deadline)
  const expired = quote && secondsLeft <= 0
  const amountError = validateAmount(amount, sendCurrency)
  const kycPending = user.kyc_status !== 'verified'

  const insufficient = useMemo(() => {
    if (!quote || !wallet.data) return false
    return toMinor(wallet.data.balance, sendCurrency) < toMinor(quote.send_amount, sendCurrency)
  }, [quote, wallet.data, sendCurrency])

  async function getQuote(e) {
    e?.preventDefault()
    setTouched(true)
    if (amountError || !destCountry) return
    setQuoting(true)
    setQuoteError(null)
    setSendError(null)
    try {
      const q = await api.createQuote(destCountry, toApiAmount(amount))
      setQuote(q)
      // Use the server's remaining seconds so device clock skew doesn't matter.
      setDeadline(Date.now() + q.expires_in_seconds * 1000)
    } catch (err) {
      setQuote(null)
      setQuoteError(err)
    } finally {
      setQuoting(false)
    }
  }

  function resetQuote() {
    setQuote(null)
    setDeadline(null)
    setSendError(null)
  }

  const recvCountry = quote ? COUNTRIES[quote.recv_country] : null
  const recipientErrors = quote
    ? {
        recipient_name: recipient.recipient_name.trim().length < 2 ? "Enter the recipient's full name." : null,
        recipient_phone: validatePhone(recipient.recipient_phone, quote.recv_country),
        bank_name: recipient.payout_method === 'bank' && !recipient.bank_name.trim() ? 'Enter the bank name.' : null,
        bank_account:
          recipient.payout_method === 'bank' && !/^\d{6,20}$/.test(recipient.bank_account.trim())
            ? 'Enter the account number (digits only).'
            : null,
      }
    : {}
  const recipientInvalid = Object.values(recipientErrors).some(Boolean)

  async function send(e) {
    e.preventDefault()
    setRecipientTouched(true)
    if (recipientInvalid || expired) return
    setSending(true)
    setSendError(null)
    try {
      const body = {
        quote_id: quote.id,
        recipient_name: recipient.recipient_name.trim(),
        recipient_phone: normalizePhone(recipient.recipient_phone),
        payout_method: recipient.payout_method,
      }
      if (recipient.payout_method === 'bank') {
        body.bank_name = recipient.bank_name.trim()
        body.bank_account = recipient.bank_account.trim()
      }
      const t = await api.createTransfer(body)
      navigate(`/transfers/${t.id}`, { replace: true, state: { justSent: true } })
    } catch (err) {
      setSendError(err)
      setSending(false)
      if (err.code === 'quote_used' || err.code === 'quote_expired') resetQuote()
    }
  }

  if (corridors.loading) {
    return (
      <div className="flex justify-center py-10 text-emerald-700">
        <Spinner />
      </div>
    )
  }

  if (corridors.error) return <ErrorAlert error={corridors.error} />

  return (
    <div className="space-y-4">
      <PageTitle back="/home">Send money</PageTitle>
      {kycPending && <KycPendingNotice />}

      {enabled.length === 0 ? (
        <Alert tone="warning" title="Sending isn't available from your country">
          {mine.find((c) => c.reason)?.reason ?? `There are no open routes from ${COUNTRIES[user.country].name} yet.`}
        </Alert>
      ) : (
        <form onSubmit={getQuote} noValidate>
          <Card className="space-y-4">
            <SelectInput
              label="Send to"
              value={destCountry}
              onChange={(e) => {
                setDest(e.target.value)
                resetQuote()
              }}
            >
              {mine.map((c) => (
                <option key={c.to_country} value={c.to_country} disabled={!c.enabled}>
                  {COUNTRIES[c.to_country].flag} {COUNTRIES[c.to_country].name} ({c.to_currency})
                  {!c.enabled ? ' — unavailable' : ''}
                </option>
              ))}
            </SelectInput>
            <TextInput
              label={`You send (${sendCurrency})`}
              inputMode="decimal"
              placeholder={sendCurrency === 'RWF' ? '100000' : '500.00'}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                if (quote) resetQuote()
              }}
              error={touched && amountError}
              hint={
                wallet.data ? `Wallet balance: ${formatMoney(wallet.data.balance, wallet.data.currency)}. Fee is included.` : 'Fee is included in this amount.'
              }
              className="text-xl font-semibold tabular-nums"
            />
            {!quote && (
              <Button type="submit" className="w-full" loading={quoting}>
                Get quote
              </Button>
            )}
          </Card>
        </form>
      )}

      <ErrorAlert error={quoteError} />

      {quote && (
        <>
          <Card className="ring-2 ring-emerald-600">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-800">Your quote</p>
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-sm font-semibold tabular-nums ${
                  expired ? 'bg-red-100 text-red-800' : secondsLeft < 60 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'
                }`}
                aria-live="off"
                title="Rate locked for 10 minutes"
              >
                {expired ? 'Expired' : `⏱ ${formatSeconds(secondsLeft)}`}
              </span>
            </div>
            <dl className="mt-2">
              <Row label="You send">{formatMoney(quote.send_amount, quote.send_currency)}</Row>
              <Row label="Fee">− {formatMoney(quote.fee, quote.send_currency)}</Row>
              <Row label="We convert">{formatMoney(quote.net_amount, quote.send_currency)}</Row>
              <Row label="Rate">
                1 {quote.send_currency} = {formatRate(quote.rate)} {quote.recv_currency}
              </Row>
            </dl>
            <div className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-medium text-slate-600">Recipient gets</span>
              <span className="text-2xl font-bold tabular-nums text-emerald-800">
                {formatMoney(quote.receive_amount, quote.recv_currency)}
              </span>
            </div>
          </Card>

          {expired ? (
            <Alert
              tone="warning"
              title="Quote expired"
              action={
                <Button variant="secondary" onClick={getQuote} loading={quoting}>
                  Get a new quote
                </Button>
              }
            >
              Rates are locked for 10 minutes. Refresh to see today's rate.
            </Alert>
          ) : (
            insufficient && (
              <Alert tone="warning" title="Not enough balance">
                Your wallet has {formatMoney(wallet.data.balance, wallet.data.currency)}.{' '}
                <Link to="/topup" className="font-semibold underline">
                  Top up
                </Link>{' '}
                first.
              </Alert>
            )
          )}

          <form onSubmit={send} className="space-y-4" noValidate>
            <Card className="space-y-4">
              <p className="text-sm font-semibold text-slate-900">
                Recipient in {recvCountry.flag} {recvCountry.name}
              </p>
              <TextInput
                label="Full name"
                autoComplete="off"
                value={recipient.recipient_name}
                onChange={(e) => setRecipient((r) => ({ ...r, recipient_name: e.target.value }))}
                error={recipientTouched && recipientErrors.recipient_name}
              />
              <TextInput
                label="Phone number"
                type="tel"
                inputMode="tel"
                placeholder={recvCountry.example}
                value={recipient.recipient_phone}
                onChange={(e) => setRecipient((r) => ({ ...r, recipient_phone: e.target.value }))}
                error={recipientTouched && recipientErrors.recipient_phone}
                hint={`International format, e.g. ${recvCountry.example}`}
              />
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700">Pay out to</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['momo', 'Mobile money'],
                    ['bank', 'Bank account'],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center justify-center rounded-xl px-3 py-3 text-sm font-medium ring-1 ring-inset ${
                        recipient.payout_method === value
                          ? 'bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600'
                          : 'bg-white text-slate-700 ring-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payout_method"
                        value={value}
                        className="sr-only"
                        checked={recipient.payout_method === value}
                        onChange={() => setRecipient((r) => ({ ...r, payout_method: value }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {recipient.payout_method === 'bank' && (
                <>
                  <TextInput
                    label="Bank name"
                    value={recipient.bank_name}
                    onChange={(e) => setRecipient((r) => ({ ...r, bank_name: e.target.value }))}
                    error={recipientTouched && recipientErrors.bank_name}
                  />
                  <TextInput
                    label="Account number"
                    inputMode="numeric"
                    value={recipient.bank_account}
                    onChange={(e) => setRecipient((r) => ({ ...r, bank_account: e.target.value }))}
                    error={recipientTouched && recipientErrors.bank_account}
                  />
                </>
              )}
            </Card>

            <ErrorAlert
              error={sendError}
              action={
                sendError?.code === 'insufficient_funds' ? (
                  <Link to="/topup" className="font-semibold underline">
                    Top up your wallet
                  </Link>
                ) : null
              }
            />

            <Button type="submit" className="w-full" loading={sending} disabled={expired || kycPending || insufficient}>
              Send {formatMoney(quote.receive_amount, quote.recv_currency)}
            </Button>
            {kycPending && (
              <p className="text-center text-xs text-slate-500">Sending unlocks after your identity check.</p>
            )}
          </form>
        </>
      )}
    </div>
  )
}
