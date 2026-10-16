import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/Button/Button'
import './ScheduleDeleteModal.css'

export default function ScheduleDeleteModal({ description, busy, onConfirm, onCancel }: Readonly<{
    description: string
    busy: boolean
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
        <dialog ref={dialog} className="schedule-delete-modal" aria-labelledby="schedule-delete-title" aria-describedby="schedule-delete-description" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
            <div className="schedule-delete-modal__body">
                <span className="schedule-delete-modal__warning" aria-hidden="true">!</span>
                <h2 id="schedule-delete-title">¿Estás seguro de que querés eliminar?</h2>
                <p id="schedule-delete-description">{description}</p>
                <div className="schedule-delete-modal__actions">
                    <button type="button" onClick={onCancel} disabled={busy} autoFocus>Cancelar</button>
                    <Button type="button" className="schedule-delete-modal__confirm" onClick={onConfirm} disabled={busy}>
                        {busy ? 'Eliminando…' : 'Eliminar'}
                    </Button>
                </div>
            </div>
        </dialog>,
        document.body,
    )
}
