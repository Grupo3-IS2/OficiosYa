import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeFilterCount, selectOnlyTrade, toggleTrade, tradesFor, tradeSelectionName } from '../src/pages/Home/professionalFilters.ts'

test('toggling a trade adds it or takes it out of the selection', () => {
    assert.deepEqual(toggleTrade([], 10), [10])
    assert.deepEqual(toggleTrade([10], 20), [10, 20])
    assert.deepEqual(toggleTrade([10, 20], 10), [20])
})
test('the chosen trades are named for a heading', () => {
    assert.equal(tradeSelectionName([]), '')
    assert.equal(tradeSelectionName(['Plomería']), 'Plomería')
    assert.equal(tradeSelectionName(['Plomería', 'Electricista', 'Pintura']), 'Plomería, Electricista y Pintura')
    assert.equal(tradeSelectionName(['A', 'B', 'C', 'D']), '4 rubros')
})

test('tapping a trade card chooses only that trade, and tapping it again chooses none', () => {
    assert.deepEqual(selectOnlyTrade([], 10), [10])
    assert.deepEqual(selectOnlyTrade([10], 20), [20])
    assert.deepEqual(selectOnlyTrade([10, 20], 10), [10])
    assert.deepEqual(selectOnlyTrade([10], 10), [])
})

test('tradesFor filters professional trades by selected tradeIds, or returns all if empty', () => {
    const professional = {
        id: 'p-1',
        name: 'Carlos',
        workingLocation: 'Montevideo',
        phoneNumber: '099123456',
        expertiseTrades: [
            { id: 1, tradeId: 10, tradeName: 'Plomería', minimumHourlyWage: 100, maximumHourlyWage: 200 },
            { id: 2, tradeId: 20, tradeName: 'Electricista', minimumHourlyWage: 150, maximumHourlyWage: 300 },
        ],
    } as any

    assert.equal(tradesFor(professional, []).length, 2)
    assert.deepEqual(tradesFor(professional, [10]), [professional.expertiseTrades[0]])
    assert.deepEqual(tradesFor(professional, [30]), [])
})

test('activeFilterCount tallies active filters accurately', () => {
    assert.equal(activeFilterCount({
        location: '',
        minimumPrice: null,
        maximumPrice: null,
        minimumRating: null,
        availability: null,
    }), 0)

    assert.equal(activeFilterCount({
        location: ' Pocitos ',
        minimumPrice: 200,
        maximumPrice: null,
        minimumRating: null,
        availability: null,
    }), 2)

    assert.equal(activeFilterCount({
        location: 'Cordón',
        minimumPrice: null,
        maximumPrice: 500,
        minimumRating: 4.0,
        availability: { from: '2026-10-15', to: '2026-10-16' },
    }), 4)
})
