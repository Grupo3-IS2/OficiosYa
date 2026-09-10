import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/Button/Button'
import './UnsavedChangesModal.css'

interface Props {
    busy: boolean
    error: string
    onSave: () => void
    onDiscard: () => void
    onCancel: () => void
}

export default function UnsavedChangesModal({ busy, error, onSave, onDiscard, onCancel }: Props) {
    const dialog = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        const previousFocus = document.activeElement
        const element = dialog.current!
        const previousOverflow = document.body.style.overflow
        element.showModal()
        element.querySelector<HTMLButtonElement>('.unsaved-modal__cancel')?.focus()
        document.body.style.overflow = 'hidden'
        return () => {
            element.close()
            document.body.style.overflow = previousOverflow
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
        }
    }, [])

    return createPortal(
        <dialog ref={dialog} className="unsaved-modal" aria-labelledby="unsaved-title" aria-describedby="unsaved-description" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
            <header className="unsaved-modal__header">
                <span>Al salir sin guardar</span>
                <button type="button" aria-label="Cerrar" disabled={busy} onClick={onCancel}>×</button>
            </header>
            <div className="unsaved-modal__body">
                <span className="unsaved-modal__warning" aria-hidden="true">!</span>
                <h2 id="unsaved-title">Tienes cambios sin guardar</h2>
                <p id="unsaved-description">Si sales ahora, los cambios realizados se perderán.</p>
                {error && <p className="unsaved-modal__error" role="alert">{error}</p>}
                <div className="unsaved-modal__actions">
                    <Button type="button" disabled={busy} onClick={onSave}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
                    <Button type="button" className="unsaved-modal__discard" disabled={busy} onClick={onDiscard}>Descartar cambios</Button>
                    <button type="button" className="unsaved-modal__cancel" disabled={busy} onClick={onCancel} autoFocus>Cancelar</button>
                </div>
            </div>
        </dialog>, document.body,
    )
}
