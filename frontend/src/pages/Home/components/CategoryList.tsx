import { useState } from 'react'
import type { Trade } from '../../../types/Professional'
import { categoryStyles } from '../homeData'
import { selectOnlyTrade } from '../professionalFilters'
import CategoryCard from './CategoryCard'
import './CategoryList.css'

/** How many trades are shown on desktop before "Ver todos": about two rows. */
const COLLAPSED_COUNT = 12

interface Props {
    trades: Trade[]
    selectedTradeIds: readonly number[]
    onChange: (tradeIds: number[]) => void
}

/**
 * The trades over the results. A card chooses that trade alone (several are chosen in the filters). With many
 * trades they would push the professionals out of sight: collapsed, desktop shows the first rows and phones a
 * single row that scrolls sideways. Chosen trades are always shown.
 */
export default function CategoryList({ trades, selectedTradeIds, onChange }: Readonly<Props>) {
    const [expanded, setExpanded] = useState(false)
    const collapsible = trades.length > COLLAPSED_COUNT
    const collapsed = collapsible && !expanded

    return (
        <>
            <div id="category-list" className={`category-list${collapsed ? ' category-list--collapsed' : ''}`}>
                {trades.map((trade, index) => (
                    <div key={trade.id} className={`category-list__item${index >= COLLAPSED_COUNT && !selectedTradeIds.includes(trade.id) ? ' category-list__item--extra' : ''}`}>
                        <CategoryCard label={trade.name} selected={selectedTradeIds.includes(trade.id)} onClick={() => onChange(selectOnlyTrade(selectedTradeIds, trade.id))} {...categoryStyles[index % categoryStyles.length]} />
                    </div>
                ))}
            </div>
            {collapsible && (
                <button type="button" className="category-list__toggle" aria-expanded={expanded} aria-controls="category-list" onClick={() => setExpanded(current => !current)}>
                    {expanded ? 'Ver menos rubros' : `Ver todos los rubros (${trades.length})`}
                </button>
            )}
        </>
    )
}
