import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    hasServiceRequestErrors,
    initialTradeId,
    validateServiceRequest,
} from '../src/pages/ProfessionalProfile/serviceRequestForm.ts'

test('uses the preferred trade only when the professional offers it', () => {
    assert.equal(initialTradeId([1, 2], 2), 2)
    assert.equal(initialTradeId([1, 2], 9), 1)
    assert.equal(initialTradeId([1, 2], null), 1)
    assert.equal(initialTradeId([], 2), 0)
})

test('requires location, a positive amount and complete tasks', () => {
    const errors = validateServiceRequest({
        location: '   ',
        paymentAmount: '0',
        tasks: [{ id: 1, tradeId: 0, description: '   ' }],
    })

    assert.match(errors.location ?? '', /ubicación/)
    assert.match(errors.paymentAmount ?? '', /mayor a 0/)
    assert.match(errors.taskErrors[0]?.tradeId ?? '', /oficio/)
    assert.match(errors.taskErrors[0]?.description ?? '', /trabajo/)
    assert.equal(hasServiceRequestErrors(errors), true)
})

test('accepts several complete tasks and trims are left to payload creation', () => {
    const errors = validateServiceRequest({
        location: ' Pocitos ',
        paymentAmount: '8000',
        tasks: [
            { id: 1, tradeId: 1, description: ' Reparar la canilla ' },
            { id: 2, tradeId: 2, description: 'Revisar otra instalación' },
        ],
    })

    assert.equal(hasServiceRequestErrors(errors), false)
    assert.deepEqual(errors.taskErrors, [{}, {}])
})
