import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyProfessionalFilters } from '../src/pages/Home/professionalFilters.ts'
import { searchParams } from '../src/pages/Home/professionalSearch.ts'

// Wednesday 2 January 2030, 10:00.
const wednesday = new Date(2030, 0, 2, 10)
const nothing = { query: '', tradeIds: [], filters: emptyProfessionalFilters, order: 'relevance' as const }

test('without filters only the page goes, and relevance is the backend default', () => {
    assert.equal(searchParams(nothing, 0, 12, wednesday).toString(), 'page=0&size=12')
})

test('every filter goes as the backend names it', () => {
    const params = searchParams({
        query: ' Ana ',
        tradeIds: [3, 5],
        filters: { location: ' Cordón ', minimumPrice: 300, maximumPrice: 900, minimumRating: 4.5, availability: { from: '2030-01-02', to: '2030-01-03' } },
        order: 'price-desc',
    }, 2, 12, wednesday)

    assert.equal(params.get('page'), '2')
    assert.equal(params.get('query'), 'Ana')
    assert.deepEqual(params.getAll('tradeIds'), ['3', '5'])
    assert.equal(params.get('minPrice'), '300')
    assert.equal(params.get('maxPrice'), '900')
    assert.equal(params.get('minRating'), '9')
    assert.equal(params.get('location'), 'Cordón')
    // From now (the first day already started) to the end of the last day.
    assert.equal(params.get('availableFrom'), wednesday.toISOString())
    assert.equal(params.get('availableTo'), new Date(2030, 0, 4).toISOString())
    assert.equal(params.get('order'), 'PRICE_DESC')
})

test('orders the backend lacks ("Más cercanos") go as relevance', () => {
    assert.equal(searchParams({ ...nothing, order: 'distance' }, 0, 12, wednesday).get('order'), null)
    assert.equal(searchParams({ ...nothing, order: 'rating-desc' }, 0, 12, wednesday).get('order'), 'RATING_DESC')
})
