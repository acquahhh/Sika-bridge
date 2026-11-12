export const COUNTRIES = {
  RW: { code: 'RW', name: 'Rwanda', currency: 'RWF', flag: '🇷🇼', dial: '+250', example: '+250788123456', pattern: /^\+250\d{9}$/ },
  GH: { code: 'GH', name: 'Ghana', currency: 'GHS', flag: '🇬🇭', dial: '+233', example: '+233241234567', pattern: /^\+233\d{9}$/ },
  NG: { code: 'NG', name: 'Nigeria', currency: 'NGN', flag: '🇳🇬', dial: '+234', example: '+2348031234567', pattern: /^\+234\d{10}$/ },
}

export const COUNTRY_LIST = Object.values(COUNTRIES)

export function normalizePhone(raw) {
  return String(raw ?? '').replace(/[\s\-()]/g, '')
}

/** Returns an error message, or null if valid for that country. */
export function validatePhone(raw, countryCode) {
  const c = COUNTRIES[countryCode]
  const phone = normalizePhone(raw)
  if (!phone) return 'Enter a phone number.'
  if (!c.pattern.test(phone)) return `Use the ${c.name} format, e.g. ${c.example}.`
  return null
}
