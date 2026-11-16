import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ScheduleChoiceModal.css'

export interface ScheduleChoice {
    label: string
    hint?: string
    danger?: boolean
    onSelect: () => void
}

/** Asks what to do with a block: each choice is a big button with a line that explains it. */
export default function ScheduleChoiceModal({ title, description, choices, busy, onCancel }: Readonly<{
    title: string
    description: string
    choices: ScheduleChoice[]
    busy: boolean
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
        <dialog ref={dialog} className="schedule-choice-modal" aria-labelledby="schedule-choice-title" aria-describedby="schedule-choice-description" aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
            <div className="schedule-choice-modal__body">
                <h2 id="schedule-choice-title">{title}</h2>
                <p id="schedule-choice-description">{description}</p>
                <div className="schedule-choice-modal__choices">
                    {choices.map((choice, index) => <button
                        type="button"
                        key={choice.label}
                        className={choice.danger ? 'is-danger' : ''}
                        onClick={choice.onSelect}
                        disabled={busy}
                        autoFocus={index === 0}
                    >
                        <strong>{choice.label}</strong>
                        {choice.hint && <span>{choice.hint}</span>}
                    </button>)}
                </div>
                <button type="button" className="schedule-choice-modal__cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
            </div>
        </dialog>,
        document.body,
    )
}
