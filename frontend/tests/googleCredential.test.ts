import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailFromCredential, handOverGoogleSignup, profileFromCredential, takeGoogleSignup } from '../src/services/googleCredential.ts'

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

test('the name and expiry are read too, for filling in the sign-up form', () => {
    assert.deepEqual(profileFromCredential(credentialWith({ email: 'ana@example.com', name: ' Ana Pérez ', exp: 1_700_000_000 })),
        { email: 'ana@example.com', name: 'Ana Pérez', expiresAt: 1_700_000_000_000 })
    assert.deepEqual(profileFromCredential(credentialWith({ email: 'ana@example.com' })), { email: 'ana@example.com', name: '', expiresAt: null })
    assert.equal(profileFromCredential('not-a-token'), null)
})

test('handing over Google token to signup stores and takes it once', () => {
    const memory = new Map<string, string>()
    const originalSessionStorage = globalThis.sessionStorage
    globalThis.sessionStorage = {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
        clear: () => memory.clear(),
        key: () => null,
        length: memory.size,
    } as unknown as Storage

    try {
        const dummyToken = 'header.payload.signature'
        handOverGoogleSignup(dummyToken)
        assert.equal(takeGoogleSignup(), dummyToken)
        assert.equal(takeGoogleSignup(), null)
    } finally {
        globalThis.sessionStorage = originalSessionStorage
    }
})
