import assert from 'node:assert/strict'
import { test } from 'node:test'
import { personalChanged, professionalChanged, securityChanged, validateSecurity, readLocalProfile, writeLocalProfile } from '../src/pages/EditProfile/profileState.ts'

const personal = { name: 'Ana', email: 'ana@example.com', phone: '099123456', avatar: '' }
const professional = { description: 'Electricista', zones: ['Montevideo', 'Pando'], accepting: true }

test('personal fields, including photo, are dirty only while different from the saved values', () => {
    assert.equal(personalChanged({ ...personal }, personal), false)
    for (const key of Object.keys(personal)) {
        assert.equal(personalChanged({ ...personal, [key]: 'changed' }, personal), true, key)
    }
    assert.equal(personalChanged({ ...personal, name: 'Ana' }, personal), false)
})

test('professional changes include description, zones and availability; zone order is immaterial', () => {
    assert.equal(professionalChanged({ ...professional, zones: ['Pando', 'Montevideo'] }, professional), false)
    assert.equal(professionalChanged({ ...professional, zones: ['Montevideo'] }, professional), true)
    assert.equal(professionalChanged({ ...professional, accepting: false }, professional), true)
    assert.equal(professionalChanged({ ...professional, description: '' }, professional), true)
})

test('clearing password fields restores clean state and validation rejects incomplete or mismatched input', () => {
    const empty = { current: '', password: '', confirmation: '' }
    assert.equal(securityChanged(empty), false)
    assert.equal(securityChanged({ ...empty, current: 'typed' }), true)
    assert.match(validateSecurity(empty), /Completa/)
    assert.match(validateSecurity({ current: 'old', password: 'short', confirmation: 'short' }), /8 caracteres/)
    assert.match(validateSecurity({ current: 'old', password: 'new-password', confirmation: 'different' }), /coinciden/)
    assert.match(validateSecurity({ current: 'same-password', password: 'same-password', confirmation: 'same-password' }), /diferente/)
    assert.equal(validateSecurity({ current: 'old-password', password: 'new-password', confirmation: 'new-password' }), '')
})

test('temporary saves survive reload, are account-scoped and reject storage failures', () => {
    const entries = new Map<string, string>()
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
    } })
    writeLocalProfile('ana', 'personal', personal)
    writeLocalProfile('ana', 'professional', professional)
    assert.deepEqual(readLocalProfile('ana'), { personal, professional })
    assert.equal(readLocalProfile('other').personal, undefined)
    assert.equal(entries.get('oficiosya_edit_profile:ana')!.includes('password'), false)
    entries.set('oficiosya_edit_profile:broken', '{')
    assert.deepEqual(readLocalProfile('broken'), {})
    entries.set('oficiosya_edit_profile:invalid', '{"personal":{"name":12}}')
    assert.equal(readLocalProfile('invalid').personal, undefined)
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
        getItem: () => null,
        setItem: () => { throw new Error('quota') },
    } })
    assert.throws(() => writeLocalProfile('ana', 'personal', personal), /No se pudieron guardar/)
    Reflect.deleteProperty(globalThis, 'sessionStorage')
})
