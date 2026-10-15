import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joinSpanish, missingToRegister } from '../src/pages/Register/registerRequirements.ts'

test('a client only has to accept the terms', () => {
    assert.deepEqual(missingToRegister('client', '', '', false), ['aceptá los términos y condiciones'])
    assert.deepEqual(missingToRegister('client', '', '', true), [])
})

test('a professional also needs a valid phone and a location', () => {
    assert.deepEqual(missingToRegister('professional', '', '', true), ['ingresá tu teléfono', 'ingresá tu ubicación'])
    assert.deepEqual(missingToRegister('professional', '+598123', 'Salto', true), ['ingresá un número de teléfono válido, sin el código del país'])
    assert.deepEqual(missingToRegister('professional', '+59899123456', 'Salto', true), [])
})

test('the things to do are joined as a sentence', () => {
    assert.equal(joinSpanish([]), '')
    assert.equal(joinSpanish(['a']), 'a')
    assert.equal(joinSpanish(['a', 'b', 'c']), 'a, b y c')
})
