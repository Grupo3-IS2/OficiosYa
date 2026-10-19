import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTokenExpiration, isTokenUsable } from '../src/services/session.ts'

function createFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fakesignature`
}

describe('session token validation helpers', () => {
  it('extracts expiration time in milliseconds from a valid JWT', () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 3600
    const token = createFakeJwt({ sub: 'user-123', exp: expSeconds })

    const expiration = getTokenExpiration(token)
    assert.equal(expiration, expSeconds * 1000)
  })

  it('returns null when payload has no exp claim', () => {
    const token = createFakeJwt({ sub: 'user-123' })
    assert.equal(getTokenExpiration(token), null)
  })

  it('returns null for malformed tokens', () => {
    assert.equal(getTokenExpiration(''), null)
    assert.equal(getTokenExpiration('not-a-jwt'), null)
    assert.equal(getTokenExpiration('invalid.payload-not-base64.signature'), null)
  })

  it('considers future tokens usable', () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 120
    const token = createFakeJwt({ exp: expSeconds })
    assert.equal(isTokenUsable(token), true)
  })

  it('considers expired tokens unusable', () => {
    const expSeconds = Math.floor(Date.now() / 1000) - 60
    const token = createFakeJwt({ exp: expSeconds })
    assert.equal(isTokenUsable(token), false)
  })

  it('considers null or empty tokens unusable', () => {
    assert.equal(isTokenUsable(null), false)
    assert.equal(isTokenUsable(''), false)
  })
})
