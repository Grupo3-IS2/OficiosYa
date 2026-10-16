import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTerms } from '../src/pages/Terms/termsText.ts'

test('the first lines are the title and the date, and numbered lines start sections', () => {
    const terms = parseTerms('\nTérminos\nÚltima actualización: hoy\n\nIntro uno\nsigue la intro\n\n1. Cuentas\nTexto de cuentas.\n2) Pagos\nTexto de pagos.\r\n')
    assert.equal(terms.title, 'Términos')
    assert.equal(terms.subtitle, 'Última actualización: hoy')
    assert.deepEqual(terms.blocks, [
        { kind: 'paragraph', text: 'Intro uno sigue la intro' },
        { kind: 'heading', text: '1. Cuentas' },
        { kind: 'paragraph', text: 'Texto de cuentas.' },
        { kind: 'heading', text: '2) Pagos' },
        { kind: 'paragraph', text: 'Texto de pagos.' },
    ])
})

test('without a date line the text starts right after the title', () => {
    const terms = parseTerms('Términos\n\nUn párrafo.')
    assert.equal(terms.subtitle, '')
    assert.deepEqual(terms.blocks, [{ kind: 'paragraph', text: 'Un párrafo.' }])
})

test('an empty file gives empty terms', () => {
    assert.deepEqual(parseTerms(''), { title: '', subtitle: '', blocks: [] })
})
