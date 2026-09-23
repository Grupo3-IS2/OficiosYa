import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterProfessionals, priceRangeFor } from '../src/pages/Home/professionalFilters.ts'
import { orderProfessionals } from '../src/pages/Home/professionalOrder.ts'
import type { Professional } from '../src/types/Professional.ts'

const professionals: Professional[] = [
    {
        id: '1', name: 'Ana', rating: 8, profileImageUrl: null, workingLocation: 'Montevideo', description: null,
        expertiseTrades: [
            { id: 1, tradeId: 10, tradeName: 'Plomería', minimumHourlyWage: 900, maximumHourlyWage: 1200 },
            { id: 2, tradeId: 20, tradeName: 'Calefones', minimumHourlyWage: 1200, maximumHourlyWage: 1500 },
        ],
    },
    {
        id: '2', name: 'Bruno', rating: 9, profileImageUrl: null, workingLocation: 'Canelones', description: null,
        expertiseTrades: [{ id: 3, tradeId: 10, tradeName: 'Plomería', minimumHourlyWage: 700, maximumHourlyWage: 1000 }],
    },
]

test('trade selection filters professionals and changes the available price range', () => {
    assert.deepEqual(filterProfessionals(professionals, 20, { location: '', minimumPrice: null, maximumPrice: null, minimumRating: null }).map(item => item.id), ['1'])
    assert.deepEqual(priceRangeFor(professionals, 10), { minimum: 700, maximum: 1200 })
    assert.deepEqual(priceRangeFor(professionals, 20), { minimum: 1200, maximum: 1500 })
})

test('filters combine location, price and rating using the selected trade', () => {
    const result = filterProfessionals(professionals, 10, { location: 'monte', minimumPrice: 1000, maximumPrice: 1300, minimumRating: 8 })
    assert.deepEqual(result.map(item => item.id), ['1'])
})

test('price order uses the selected trade instead of the global lowest price', () => {
    assert.deepEqual(orderProfessionals(professionals, 'price-asc', 20).map(item => item.id), ['1', '2'])
})
