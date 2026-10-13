export interface ServiceRequestTaskDraft {
    id: number
    tradeId: number
    description: string
}

export interface ServiceRequestFormValue {
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
    paymentAmount?: string
    tasks?: string
    taskErrors: ServiceRequestTaskErrors[]
}

export function initialTradeId(availableTradeIds: number[], preferredTradeId: number | null): number {
    if (preferredTradeId !== null && availableTradeIds.includes(preferredTradeId)) return preferredTradeId
    return availableTradeIds[0] ?? 0
}

export function validateServiceRequest(value: ServiceRequestFormValue): ServiceRequestFormErrors {
    const errors: ServiceRequestFormErrors = { taskErrors: [] }
    const amount = Number(value.paymentAmount)

    if (!value.location.trim()) errors.location = 'Ingresá la dirección o ubicación.'
    if (!value.paymentAmount.trim()) errors.paymentAmount = 'Ingresá el monto del servicio.'
    else if (!Number.isFinite(amount) || amount < 0) errors.paymentAmount = 'El monto no puede ser negativo.'
    if (value.tasks.length === 0) errors.tasks = 'Agregá al menos una tarea.'

    errors.taskErrors = value.tasks.map(task => ({
        ...(task.tradeId <= 0 ? { tradeId: 'Seleccioná un oficio.' } : {}),
        ...(!task.description.trim() ? { description: 'Describí el trabajo a realizar.' } : {}),
    }))

    return errors
}

export function hasServiceRequestErrors(errors: ServiceRequestFormErrors): boolean {
    return Boolean(
        errors.location
        || errors.paymentAmount
        || errors.tasks
        || errors.taskErrors.some(task => task.tradeId || task.description),
    )
}
