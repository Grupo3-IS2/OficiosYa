import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import ZonePicker from '../../../components/ZonePicker/ZonePicker'
import { getCurrentUser } from '../../../services/authService'
import { ApiError } from '../../../services/api'
import { createJobRequest } from '../../../services/jobRequestService'
import { saveJobRequestPin } from '../../../services/jobRequestPinStore'
import type { ExpertiseTrade, Professional } from '../../../types/Professional'
import {
    hasServiceRequestErrors,
    initialTradeId,
    validateServiceRequest,
    type ServiceRequestFormValue,
} from '../serviceRequestForm'
import './ServiceRequestModal.css'

interface ServiceRequestModalProps {
    professional: Professional
    /** The service chosen on the profile, if any: the first task starts with it. */
    preferredTradeId: number | null
    onClose: () => void
}

function ServiceRequestModal({ professional, preferredTradeId, onClose }: Readonly<ServiceRequestModalProps>) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const nextTaskId = useRef(2)
    const submissionInFlight = useRef(false)
    const copyFeedbackTimeout = useRef<number | null>(null)
    const defaultTradeId = initialTradeId(
        professional.expertiseTrades.map(trade => trade.tradeId),
        preferredTradeId,
    )
    const [value, setValue] = useState<ServiceRequestFormValue>({
        location: '',
        paymentAmount: '',
        tasks: [{ id: 1, tradeId: defaultTradeId, description: '' }],
    })
    const [showErrors, setShowErrors] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submissionError, setSubmissionError] = useState('')
    const [confirmationPin, setConfirmationPin] = useState('')
    const [copyFeedback, setCopyFeedback] = useState('')
    const errors = useMemo(() => validateServiceRequest(value), [value])

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return

        const previousFocus = document.activeElement
        const previousBodyOverflow = document.body.style.overflow
        const previousRootOverflow = document.documentElement.style.overflow
        dialog.showModal()
        document.body.style.overflow = 'hidden'
        document.documentElement.style.overflow = 'hidden'
        dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()

        return () => {
            if (copyFeedbackTimeout.current !== null) window.clearTimeout(copyFeedbackTimeout.current)
            dialog.close()
            document.body.style.overflow = previousBodyOverflow
            document.documentElement.style.overflow = previousRootOverflow
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
        }
    }, [])

    function requestClose() {
        if (!submitting) onClose()
    }

    function updateTask(taskId: number, changes: Partial<Pick<ServiceRequestFormValue['tasks'][number], 'tradeId' | 'description'>>) {
        setValue(current => ({
            ...current,
            tasks: current.tasks.map(task => task.id === taskId ? { ...task, ...changes } : task),
        }))
    }

    function addTask() {
        const id = nextTaskId.current++
        setValue(current => ({
            ...current,
            tasks: [...current.tasks, { id, tradeId: defaultTradeId, description: '' }],
        }))
    }

    function removeTask(taskId: number) {
        setValue(current => current.tasks.length === 1
            ? current
            : { ...current, tasks: current.tasks.filter(task => task.id !== taskId) })
    }

    async function submitRequest() {
        if (submissionInFlight.current) return
        setShowErrors(true)
        setSubmissionError('')
        if (hasServiceRequestErrors(errors)) return

        submissionInFlight.current = true
        setSubmitting(true)
        try {
            const response = await createJobRequest({
                professionalId: professional.id,
                location: value.location.trim(),
                paymentAmount: Number(value.paymentAmount),
                tasks: value.tasks.map(task => ({
                    tradeId: task.tradeId,
                    description: task.description.trim(),
                })),
            })
            // The authenticated user made the request, even when that account is also a professional.
            // Scope the PIN to that creator instead of deriving ownership from their account role.
            const creatorId = getCurrentUser()?.id
            if (creatorId) saveJobRequestPin(creatorId, response.id, response.confirmationPin)
            setConfirmationPin(response.confirmationPin)
        } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                setSubmissionError('Necesitás iniciar sesión como cliente para enviar una solicitud.')
            } else if (error instanceof ApiError) {
                setSubmissionError(error.message)
            } else {
                setSubmissionError('No pudimos enviar la solicitud. Intentá nuevamente.')
            }
        } finally {
            submissionInFlight.current = false
            setSubmitting(false)
        }
    }

    function showCopyFeedback(message: string) {
        if (copyFeedbackTimeout.current !== null) window.clearTimeout(copyFeedbackTimeout.current)
        setCopyFeedback(message)
        copyFeedbackTimeout.current = window.setTimeout(() => setCopyFeedback(''), 2500)
    }

    async function copyPin() {
        try {
            await navigator.clipboard.writeText(confirmationPin)
            showCopyFeedback('PIN copiado')
        } catch {
            showCopyFeedback('No se pudo copiar el PIN')
        }
    }

    const selectedTrade = professional.expertiseTrades.find(trade => trade.tradeId === defaultTradeId)

    return createPortal(
        <dialog
            ref={dialogRef}
            className={`service-request-modal${confirmationPin ? ' service-request-modal--success' : ''}`}
            aria-labelledby="service-request-title"
            aria-describedby={confirmationPin ? undefined : 'service-request-subtitle'}
            aria-busy={submitting}
            onCancel={event => {
                event.preventDefault()
                requestClose()
            }}
        >
            <header className="service-request-modal__header">
                <div>
                    <h2 id="service-request-title">
                        {confirmationPin ? 'Solicitud enviada' : 'Solicitar servicio'}
                    </h2>
                    {!confirmationPin && (
                        <p id="service-request-subtitle">
                            {professional.name}{selectedTrade ? ` · ${selectedTrade.tradeName}` : ''}
                        </p>
                    )}
                </div>
                <button
                    className="service-request-modal__close"
                    type="button"
                    aria-label="Cerrar"
                    disabled={submitting}
                    onClick={requestClose}
                >
                    <Icon name="close" />
                </button>
            </header>

            {confirmationPin ? (
                <div className="service-request-success">
                    <span className="service-request-success__icon" aria-hidden="true">
                        <Icon name="check" />
                    </span>
                    <h3>Solicitud enviada</h3>
                    <section className="service-request-success__pin" aria-label="PIN de confirmación">
                        <strong>PIN de confirmación</strong>
                        <output>{confirmationPin}</output>
                        <p>Guardá este PIN. El profesional lo necesitará para confirmar que el trabajo fue completado.</p>
                    </section>
                    <div className="service-request-success__actions">
                        <Button type="button" variant="ghost" onClick={() => void copyPin()}>
                            <Icon name="copy" /> Copiar PIN
                        </Button>
                        <Button type="button" onClick={() => { window.location.href = '/mis-solicitudes' }}>
                            Ver mis solicitudes
                        </Button>
                    </div>
                    <p className="service-request-success__feedback" aria-live="polite">{copyFeedback}</p>
                </div>
            ) : (
                <>
                    <div className="service-request-modal__body">
                        {/* Not a <label> around it all: the map and the suggestions inside are controls of their own */}
                        <div className="service-request-field">
                            <label htmlFor="service-request-location">¿Dónde se realizará el trabajo? <em>*</em></label>
                            <span className="service-request-input">
                                <Icon name="location" />
                                <input
                                    id="service-request-location"
                                    type="text"
                                    placeholder="Dirección o ubicación"
                                    value={value.location}
                                    aria-invalid={showErrors && Boolean(errors.location)}
                                    aria-describedby={showErrors && errors.location ? 'service-request-location-error' : undefined}
                                    data-autofocus
                                    onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(current => ({ ...current, location: event.target.value }))}
                                />
                            </span>
                            {showErrors && errors.location && <small id="service-request-location-error" className="service-request-error">{errors.location}</small>}
                            {/* The same help as when a professional enters their zone: suggestions while typing, or a tap on the map */}
                            <ZonePicker
                                query={value.location}
                                onChoose={location => setValue(current => ({ ...current, location }))}
                                mapLabel="Mapa para elegir dónde se realizará el trabajo"
                            />
                        </div>

                        <label className="service-request-field" htmlFor="service-request-amount">
                            <span>Monto del servicio <em>*</em></span>
                            <span className="service-request-input">
                                <span className="service-request-input__prefix" aria-hidden="true">$</span>
                                <input
                                    id="service-request-amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    placeholder="Ingrese el monto"
                                    value={value.paymentAmount}
                                    aria-invalid={showErrors && Boolean(errors.paymentAmount)}
                                    aria-describedby={showErrors && errors.paymentAmount ? 'service-request-amount-error' : undefined}
                                    onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(current => ({ ...current, paymentAmount: event.target.value }))}
                                />
                            </span>
                            {showErrors && errors.paymentAmount && <small id="service-request-amount-error" className="service-request-error">{errors.paymentAmount}</small>}
                        </label>

                        <section className="service-request-tasks" aria-labelledby="service-request-tasks-title">
                            <h3 id="service-request-tasks-title">Tareas</h3>
                            {value.tasks.map((task, index) => (
                                <TaskFields
                                    key={task.id}
                                    index={index}
                                    task={task}
                                    trades={professional.expertiseTrades}
                                    showErrors={showErrors}
                                    errors={errors.taskErrors[index]}
                                    onChange={changes => updateTask(task.id, changes)}
                                    onRemove={() => removeTask(task.id)}
                                />
                            ))}
                            {showErrors && errors.tasks && <small className="service-request-error">{errors.tasks}</small>}
                            <button className="service-request-add-task" type="button" onClick={addTask}>
                                <Icon name="plus" /> Agregar otra tarea
                            </button>
                        </section>

                        {submissionError && <p className="service-request-submit-error" role="alert">{submissionError}</p>}
                    </div>

                    <footer className="service-request-modal__footer">
                        <Button type="button" variant="ghost" disabled={submitting} onClick={requestClose}>Cancelar</Button>
                        <Button type="button" disabled={submitting} onClick={() => void submitRequest()}>
                            {submitting ? 'Enviando…' : 'Enviar solicitud'}
                        </Button>
                    </footer>
                </>
            )}
        </dialog>,
        document.body,
    )
}

