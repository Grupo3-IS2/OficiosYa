/** What the user types is kept to digits, at most as many as the code has. */
export function normalizeCode(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length)
}

export function isCodeComplete(code: string, length: number): boolean {
  return code.length === length && /^\d+$/.test(code)
}

/** Whole seconds until `endsAt` (ms since epoch), rounded up so it never shows 0 while waiting. */
export function secondsUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

/** 75 -> "1:15", 5 -> "0:05". */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
