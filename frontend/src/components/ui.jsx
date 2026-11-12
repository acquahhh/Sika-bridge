import { useId } from 'react'
import { Link } from 'react-router-dom'
import { describeError } from '../lib/errors'

const BUTTON_VARIANTS = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-emerald-700/50',
  secondary:
    'bg-white text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50 disabled:text-emerald-800/50',
  gold: 'bg-amber-400 text-emerald-950 hover:bg-amber-300 disabled:bg-amber-400/50',
  danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-700/50',
  ghost: 'text-emerald-800 hover:bg-emerald-50',
}

export function Button({ variant = 'primary', loading = false, className = '', children, disabled, ...props }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function ButtonLink({ variant = 'primary', className = '', ...props }) {
  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Spinner({ className = 'size-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function Field({ label, hint, error, children, id }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

const INPUT_CLASS =
  'block w-full rounded-xl border-0 bg-white px-3.5 py-3 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-50'

export function TextInput({ label, hint, error, className = '', ...props }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      <input id={id} className={`${INPUT_CLASS} ${className}`} aria-invalid={Boolean(error)} {...props} />
    </Field>
  )
}

export function SelectInput({ label, hint, error, children, ...props }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      <select id={id} className={INPUT_CLASS} aria-invalid={Boolean(error)} {...props}>
        {children}
      </select>
    </Field>
  )
}

const ALERT_TONES = {
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-950 ring-amber-200',
  error: 'bg-red-50 text-red-900 ring-red-200',
}

export function Alert({ tone = 'info', title, children, action }) {
  return (
    <div className={`rounded-xl p-3.5 text-sm ring-1 ring-inset ${ALERT_TONES[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Renders an ApiError (or any Error) as a friendly alert. */
export function ErrorAlert({ error, action }) {
  const d = describeError(error)
  if (!d) return null
  return (
    <Alert tone={d.tone} title={d.title} action={action}>
      {d.message}
    </Alert>
  )
}

export function PageTitle({ children, back }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {back && (
        <Link to={back} className="-ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back">
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M12.8 4.2a.75.75 0 0 1 0 1.06L8.06 10l4.74 4.74a.75.75 0 1 1-1.06 1.06l-5.27-5.27a.75.75 0 0 1 0-1.06l5.27-5.27a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      )}
      <h1 className="text-xl font-bold text-slate-900">{children}</h1>
    </div>
  )
}

export function Row({ label, children, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`text-right text-sm tabular-nums ${strong ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
        {children}
      </dd>
    </div>
  )
}

export function EmptyState({ children }) {
  return <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>
}
