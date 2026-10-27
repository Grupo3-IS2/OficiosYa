import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import './OutsideAvailabilityModal.css'

/** Outside the professional's availability the job can still be booked, once the user confirms it. */
export default function OutsideAvailabilityModal({ onConfirm, onCancel }: Readonly<{
    onConfirm: () => void
    onCancel: () => void
}>) {
    const dialog = useRef<HTMLDialogElement>(null)

    useEffect(() => {
        const previousFocus = document.activeElement
        const element = dialog.current!
        const previousOverflow = document.body.style.overflow
        element.showModal()
        document.body.style.overflow = 'hidden'
        return () => {
            element.close()
            document.body.style.overflow = previousOverflow
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
        }
    }, [])

    return createPortal(
        <dialog ref={dialog} className="outside-availability-modal" aria-labelledby="outside-availability-title" aria-describedby="outside-availability-description"
            onCancel={event => { event.preventDefault(); onCancel() }}>
            <div className="outside-availability-modal__body">
                <span className="outside-availability-modal__warning" aria-hidden="true">!</span>
                <h2 id="outside-availability-title">El profesional no tiene disponibilidad en ese horario</h2>
                <p id="outside-availability-description">¿Querés continuar igual?</p>
                <div className="outside-availability-modal__actions">
                    <button type="button" onClick={onCancel} autoFocus>Cancelar</button>
                    <Button type="button" onClick={onConfirm}>Continuar igual</Button>
                </div>
            </div>
        </dialog>,
        document.body,
    )
}
