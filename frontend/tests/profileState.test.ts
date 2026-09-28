import assert from 'node:assert/strict'
import { test } from 'node:test'
import { personalChanged, professionalChanged, securityChanged, validatePhone, validateProfessional, validateSecurity } from '../src/pages/EditProfile/profileState.ts'

const personal = { name: 'Ana', email: 'ana@example.com', phone: '099123456', avatar: '' }
const professional = {
    description: 'Realizo instalaciones eléctricas.',
    workingLocation: 'Montevideo',
    published: false,
    trades: [{ id: 1, tradeId: 2, tradeName: 'Electricidad', minimumHourlyWage: '1000', maximumHourlyWage: '1500' }],
}

test('personal fields, including photo, are dirty only while different from the saved values', () => {
    assert.equal(personalChanged({ ...personal }, personal), false)
    for (const key of Object.keys(personal)) {
        assert.equal(personalChanged({ ...personal, [key]: 'changed' }, personal), true, key)
    }
    assert.equal(personalChanged({ ...personal, name: 'Ana' }, personal), false)
})

test('professional changes include description, location, trades and publication', () => {
    assert.equal(professionalChanged({ ...professional }, professional), false)
    assert.equal(professionalChanged({ ...professional, workingLocation: 'Pando' }, professional), true)
    assert.equal(professionalChanged({ ...professional, description: '' }, professional), true)
    assert.equal(professionalChanged({ ...professional, published: true }, professional), true)
    assert.equal(professionalChanged({ ...professional, trades: [] }, professional), true)
    assert.equal(professionalChanged({ ...professional, trades: [{ ...professional.trades[0], maximumHourlyWage: '1800' }] }, professional), true)
})

test('publication requires a description and a trade with valid hourly rates', () => {
    assert.equal(validateProfessional({ ...professional, published: true }, professional), '')
    assert.match(validateProfessional({ ...professional, published: true, trades: [] }, professional), /oficio/)
    assert.match(validateProfessional({ ...professional, workingLocation: '' }, professional), /ubicación/)
    assert.match(validateProfessional({ ...professional, trades: [{ ...professional.trades[0], maximumHourlyWage: '500' }] }, professional), /tarifas/)
})

test('a professional phone is required and follows the same rule as the backend', () => {
    assert.match(validatePhone(''), /Ingresa tu número/)
    assert.match(validatePhone('   '), /Ingresa tu número/)
    assert.match(validatePhone('12345'), /teléfono válido/)
    assert.match(validatePhone('+5989912345678'), /teléfono válido/)
    assert.equal(validatePhone('099123456'), '')
    assert.equal(validatePhone(' +598991234567 '), '')
})

test('clearing password fields restores clean state and validation rejects incomplete or mismatched input', () => {
    const empty = { current: '', password: '', confirmation: '' }
    assert.equal(securityChanged(empty), false)
    assert.equal(securityChanged({ ...empty, current: 'typed' }), true)
    assert.match(validateSecurity(empty), /Completa/)
    assert.match(validateSecurity({ current: 'old', password: 'short', confirmation: 'short' }), /8 caracteres/)
    assert.match(validateSecurity({ current: 'old', password: 'New-password1!', confirmation: 'Different-password1!' }), /coinciden/)
    assert.match(validateSecurity({ current: 'Same-password1!', password: 'Same-password1!', confirmation: 'Same-password1!' }), /diferente/)
    assert.equal(validateSecurity({ current: 'old-password', password: 'New-password1!', confirmation: 'New-password1!' }), '')
})
