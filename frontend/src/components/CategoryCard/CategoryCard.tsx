import type { CSSProperties } from 'react'
import type { Category } from '../../types/Category'
import Icon from '../Icon/Icon'
import './CategoryCard.css'

function CategoryCard({
    label,
    backgroundColor,
    accentColor,
    icon,
}: Category) {
    const style = {
        '--category-background': backgroundColor,
        '--category-accent': accentColor,
    } as CSSProperties

    return (
        <button className="category-card" style={style} type="button">
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

