import type { JobRequest } from '../../types/JobRequest'

export interface MonthBalance {
    /** "2026-11" */
    month: string
    jobs: number
    /** What clients paid, OficiosYa's commission, and what is left for the professional. */
    gross: number
    fee: number
    net: number
    /** The net already transferred, and the net still waiting for the transfer. */
    transferred: number
    pending: number
    /** That month's paid jobs, latest first. */
    items: JobRequest[]
}

const monthKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit' })
const cents = (amount: number) => Math.round(amount * 100)
/** When the work was done: its scheduled start, falling back for jobs without one. */
export const workedAt = (job: JobRequest) => job.scheduledStart ?? job.paidAt ?? job.createdAt

const montevideoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The jobs done between two days ("2026-11-03", as a date input gives them), both included; an empty end is open. */
export function jobsBetween(jobs: JobRequest[], from: string, to: string): JobRequest[] {
    return jobs.filter(job => {
        const day = montevideoDay.format(new Date(workedAt(job)))
        return (!from || day >= from) && (!to || day <= to)
    })
}

/**
 * The professional's paid jobs (PIN entered), grouped by the month the work was scheduled, newest first.
 * Summed in cents so the totals don't drift.
 */
export function monthlyBalance(jobs: JobRequest[], professionalId: string): MonthBalance[] {
    const months = new Map<string, { jobs: number; gross: number; fee: number; transferred: number; items: JobRequest[] }>()
    for (const job of jobs) {
        if (job.professionalId !== professionalId || job.paymentState !== 'PAID' || job.platformFee == null) continue
        const month = monthKey.format(new Date(workedAt(job))).slice(0, 7)
        const total = months.get(month) ?? { jobs: 0, gross: 0, fee: 0, transferred: 0, items: [] }
        const net = cents(job.paymentAmount) - cents(job.platformFee)
        months.set(month, {
            jobs: total.jobs + 1,
            gross: total.gross + cents(job.paymentAmount),
            fee: total.fee + cents(job.platformFee),
            transferred: total.transferred + (job.payoutAt ? net : 0),
            items: [...total.items, job],
        })
    }
    return [...months.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, total]) => ({
            month,
            jobs: total.jobs,
            gross: total.gross / 100,
            fee: total.fee / 100,
            net: (total.gross - total.fee) / 100,
            transferred: total.transferred / 100,
            pending: (total.gross - total.fee - total.transferred) / 100,
            items: total.items.sort((a, b) => Date.parse(workedAt(b)) - Date.parse(workedAt(a))),
        }))
}
