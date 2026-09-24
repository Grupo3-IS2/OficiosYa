import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    formatCountdown,
    isCodeComplete,
    normalizeCode,
    secondsUntil,
} from '../src/pages/Register/verificationCode.ts'

test('the code field keeps only digits, up to the code length', () => {
    assert.equal(normalizeCode('12a 3-4', 6), '1234')
    assert.equal(normalizeCode('1234567890', 6), '123456')
    assert.equal(normalizeCode('', 6), '')
})

test('a pasted code with spaces or dashes is cleaned up', () => {
    assert.equal(normalizeCode(' 123 456 ', 6), '123456')
    assert.equal(normalizeCode('123-456', 6), '123456')
})

test('the code is complete only with every digit', () => {
    assert.equal(isCodeComplete('123456', 6), true)
    assert.equal(isCodeComplete('12345', 6), false)
    assert.equal(isCodeComplete('1234567', 6), false)
    assert.equal(isCodeComplete('12345a', 6), false)
    assert.equal(isCodeComplete('1234', 4), true)
})

test('the countdown rounds up and never goes below zero', () => {
    assert.equal(secondsUntil(10_000, 0), 10)
    assert.equal(secondsUntil(10_000, 9_001), 1)
    assert.equal(secondsUntil(10_000, 10_000), 0)
    assert.equal(secondsUntil(10_000, 12_000), 0)
})

test('the countdown reads as minutes and seconds', () => {
    assert.equal(formatCountdown(75), '1:15')
    assert.equal(formatCountdown(60), '1:00')
    assert.equal(formatCountdown(5), '0:05')
    assert.equal(formatCountdown(0), '0:00')
})
