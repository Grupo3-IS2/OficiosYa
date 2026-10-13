import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    hasServiceRequestErrors,
    initialTradeId,
    validateServiceRequest,
    type ServiceRequestFormValue,
} from '../src/pages/ProfessionalProfile/serviceRequestForm.ts'

function validForm(): ServiceRequestFormValue {
    return {
        location: 'Av. Italia 1234',
        paymentAmount: '2500',
        tasks: [{ id: 1, tradeId: 4, description: 'Reparar la pérdida de agua.' }],
    }
}

test('uses the selected professional trade as the first task', () => {
    assert.equal(initialTradeId([2, 4, 7], 4), 4)
    assert.equal(initialTradeId([2, 4, 7], 9), 2)
    assert.equal(initialTradeId([], null), 0)
})

test('accepts zero because the backend contract is positive-or-zero', () => {
    const errors = validateServiceRequest({ ...validForm(), paymentAmount: '0' })

    assert.equal(errors.paymentAmount, undefined)
    assert.equal(hasServiceRequestErrors(errors), false)
})

test('rejects missing fields, a negative amount and incomplete tasks', () => {
    const errors = validateServiceRequest({
        location: '   ',
        paymentAmount: '-1',
        tasks: [{ id: 1, tradeId: 0, description: '  ' }],
    })

    assert.equal(errors.location, 'Ingresá la dirección o ubicación.')
    assert.equal(errors.paymentAmount, 'El monto no puede ser negativo.')
    assert.equal(errors.taskErrors[0]?.tradeId, 'Seleccioná un oficio.')
    assert.equal(errors.taskErrors[0]?.description, 'Describí el trabajo a realizar.')
    assert.equal(hasServiceRequestErrors(errors), true)
})

test('requires at least one task', () => {
    const errors = validateServiceRequest({ ...validForm(), tasks: [] })

    assert.equal(errors.tasks, 'Agregá al menos una tarea.')
    assert.equal(hasServiceRequestErrors(errors), true)
})