interface TaskFieldsProps {
    index: number
    task: ServiceRequestFormValue['tasks'][number]
    trades: ExpertiseTrade[]
    showErrors: boolean
    errors: ReturnType<typeof validateServiceRequest>['taskErrors'][number]
    onChange: (changes: Partial<Pick<ServiceRequestFormValue['tasks'][number], 'tradeId' | 'description'>>) => void
    onRemove: () => void
}

function TaskFields({ index, task, trades, showErrors, errors, onChange, onRemove }: Readonly<TaskFieldsProps>) {
    const selectId = `service-request-task-${task.id}-trade`
    const descriptionId = `service-request-task-${task.id}-description`

    return (
        <fieldset className="service-request-task">
            <legend>Tarea {index + 1}</legend>
            <label htmlFor={selectId}>
                <span>Oficio</span>
                <select
                    id={selectId}
                    value={task.tradeId}
                    aria-invalid={showErrors && Boolean(errors?.tradeId)}
                    onChange={event => onChange({ tradeId: Number(event.target.value) })}
                >
                    <option value={0} disabled>Elegí un servicio</option>
                    {trades.map(trade => <option key={trade.tradeId} value={trade.tradeId}>{trade.tradeName}</option>)}
                </select>
                {showErrors && errors?.tradeId && <small className="service-request-error">{errors.tradeId}</small>}
            </label>
            <label htmlFor={descriptionId}>
                <span>Descripción</span>
                <textarea
                    id={descriptionId}
                    rows={3}
                    placeholder="Describí concretamente el trabajo a realizar."
                    value={task.description}
                    aria-invalid={showErrors && Boolean(errors?.description)}
                    onChange={event => onChange({ description: event.target.value })}
                />
                {showErrors && errors?.description && <small className="service-request-error">{errors.description}</small>}
            </label>
            {index > 0 && (
                <button className="service-request-remove-task" type="button" onClick={onRemove}>
                    <Icon name="trash" /> Eliminar tarea
                </button>
            )}
        </fieldset>
    )
}

export default ServiceRequestModal
