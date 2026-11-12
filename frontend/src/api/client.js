// Thin fetch wrapper. JWT lives in memory and is mirrored to sessionStorage so
// it survives a reload but not closing the tab.

export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

const STORAGE_KEY = 'sikabridge.token'
let token = readStoredToken()
let unauthorizedHandler = null

function readStoredToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function getToken() {
  return token
}

export function setToken(value) {
  token = value || null
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable (private mode); memory copy still works */
  }
}

export function onUnauthorized(handler) {
  unauthorizedHandler = handler
}

export class ApiError extends Error {
  constructor({ status, code, message }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function errorFromBody(status, body) {
  const detail = body?.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return new ApiError({ status, code: detail.code || 'error', message: detail.message || 'Something went wrong.' })
  }
  if (Array.isArray(detail)) {
    // FastAPI 422 validation errors
    const message = detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body').join('.') : ''
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join('; ')
    return new ApiError({ status, code: 'validation_error', message: message || 'Please check the form.' })
  }
  if (typeof detail === 'string') return new ApiError({ status, code: 'error', message: detail })
  return new ApiError({ status, code: 'http_' + status, message: `Request failed (${status}).` })
}

export async function request(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const h = { Accept: 'application/json', ...headers }
  if (body !== undefined) h['Content-Type'] = 'application/json'
  if (auth && token) h.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError({
      status: 0,
      code: 'network',
      message: "Can't reach SikaBridge. Check your connection and try again.",
    })
  }

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const err = errorFromBody(res.status, data)
    if (res.status === 401 && auth && token && unauthorizedHandler) unauthorizedHandler(err)
    throw err
  }
  return data
}
