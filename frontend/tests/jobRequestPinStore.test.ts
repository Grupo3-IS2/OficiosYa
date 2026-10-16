import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getJobRequestPin, saveJobRequestPin } from '../src/services/jobRequestPinStore.ts'

class MemoryStorage {
    private readonly values = new Map<string, string>()

    getItem(key: string): string | null {
        return this.values.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value)
    }
}

describe('job request PIN storage', () => {
    it('keeps PINs isolated by client', () => {
        const storage = new MemoryStorage()

        saveJobRequestPin('client-a', 21, '482731', storage)

        assert.equal(getJobRequestPin('client-a', 21, storage), '482731')
        assert.equal(getJobRequestPin('client-b', 21, storage), null)
    })

    it('keeps PINs for more than one request', () => {
        const storage = new MemoryStorage()

        saveJobRequestPin('client-a', 21, '482731', storage)
        saveJobRequestPin('client-a', 22, '153904', storage)

        assert.equal(getJobRequestPin('client-a', 21, storage), '482731')
        assert.equal(getJobRequestPin('client-a', 22, storage), '153904')
    })

    it('recovers safely from malformed stored data', () => {
        const storage = new MemoryStorage()
        storage.setItem('oficiosya_job_request_pins:client-a', 'not-json')

        assert.equal(getJobRequestPin('client-a', 21, storage), null)

        saveJobRequestPin('client-a', 21, '482731', storage)
        assert.equal(getJobRequestPin('client-a', 21, storage), '482731')
    })

    it('does not turn a successful request into an error when storage is unavailable', () => {
        const storage = {
            getItem: () => null,
            setItem: () => { throw new Error('Storage unavailable') },
        }

        assert.doesNotThrow(() => saveJobRequestPin('client-a', 21, '482731', storage))
    })
})
