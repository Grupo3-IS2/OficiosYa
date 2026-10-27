import assert from 'node:assert/strict'
import { test } from 'node:test'
import { personalChanged, professionalChanged, securityChanged, validatePhone, validateProfessional, validateSecurity } from '../src/pages/EditProfile/profileState.ts'

const personal = { name: 'Ana', email: 'ana@example.com', phone: '099123456', avatar: '', emailNotifications: true }
const professional = {
    description: 'Realizo instalaciones eléctricas.',
    workingLocation: 'Montevideo',
    serviceArea: null,
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

test('the service area is a change when its point or radius moves, or when it is chosen for the first time', () => {
    const area = { latitude: -34.9, longitude: -56.16, radiusKm: 10 }
    const saved = { ...professional, serviceArea: area }
    assert.equal(professionalChanged({ ...saved, serviceArea: { ...area } }, saved), false)
    assert.equal(professionalChanged({ ...saved, serviceArea: { ...area, radiusKm: 12 } }, saved), true)
    assert.equal(professionalChanged({ ...saved, serviceArea: { ...area, latitude: -34.8 } }, saved), true)
    assert.equal(professionalChanged({ ...professional, serviceArea: area }, professional), true)
})

test('a saved service area can be moved but not dropped by typing the zone by hand', () => {
    const saved = { ...professional, serviceArea: { latitude: -34.9, longitude: -56.16, radiusKm: 10 } }
    assert.match(validateProfessional({ ...saved, workingLocation: 'Pando', serviceArea: null }, saved), /mapa/)
    assert.equal(validateProfessional({ ...saved, serviceArea: { latitude: -34.78, longitude: -55.86, radiusKm: 5 } }, saved), '')
    // Profiles from before it existed still save without one.
    assert.equal(validateProfessional({ ...professional, workingLocation: 'Pando' }, professional), '')
})

test('publication requires a description and a trade with valid hourly rates', () => {
    assert.equal(validateProfessional({ ...professional, published: true }, professional), '')
    assert.match(validateProfessional({ ...professional, published: true, trades: [] }, professional), /oficio/)
    assert.match(validateProfessional({ ...professional, workingLocation: '' }, professional), /ubicación/)
    assert.match(validateProfessional({ ...professional, trades: [{ ...professional.trades[0], maximumHourlyWage: '500' }] }, professional), /tarifas/)
})

test('new and existing trades reject zero, negative, empty and non-finite hourly rates', () => {
    for (const id of [null, 1]) {
        for (const field of ['minimumHourlyWage', 'maximumHourlyWage']) {
            for (const value of ['0', '0.00', '-1', '-0.01', '', ' ', 'NaN', 'Infinity']) {
                const trade = { ...professional.trades[0], id, [field]: value }
                assert.match(validateProfessional({ ...professional, trades: [trade] }, professional), /mayores a \$0/, `${id}:${field}=${value}`)
            }
        }
    }
})

test('positive decimal rates and equal bounds are valid, but an inverted range is not', () => {
    for (const [minimumHourlyWage, maximumHourlyWage] of [['0.01', '0.01'], ['0.01', '100'], ['350', '350']]) {
        const trade = { ...professional.trades[0], minimumHourlyWage, maximumHourlyWage }
        assert.equal(validateProfessional({ ...professional, trades: [trade] }, professional), '')
    }
    const trade = { ...professional.trades[0], minimumHourlyWage: '100', maximumHourlyWage: '99.99' }
    assert.match(validateProfessional({ ...professional, trades: [trade] }, professional), /máxima debe ser mayor o igual/)
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
    assert.match(validateSecurity({ current: 'old', password: 'short', confirmation: 'short' }), /15 caracteres/)
    assert.match(validateSecurity({ current: 'old', password: 'x'.repeat(129), confirmation: 'x'.repeat(129) }), /128 caracteres/)
    assert.match(validateSecurity({ current: 'old', password: 'una frase nueva larga', confirmation: 'otra frase distinta' }), /coinciden/)
    assert.match(validateSecurity({ current: 'una frase igual larga', password: 'una frase igual larga', confirmation: 'una frase igual larga' }), /diferente/)
    assert.equal(validateSecurity({ current: 'old-password', password: 'una frase nueva larga', confirmation: 'una frase nueva larga' }), '')
})
