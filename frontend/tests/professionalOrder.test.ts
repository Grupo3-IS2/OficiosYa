import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderProfessionals } from '../src/pages/Home/professionalOrder.ts'
import type { Professional } from '../src/types/Professional.ts'

function professional(id: string, name: string, rating: number | null, price?: number): Professional {
    return {
        id,
        name,
        rating,
        profileImageUrl: null,
        workingLocation: 'Montevideo',
        description: null,
        expertiseTrades: price === undefined ? [] : [{ id: Number(id), tradeId: Number(id), tradeName: 'Oficio', minimumHourlyWage: price, maximumHourlyWage: price }],
    }
}

test('price and rating orders use API values and leave missing values last', () => {
    const profiles = [
        professional('1', 'Ana', null),
        professional('2', 'Bruno', 8, 1200),
        professional('3', 'Carla', 9, 900),
    ]

    assert.deepEqual(orderProfessionals(profiles, 'price-asc').map(profile => profile.id), ['3', '2', '1'])
    assert.deepEqual(orderProfessionals(profiles, 'price-desc').map(profile => profile.id), ['2', '3', '1'])
    assert.deepEqual(orderProfessionals(profiles, 'rating-desc').map(profile => profile.id), ['3', '2', '1'])
    assert.deepEqual(orderProfessionals(profiles, 'rating-asc').map(profile => profile.id), ['2', '3', '1'])
    assert.deepEqual(profiles.map(profile => profile.id), ['1', '2', '3'])
})
