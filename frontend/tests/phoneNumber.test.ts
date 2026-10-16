import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fullPhoneNumber, splitPhoneNumber } from '../src/services/phoneNumber.ts'
import { missingToRegister } from '../src/pages/Register/registerRequirements.ts'

const countries = [
    { iso: 'ar', name: 'Argentina', dial: '+54' },
    { iso: 'ca', name: 'Canadá', dial: '+1' },
    { iso: 'ag', name: 'Antigua y Barbuda', dial: '+1268' },
    { iso: 'uy', name: 'Uruguay', dial: '+598' },
]

test('the prefix goes in front, and the 0 that starts the number inside the country goes away', () => {
    assert.equal(fullPhoneNumber('+598', '099 123-456'), '+59899123456')
    assert.equal(fullPhoneNumber('+54', '11 2345 6789'), '+541123456789')
    assert.equal(fullPhoneNumber('+598', '  '), '')
})

test('a prefix written by hand counts only for its digits, and a whole number with its + is kept', () => {
    assert.equal(fullPhoneNumber('598', '099123456'), '+59899123456')
    assert.equal(fullPhoneNumber(' + 598 ', '099123456'), '+59899123456')
    assert.equal(fullPhoneNumber('+598', '+54 11 2345 6789'), '+541123456789')
})

test('a saved phone splits on the longest prefix of the list it starts with', () => {
    assert.deepEqual(splitPhoneNumber('+59899123456', countries), { prefix: { iso: 'uy', dial: '+598' }, number: '99123456' })
    assert.deepEqual(splitPhoneNumber('+541123456789', countries), { prefix: { iso: 'ar', dial: '+54' }, number: '1123456789' })
    assert.deepEqual(splitPhoneNumber('+12685551234', countries), { prefix: { iso: 'ag', dial: '+1268' }, number: '5551234' })
})

test('without the list, or for a phone saved without a prefix, Uruguay is assumed and nothing is lost', () => {
    assert.deepEqual(splitPhoneNumber('+59899123456', []), { prefix: { iso: 'uy', dial: '+598' }, number: '99123456' })
    assert.deepEqual(splitPhoneNumber('+541123456789', []), { prefix: { iso: 'uy', dial: '+598' }, number: '+541123456789' })
    assert.deepEqual(splitPhoneNumber('099123456', countries), { prefix: { iso: 'uy', dial: '+598' }, number: '099123456' })
    assert.deepEqual(splitPhoneNumber('', countries), { prefix: { iso: 'uy', dial: '+598' }, number: '' })
})

test('splitting and joining again gives the same phone', () => {
    for (const phone of ['+59899123456', '+541123456789', '+12685551234']) {
        const { prefix, number } = splitPhoneNumber(phone, countries)
        assert.equal(fullPhoneNumber(prefix.dial, number), phone)
    }
    // An old phone saved without its prefix is saved with Uruguay's once edited: it becomes international.
    const { prefix, number } = splitPhoneNumber('099123456', countries)
    assert.equal(fullPhoneNumber(prefix.dial, number), '+59899123456')
})

test('a Uruguayan mobile written as usual is a valid phone for the backend', () => {
    assert.deepEqual(missingToRegister('professional', fullPhoneNumber('+598', '099123456'), 'Salto', true), [])
    assert.deepEqual(missingToRegister('professional', fullPhoneNumber('+598', '123abc'), 'Salto', true), ['ingresá un número de teléfono válido, sin el código del país'])
})
