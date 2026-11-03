import type { JobRequest } from '../../types/JobRequest'

const montevideoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * The transfers made between two days ("2026-11-03", as a date input gives them), both included and counted in
 * Montevideo's time, and to one professional; an empty end or professional leaves that filter open.
 */
export function filterPayouts(payouts: JobRequest[], from: string, to: string, professionalId = ''): JobRequest[] {
    return payouts.filter(job => {
        if (!job.payoutAt || (professionalId && job.professionalId !== professionalId)) return false
        const day = montevideoDay.format(new Date(job.payoutAt))
        return (!from || day >= from) && (!to || day <= to)
    })
}

/** The professionals that appear in the transfers, once each, by name. */
export function payoutProfessionals(payouts: JobRequest[]): { id: string; name: string }[] {
    const byId = new Map(payouts.map(job => [job.professionalId, job.professionalName]))
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
