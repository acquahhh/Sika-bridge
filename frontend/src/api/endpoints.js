import { request } from './client'

const enc = encodeURIComponent

// Only read in dev builds; Vite replaces import.meta.env.DEV with `false` in
// production, so the secret is dropped from the bundle entirely.
const WEBHOOK_SECRET = import.meta.env.DEV ? import.meta.env.VITE_WEBHOOK_SECRET : undefined
export const canSimulateMomo = Boolean(WEBHOOK_SECRET)

export const api = {
  // auth
  register: (data) => request('/auth/register', { method: 'POST', body: data, auth: false }),
  login: (phone, password) => request('/auth/login', { method: 'POST', body: { phone, password }, auth: false }),
  me: () => request('/auth/me'),

  // student
  corridors: () => request('/corridors', { auth: false }),
  wallet: () => request('/wallet'),
  createDeposit: (amount) => request('/deposits', { method: 'POST', body: { amount } }),
  getDeposit: (id) => request(`/deposits/${enc(id)}`),
  createQuote: (recv_country, send_amount) => request('/quotes', { method: 'POST', body: { recv_country, send_amount } }),
  createTransfer: (data) => request('/transfers', { method: 'POST', body: data }),
  listTransfers: () => request('/transfers'),
  getTransfer: (id) => request(`/transfers/${enc(id)}`),

  // dev-only MoMo callback simulation
  simulateMomo: (reference, status = 'SUCCESSFUL') => {
    if (!WEBHOOK_SECRET) throw new Error('MoMo simulation is only available in development.')
    return request('/webhooks/momo', {
      method: 'POST',
      auth: false,
      headers: { 'X-Webhook-Secret': WEBHOOK_SECRET },
      body: { reference, status },
    })
  },

  // agent
  agentPayouts: () => request('/agent/payouts'),
  claimPayout: (id) => request(`/agent/payouts/${enc(id)}/claim`, { method: 'POST' }),
  completePayout: (id, payout_reference) =>
    request(`/agent/payouts/${enc(id)}/complete`, { method: 'POST', body: { payout_reference } }),
  failPayout: (id, reason) => request(`/agent/payouts/${enc(id)}/fail`, { method: 'POST', body: { reason } }),

  // admin
  adminPools: () => request('/admin/pools'),
  fundPool: (country, amount, idempotencyKey) =>
    request('/admin/pools/fund', {
      method: 'POST',
      body: { country, amount },
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),
  adminUsers: (kycStatus) => request(`/admin/users${kycStatus ? `?kyc_status=${enc(kycStatus)}` : ''}`),
  verifyKyc: (userId) => request(`/admin/users/${enc(userId)}/verify-kyc`, { method: 'POST' }),
  ledgerCheck: () => request('/admin/ledger/check'),
}
