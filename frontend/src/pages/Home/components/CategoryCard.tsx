import type { CSSProperties } from 'react'
import type { Category } from '../Category'
import Icon from '../../../components/Icon/Icon'
import './CategoryCard.css'

function CategoryCard({
    label,
    backgroundColor,
    accentColor,
    icon,
    selected = false,
    onClick,
}: Category & { selected?: boolean; onClick?: () => void }) {
    const style = {
        '--category-background': backgroundColor,
        '--category-accent': accentColor,
    } as CSSProperties

    return (
        <button className={`category-card${selected ? ' category-card--selected' : ''}`} style={style} type="button" aria-pressed={selected} onClick={onClick}>
            <span className="category-card__icon">
                <Icon name={icon} />
            </span>
            <span className="category-card__label">{label}</span>
            <span className="category-card__arrow" aria-hidden="true">
                ›
            </span>
        </button>
    )
}

export default CategoryCard

