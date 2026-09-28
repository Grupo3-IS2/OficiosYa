import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailFromCredential } from '../src/services/googleCredential.ts'

function credentialWith(payload: object): string {
    const encode = (value: string) => Buffer.from(value).toString('base64url')
    return `${encode('{"alg":"RS256"}')}.${encode(JSON.stringify(payload))}.${encode('signature')}`
}

test('the email is read from the token payload', () => {
    assert.equal(emailFromCredential(credentialWith({ email: 'ana@example.com', sub: '1' })), 'ana@example.com')
})

test('accented characters survive the decoding', () => {
    assert.equal(emailFromCredential(credentialWith({ email: 'ñandú@example.com' })), 'ñandú@example.com')
})

test('a token without a usable email gives null', () => {
    assert.equal(emailFromCredential(credentialWith({ sub: '1' })), null)
    assert.equal(emailFromCredential(credentialWith({ email: '' })), null)
    assert.equal(emailFromCredential(credentialWith({ email: 42 })), null)
})

test('something that is not a token gives null instead of throwing', () => {
    assert.equal(emailFromCredential(''), null)
    assert.equal(emailFromCredential('not-a-token'), null)
    assert.equal(emailFromCredential('a.%%%.c'), null)
    assert.equal(emailFromCredential('a.bm90LWpzb24.c'), null)
})
