import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flagUrl, getCountryCodes, parseCountryCodes } from '../src/services/countryCodes.ts'

const country = (cca2: string, spa: string, root: string, suffixes: string[]) =>
    ({ cca2, name: { common: spa }, translations: { spa: { common: spa } }, idd: { root, suffixes } })

test('the prefix joins root and suffix, and area codes under +1 or +7 are left out', () => {
    const parsed = parseCountryCodes([
        country('UY', 'Uruguay', '+5', ['98']),
        country('US', 'Estados Unidos', '+1', ['201', '202']),
        country('RU', 'Rusia', '+7', ['3', '4', '9']),
        country('VA', 'Ciudad del Vaticano', '+3', ['906698', '79']),
        country('AX', 'Alandia', '+3', ['5818']),
        country('AG', 'Antigua y Barbuda', '+1', ['268']),
    ])
    assert.deepEqual(parsed.map(item => [item.iso, item.dial]),
        [['ax', '+358'], ['ag', '+1268'], ['va', '+379'], ['us', '+1'], ['ru', '+7'], ['uy', '+598']])
})
test('countries without a prefix, and malformed entries, are left out; names are sorted in Spanish', () => {
    const parsed = parseCountryCodes([
        country('AQ', 'Antártida', '', []),
        { cca2: 'XX' },
        'nonsense',
        country('PE', 'Perú', '+5', ['1']),
        country('AR', 'Argentina', '+5', ['4']),
    ])
    assert.deepEqual(parsed.map(item => item.name), ['Argentina', 'Perú'])
    assert.deepEqual(parseCountryCodes({ not: 'a list' }), [])
})

test('a failed or empty answer is an error, so the page falls back to writing the prefix by hand', async () => {
    const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
    await assert.rejects(getCountryCodes(answer(503, {})))
    await assert.rejects(getCountryCodes(answer(200, [])))
    assert.equal((await getCountryCodes(answer(200, [country('UY', 'Uruguay', '+5', ['98'])])))[0].dial, '+598')
})

test('flagUrl builds the SVG flag link for the ISO code', () => {
    assert.equal(flagUrl('uy'), 'https://flagcdn.com/uy.svg')
    assert.equal(flagUrl('ar'), 'https://flagcdn.com/ar.svg')
})
