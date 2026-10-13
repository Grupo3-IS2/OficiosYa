import { rescheduleTimeframe, type RescheduleDraft } from './rescheduleForm.ts'

/** The backend's limit for the reason of a rejection or a cancellation. */
export const REASON_MAX_LENGTH = 500

/** The timeframe the professional books when accepting; the same rules as a reschedule, with nothing agreed yet. */
export function acceptanceTimeframe(draft: RescheduleDraft, now = new Date()): { start: Date; end: Date } | { error: string } {
    return rescheduleTimeframe(draft, {}, now)
}

/** The reason of a rejection or a cancellation is optional: blank is no reason at all. */
export function optionalReason(text: string): { reason?: string } | { error: string } {
    const reason = text.trim()
    if (reason.length > REASON_MAX_LENGTH) {
        return { error: `El motivo no puede superar los ${REASON_MAX_LENGTH} caracteres.` }
    }
    return reason ? { reason } : {}
}

/** What the viewer chose to do with something waiting for them: a request or a reschedule. */
export type Decision = 'accept' | 'reject'

/** How an answer from the detail left the request. */
export type RequestOutcome = 'accepted' | 'rejected' | 'cancelled'
