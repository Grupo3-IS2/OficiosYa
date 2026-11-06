import type { JobRequest } from '../../types/JobRequest'

const montevideoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * The transfers and refunds made between two days ("2026-11-03", as a date input gives them), both included and counted in
 * Montevideo's time, and to one professional; an empty end or professional leaves that filter open.
 */
export function filterPayouts(payouts: JobRequest[], from: string, to: string, professionalId = ''): JobRequest[] {
    return payouts.filter(job => {
        const date = transferDate(job)
        if (!date || (professionalId && job.professionalId !== professionalId)) return false
        const day = montevideoDay.format(new Date(date))
        return (!from || day >= from) && (!to || day <= to)
    })
}

/** The professionals that appear in the transfers, once each, by name. */
export function payoutProfessionals(payouts: JobRequest[]): { id: string; name: string }[] {
    const byId = new Map(payouts.map(job => [job.professionalId, job.professionalName]))
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/**
 * When the money left: a job keeps no date of its own for a refund, and nothing changes it after that one.
 * shortcut: updatedAt stands for the refund's date; a refundedAt column if anything else ever edits those jobs.
 */
export const transferDate = (job: JobRequest) => job.paymentState === 'REFUNDED' ? job.updatedAt : job.payoutAt

/** Newest first, transfers and refunds together. */
export const byNewest = (jobs: JobRequest[]) => [...jobs].sort((a, b) => (transferDate(b) ?? '').localeCompare(transferDate(a) ?? ''))

/** What the professional gets of a job: the payment minus OficiosYa's commission. */
export const professionalShare = (job: JobRequest) => job.paymentAmount - (job.platformFee ?? 0)
