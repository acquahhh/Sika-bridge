import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Load data on mount (and whenever `deps` change). Optionally poll every `intervalMs`.
 * Returns { data, error, loading, reload, setData }.
 */
export function useLoad(fn, deps = [], { intervalMs = 0 } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(async () => {
    try {
      const result = await fnRef.current()
      setData(result)
      setError(null)
      return result
    } catch (err) {
      setError(err)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    reload()
    if (!intervalMs) return undefined
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, intervalMs)
    return () => clearInterval(id)
  }, [reload, intervalMs, ...deps])

  return { data, error, loading, reload, setData }
}
