import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyPayout, formatPayout, normalizeAccount, parsePayout, validatePayout, type PayoutData } from '../src/pages/EditProfile/payoutAccount.ts'

const bank = (bankName: string, account: string, branch = ''): PayoutData =>
    ({ ...emptyPayout, method: 'BANK', bank: bankName, account, branch, holder: 'Ana Pérez' })

test('each bank account is written in the format the interbank system asks for', () => {
    assert.equal(normalizeAccount(bank('BROU', '00123456700001')), '001234567-00001')
    assert.equal(normalizeAccount(bank('BROU', '1234567-1')), '001234567-00001')
    assert.equal(normalizeAccount(bank('BROU', '1234567')), null)
    assert.equal(normalizeAccount(bank('BROU', '0012345670000-1-2')), null)
    assert.equal(normalizeAccount(bank('Itaú', '12345')), '0012345')
    assert.equal(normalizeAccount(bank('Itaú', '12345678')), null)
    assert.equal(normalizeAccount(bank('Santander', '1234567', '70')), '0070-000001234567')
    assert.equal(normalizeAccount(bank('Santander', '1234567')), null)
    assert.equal(normalizeAccount(bank('Itaú', '12a45')), null)
    assert.equal(normalizeAccount({ ...bank('BBVA', ' CA 123/4 '), otherBank: true }), 'CA 123/4')
})

test('a payout is stored as "provider · account · holder" and read back the same', () => {
    const brou = bank('BROU', '001234567-00001')
    assert.equal(formatPayout(brou), 'BROU · 001234567-00001 · Ana Pérez')
    assert.deepEqual(parsePayout(formatPayout(brou)), brou)

    const santander = bank('Santander', '000001234567', '0070')
    assert.equal(formatPayout(santander), 'Santander · 0070-000001234567 · Ana Pérez')
    assert.deepEqual(parsePayout(formatPayout(santander)), santander)

    const other = { ...bank('BBVA', '123456'), otherBank: true }
    assert.deepEqual(parsePayout(formatPayout(other)), other)

    const mp = { ...emptyPayout, method: 'MERCADO_PAGO' as const, account: 'ana@correo.com', holder: 'Ana Pérez' }
    assert.equal(formatPayout(mp), 'Mercado Pago · ana@correo.com · Ana Pérez')
    assert.deepEqual(parsePayout(formatPayout(mp)), mp)

    assert.deepEqual(parsePayout(null), emptyPayout)
})

test('accounts saved before the bank list keep what they had', () => {
    assert.deepEqual(parsePayout('Itaú 123'), { ...emptyPayout, method: 'BANK', account: 'Itaú 123' })
})

test('a payout needs the bank, an account in its format and the holder; once saved it cannot be cleared', () => {
    const ok = bank('BROU', '001234567-00001')
    assert.equal(validatePayout(emptyPayout, emptyPayout), '')
    assert.equal(validatePayout(ok, emptyPayout), '')
    assert.match(validatePayout({ ...ok, bank: '' }, emptyPayout), /Elegí tu banco/)
    assert.match(validatePayout({ ...ok, bank: '', otherBank: true }, emptyPayout), /nombre del banco/)
    assert.match(validatePayout({ ...ok, account: '123' }, emptyPayout), /BROU no es válido. 14 dígitos/)
    assert.match(validatePayout({ ...ok, holder: ' ' }, emptyPayout), /titular/)
    assert.match(validatePayout({ ...emptyPayout, method: 'MERCADO_PAGO' }, emptyPayout), /Mercado Pago/)
    assert.match(validatePayout(emptyPayout, ok), /cobrar/)
})
