// Money helpers. The API sends amounts as decimal strings ("1042.40").
// We never turn them into JS numbers: formatting is string manipulation and
// comparisons use BigInt minor units.

export const CURRENCY_EXPONENT = { RWF: 0, GHS: 2, NGN: 2 }

const DECIMAL_RE = /^-?\d+(\.\d+)?$/

/** Strip thousands separators and spaces that people type ("150,000" -> "150000"). */
export function normalizeAmountInput(raw) {
  return String(raw ?? '').replace(/[\s,_]/g, '')
}

/** Returns an error message, or null if `value` is a valid positive amount for `currency`. */
export function validateAmount(value, currency) {
  const v = normalizeAmountInput(value)
  if (!v) return 'Enter an amount.'
  if (!/^\d+(\.\d+)?$/.test(v)) return 'Use digits only, e.g. 1500 or 25.50.'
  const exp = CURRENCY_EXPONENT[currency] ?? 2
  const frac = v.split('.')[1] ?? ''
  if (frac.replace(/0+$/, '').length > exp) {
    return exp === 0 ? `${currency} has no decimal places.` : `${currency} allows at most ${exp} decimal places.`
  }
  if (/^0*(\.0*)?$/.test(v)) return 'Amount must be greater than zero.'
  if (v.split('.')[0].replace(/^0+/, '').length > 15) return 'That amount is too large.'
  return null
}

/** Exact conversion of a decimal string to BigInt minor units (for comparisons only). */
export function toMinor(value, currency) {
  const v = normalizeAmountInput(value)
  if (!DECIMAL_RE.test(v)) throw new Error(`Not a decimal amount: ${value}`)
  const exp = CURRENCY_EXPONENT[currency] ?? 2
  const negative = v.startsWith('-')
  const [whole, frac = ''] = v.replace('-', '').split('.')
  const fracPadded = (frac + '0'.repeat(exp)).slice(0, exp)
  if (frac.slice(exp).replace(/0/g, '')) throw new Error(`Too many decimals for ${currency}: ${value}`)
  const minor = BigInt(whole + fracPadded)
  return negative ? -minor : minor
}

/** Canonical string for sending to the API ("150,000" -> "150000", "25.5" stays "25.5"). */
export function toApiAmount(value) {
  return normalizeAmountInput(value)
}

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Format a decimal string for display: formatMoney("1042.4", "GHS") -> "GHS 1,042.40".
 * Pass { code: false } to omit the currency code.
 */
export function formatMoney(value, currency, { code = true } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  const s = String(value)
  if (!DECIMAL_RE.test(s)) return s
  const negative = s.startsWith('-')
  const [whole, frac = ''] = s.replace('-', '').split('.')
  const exp = CURRENCY_EXPONENT[currency] ?? frac.length
  const fracOut = exp > 0 ? '.' + (frac + '0'.repeat(exp)).slice(0, exp) : ''
  const body = groupThousands(whole.replace(/^0+(?=\d)/, '')) + fracOut
  const sign = negative ? '−' : ''
  return code ? `${sign}${currency} ${body}` : `${sign}${body}`
}

/** Format an FX rate string, trimming trailing zeros: "92.61290300" -> "92.612903". */
export function formatRate(rate) {
  const s = String(rate ?? '')
  if (!s.includes('.')) return s
  return s.replace(/0+$/, '').replace(/\.$/, '')
}
