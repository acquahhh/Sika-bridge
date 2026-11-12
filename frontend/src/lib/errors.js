// Turn API errors into something a student can act on.

export function describeError(err) {
  if (!err) return null
  const code = err.code
  const status = err.status

  if (code === 'kyc_pending' || (status === 403 && /kyc/i.test(err.message))) {
    return {
      tone: 'warning',
      title: 'Identity check pending',
      message:
        'Your KYC verification is still being reviewed. You can top up, but sending is unlocked once you are verified. This usually takes less than a day.',
    }
  }
  if (code === 'corridor_unavailable') {
    return { tone: 'warning', title: 'This route is not available', message: err.message }
  }
  if (code === 'pool_unavailable' || status === 503) {
    return {
      tone: 'warning',
      title: 'Temporarily unavailable',
      message: err.message || 'Payouts to this country are paused right now. Try a smaller amount or again later.',
    }
  }
  if (code === 'insufficient_funds') {
    return { tone: 'error', title: 'Not enough balance', message: err.message }
  }
  if (code === 'quote_expired') {
    return { tone: 'warning', title: 'Quote expired', message: 'Rates are locked for 10 minutes. Get a fresh quote to continue.' }
  }
  if (code === 'network') {
    return { tone: 'error', title: 'Offline?', message: err.message }
  }
  if (status === 403) {
    return { tone: 'error', title: 'Not allowed', message: err.message || 'You do not have access to this.' }
  }
  return { tone: 'error', title: 'Something went wrong', message: err.message || String(err) }
}
