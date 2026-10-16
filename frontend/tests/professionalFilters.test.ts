import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectOnlyTrade, toggleTrade, tradeSelectionName } from '../src/pages/Home/professionalFilters.ts'

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
