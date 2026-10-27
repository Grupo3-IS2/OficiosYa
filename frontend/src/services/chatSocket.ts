import { expireSession, getToken } from './session.ts'
import { isTokenFresh, renewSession } from './sessionRenewal.ts'

/**
 * - message: a chat message arrived (/user/queue/messages)
 * - job: one of the user's jobs changed (/user/queue/job-updates) or was just proposed (its JOB_PROPOSAL card)
 * - resync: pushes may have been missed (the socket came back, or the tab became visible again)
 */
export type ChatEvent = 'message' | 'job' | 'resync'
type Listener = (event: ChatEvent) => void

const RECONNECT_MS = 3000

const listeners = new Set<Listener>()
let socket: WebSocket | null = null
let retry: number | undefined
let connectedBefore = false
// The last refused token was already renewed once: a second refusal ends the session
let renewedAfterRefusal = false

function emit(event: ChatEvent) {
  listeners.forEach(listener => listener(event))
}

function frame(command: string, headers: Record<string, string>) {
  return `${command}\n${Object.entries(headers).map(([key, value]) => `${key}:${value}`).join('\n')}\n\n\0`
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') emit('resync')
}

async function connect() {
  let token = getToken()
  // The backend closes the socket once the token expires: reconnect with a renewed one
  if (token && !isTokenFresh(token)) {
    await renewSession(token)
    token = getToken()
  }
  if (!token || listeners.size === 0 || socket) return

  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/chat`)
  socket = ws
  ws.onopen = () => ws.send(frame('CONNECT', { 'accept-version': '1.2', host: location.host, 'heart-beat': '0,0', Authorization: `Bearer ${token}` }))
  let connected = false
  let refused = false
  ws.onmessage = event => {
    for (const raw of String(event.data).split('\0')) {
      const [head, ...body] = raw.replace(/^\n+/, '').split('\n\n')
      const [command, ...headers] = head.split('\n')
      if (command === 'ERROR' && !connected) {
        refused = true
      } else if (command === 'CONNECTED') {
        connected = true
        renewedAfterRefusal = false
        ws.send(frame('SUBSCRIBE', { id: 'messages', destination: '/user/queue/messages' }))
        ws.send(frame('SUBSCRIBE', { id: 'jobs', destination: '/user/queue/job-updates' }))
        if (connectedBefore) emit('resync')
        connectedBefore = true
      } else if (command === 'MESSAGE' && headers.some(line => line.startsWith('destination:') && line.endsWith('/queue/messages'))) {
        emit('message')
        // A new job only shows up as its card in the chat: job-updates is for its later changes
        if ((JSON.parse(body.join('\n\n')) as { type?: string }).type === 'JOB_PROPOSAL') emit('job')
      } else if (command === 'MESSAGE') {
        emit('job')
      }
    }
  }
  ws.onclose = () => {
    // Closed on purpose (nobody listens any more) when it isn't the current socket
    if (socket !== ws) return
    socket = null
    if (refused) void recover(token)
    else retry = window.setTimeout(() => void connect(), RECONNECT_MS)
  }
}

/**
 * The backend refused the token before its time (revoked, or signed with keys it no longer has):
 * renew it once, as the API does on a 401, and send the user to log in if that fails too.
 */
async function recover(token: string) {
  const outcome = renewedAfterRefusal ? 'expired' : await renewSession(token)
  renewedAfterRefusal = outcome === 'refreshed'
  if (outcome === 'expired') expireSession()
  else retry = window.setTimeout(() => void connect(), RECONNECT_MS)
}

/**
 * One socket per tab, shared by everyone listening: it opens with the first listener and closes with
 * the last. Pushes are only a hint that something changed; listeners reload it from the API.
 */
export function onChatEvent(listener: Listener): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    void connect()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.clearTimeout(retry)
    connectedBefore = false
    const closing = socket
    socket = null
    closing?.close()
  }
}
