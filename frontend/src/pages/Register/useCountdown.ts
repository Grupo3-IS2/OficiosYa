import { useCallback, useEffect, useState } from 'react'
import { secondsUntil } from './verificationCode'

/** Seconds left until a deadline the caller can move with `restart`; ticks once a second. */
export function useCountdown(initialSeconds: number) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000)
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds)

  useEffect(() => {
    const update = () => setSecondsLeft(secondsUntil(endsAt, Date.now()))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [endsAt])

  const restart = useCallback((seconds: number) => {
    setEndsAt(Date.now() + seconds * 1000)
  }, [])

  return { secondsLeft, restart }
}
