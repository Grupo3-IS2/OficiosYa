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
        date: '2030-05-06',
        startTime: '09:00',
        endTime: '11:00',
        paymentAmount: '2500',
        tasks: [{ id: 1, tradeId: 4, description: 'Reparar la pérdida de agua.' }],
    }
}

test('uses the selected professional trade as the first task', () => {
    assert.equal(initialTradeId([2, 4, 7], 4), 4)
})

test('without a trade chosen, the only one there is, or none so the client picks it', () => {
    assert.equal(initialTradeId([4], null), 4)
    assert.equal(initialTradeId([2, 4, 7], null), 0)
    // A trade the professional no longer offers counts as none chosen
    assert.equal(initialTradeId([2, 4, 7], 9), 0)
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
        date: '',
        startTime: '',
        endTime: '',
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

test('requires a future timeframe that ends after it starts', () => {
    const now = new Date('2030-05-06T10:00')

    assert.equal(validateServiceRequest({ ...validForm(), startTime: '12:00', endTime: '11:00' }, now).timeframe,
        'La hora de fin tiene que ser posterior a la de inicio.')
    assert.equal(validateServiceRequest(validForm(), now).timeframe, 'El horario tiene que ser en el futuro.')
})

test('the recommended timeframe is optional, but a half-filled one is not', () => {
    const blank = validateServiceRequest({ ...validForm(), date: '', startTime: '', endTime: '' })
    assert.equal(blank.timeframe, undefined)
    assert.equal(hasServiceRequestErrors(blank), false)

    assert.equal(validateServiceRequest({ ...validForm(), endTime: '' }).timeframe, 'Elegí la fecha y el horario.')
})
