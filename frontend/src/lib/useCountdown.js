import { useEffect, useState } from 'react'

/** Seconds remaining until `deadlineMs` (a Date.now()-based timestamp), ticking every second. */
export function useCountdown(deadlineMs) {
  const calc = () => (deadlineMs ? Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)) : 0)
  const [left, setLeft] = useState(calc)

  useEffect(() => {
    setLeft(calc())
    if (!deadlineMs) return undefined
    const id = setInterval(() => {
      const next = calc()
      setLeft(next)
      if (next <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [deadlineMs])

  return left
}

export function formatSeconds(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
