import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HOME_BY_ROLE, useAuth } from '../auth/AuthContext'
import { Alert, Button, ErrorAlert, SelectInput, TextInput } from '../components/ui'
import { COUNTRIES, COUNTRY_LIST, normalizePhone, validatePhone } from '../lib/countries'

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-emerald-800 via-emerald-800 to-slate-50 px-4 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3 text-white">
          <img src="/icons/favicon.svg" alt="" className="size-12 rounded-2xl shadow-lg" />
          <div>
            <p className="text-2xl font-bold">SikaBridge</p>
            <p className="text-sm text-emerald-100">Send money home, fairly.</p>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-xl">
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-5 text-center text-sm text-slate-600">{footer}</p>
      </div>
    </div>
  )
}

const ROLE_AREAS = {
  student: ['/home', '/send', '/topup', '/transfers'],
  agent: ['/agent'],
  admin: ['/admin'],
}

function useAfterAuth() {
  const navigate = useNavigate()
  const location = useLocation()
  return (user) => {
    const from = location.state?.from
    const home = HOME_BY_ROLE[user.role] ?? '/'
    // Only return to a previous page if it belongs to this role's area.
    const allowed = ROLE_AREAS[user.role] ?? []
    const target = from && allowed.some((p) => from === p || from.startsWith(p + '/')) ? from : home
    navigate(target, { replace: true })
  }
}

export function LoginPage() {
  const { login, sessionMessage } = useAuth()
  const afterAuth = useAfterAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      afterAuth(await login(normalizePhone(phone), password))
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Log in"
      subtitle="Use the phone number you registered with."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-emerald-800 underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {sessionMessage && <Alert tone="info">{sessionMessage}</Alert>}
        <TextInput
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+250788123456"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorAlert error={error} />
        <Button type="submit" className="w-full" loading={busy} disabled={!phone || !password}>
          Log in
        </Button>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const afterAuth = useAfterAuth()
  const [form, setForm] = useState({ full_name: '', country: 'RW', phone: '+250', password: '' })
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const phoneError = validatePhone(form.phone, form.country)
  const nameError = form.full_name.trim().length < 2 ? 'Enter your full name.' : null
  const passwordError = form.password.length < 8 ? 'At least 8 characters.' : null
  const invalid = Boolean(phoneError || nameError || passwordError)

  function update(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value }
      // Swap the dial code when the country changes and the number is still just a prefix.
      if (field === 'country') {
        const oldDial = COUNTRIES[f.country].dial
        if (!f.phone || f.phone === oldDial) next.phone = COUNTRIES[value].dial
      }
      return next
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (invalid) return
    setBusy(true)
    setError(null)
    try {
      afterAuth(
        await register({
          full_name: form.full_name.trim(),
          country: form.country,
          phone: normalizePhone(form.phone),
          password: form.password,
        }),
      )
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="You'll be able to top up right away. Sending unlocks after a quick identity check."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-emerald-800 underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextInput
          label="Full name"
          autoComplete="name"
          value={form.full_name}
          onChange={(e) => update('full_name', e.target.value)}
          error={touched && nameError}
        />
        <SelectInput label="Country you study in" value={form.country} onChange={(e) => update('country', e.target.value)}>
          {COUNTRY_LIST.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} ({c.currency})
            </option>
          ))}
        </SelectInput>
        <TextInput
          label="Mobile money number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={COUNTRIES[form.country].example}
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          hint={`International format, e.g. ${COUNTRIES[form.country].example}`}
          error={touched && phoneError}
        />
        <TextInput
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          hint="At least 8 characters."
          error={touched && passwordError}
        />
        <ErrorAlert error={error} />
        <Button type="submit" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
