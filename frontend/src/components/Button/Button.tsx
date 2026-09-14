import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import './Button.css'

type ButtonProps = PropsWithChildren<
    ButtonHTMLAttributes<HTMLButtonElement>
> & {
    variant?: 'primary' | 'ghost'
}

function Button({
    children,
    variant = 'primary',
    className = '',
    ...props
}: ButtonProps) {
    return (
        <button className={`button button--${variant} ${className}`} {...props}>
            {children}
        </button>
    )
}

export default Button

