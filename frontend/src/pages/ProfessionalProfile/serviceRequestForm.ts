import { rescheduleTimeframe, type RescheduleDraft } from '../Requests/rescheduleForm.ts'

export interface ServiceRequestTaskDraft {
    id: number
    tradeId: number
    description: string
}

/** date, startTime and endTime: optional, the timeframe the client recommends, which the professional starts from when accepting. */
export interface ServiceRequestFormValue extends RescheduleDraft {
    location: string
    paymentAmount: string
    tasks: ServiceRequestTaskDraft[]
}

export interface ServiceRequestTaskErrors {
    tradeId?: string
    description?: string
}

export interface ServiceRequestFormErrors {
    location?: string
    timeframe?: string
    paymentAmount?: string
    tasks?: string
    taskErrors: ServiceRequestTaskErrors[]
}

/**
 * The trade the first task starts with: the one chosen on the profile, or the only one the professional
 * offers. With several and none chosen it is 0, so the client picks it instead of getting one by chance.
 */
export function initialTradeId(availableTradeIds: number[], preferredTradeId: number | null): number {
    if (preferredTradeId !== null && availableTradeIds.includes(preferredTradeId)) return preferredTradeId
    return availableTradeIds.length === 1 ? availableTradeIds[0] : 0
}

export function validateServiceRequest(value: ServiceRequestFormValue, now = new Date()): ServiceRequestFormErrors {
    const errors: ServiceRequestFormErrors = { taskErrors: [] }
    const amount = Number(value.paymentAmount)
    const timeframe = requestedTimeframe(value, now)

    if (!value.location.trim()) errors.location = 'Ingresá la dirección o ubicación.'
    if (timeframe && 'error' in timeframe) errors.timeframe = timeframe.error
    if (!value.paymentAmount.trim()) errors.paymentAmount = 'Ingresá el monto del servicio.'
    else if (!Number.isFinite(amount) || amount < 0) errors.paymentAmount = 'El monto no puede ser negativo.'
    if (value.tasks.length === 0) errors.tasks = 'Agregá al menos una tarea.'

    errors.taskErrors = value.tasks.map(task => ({
        ...(task.tradeId <= 0 ? { tradeId: 'Seleccioná un oficio.' } : {}),
        ...(!task.description.trim() ? { description: 'Describí el trabajo a realizar.' } : {}),
    }))

    return errors
}

/** The timeframe the client recommends, null when they left it blank. */
export function requestedTimeframe(value: RescheduleDraft, now = new Date()): ReturnType<typeof rescheduleTimeframe> | null {
    if (!value.date && !value.startTime && !value.endTime) return null
    return rescheduleTimeframe(value, {}, now)
}

export function hasServiceRequestErrors(errors: ServiceRequestFormErrors): boolean {
    return Boolean(
        errors.location
        || errors.timeframe
        || errors.paymentAmount
        || errors.tasks
        || errors.taskErrors.some(task => task.tradeId || task.description),
    )
}
