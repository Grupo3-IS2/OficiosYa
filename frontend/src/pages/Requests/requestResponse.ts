import { rescheduleTimeframe, type RescheduleDraft } from './rescheduleForm.ts'
import type { JobRequest } from '../../types/JobRequest.ts'
import type { Schedule } from '../../types/Schedule.ts'

/** The backend's limit for the reason of a rejection or a cancellation. */
export const REASON_MAX_LENGTH = 500

/** The timeframe the professional books when accepting; the same rules as a reschedule, with nothing agreed yet. */
export function acceptanceTimeframe(draft: RescheduleDraft, now = new Date()): { start: Date; end: Date } | { error: string } {
    return rescheduleTimeframe(draft, {}, now)
}

/** Whether one of the professional's availability blocks covers the whole timeframe. */
export function withinAvailability(schedules: Schedule[], start: Date, end: Date): boolean {
    return schedules.some(schedule => schedule.type === 'URGENT_AVAILABLE'
        && new Date(schedule.startTimestamp) <= start && new Date(schedule.endTimestamp) >= end)
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
export type RequestOutcome = 'accepted' | 'rejected' | 'cancelled' | 'completed'

/** The account may also hire services: ownership of this job determines who enters the PIN. */
export function canCompleteRequest(request: Pick<JobRequest, 'professionalId' | 'status'>, viewerId: string | undefined): boolean {
    return Boolean(viewerId && request.professionalId === viewerId
        && (request.status === 'ACCEPTED' || request.status === 'RESCHEDULE_REQUESTED'))
}

/** PINs are six-digit strings, including leading zeroes; never parse them as numbers. */
export function completionPin(value: string): { pin: string } | { error: string } {
    const pin = value.trim()
    return /^[0-9]{6}$/.test(pin) ? { pin } : { error: 'Ingresá el PIN de 6 dígitos que te muestra el cliente.' }
}
