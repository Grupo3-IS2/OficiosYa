import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyScheduleDraft, quarterHourOptions, repeatedScheduleDates, scheduleDraftDates, scheduleDraftFrom } from '../src/pages/EditProfile/scheduleForm.ts'

test('a new schedule starts with the selected day and sensible work hours', () => {
    assert.deepEqual(emptyScheduleDraft(new Date(2030, 4, 6)), {
        date: '2030-05-06',
        startTime: '09:00',
        endTime: '18:00',
    })
})

test('date and time inputs become local dates only when the range is valid', () => {
    const dates = scheduleDraftDates({ date: '2030-05-06', startTime: '09:30', endTime: '12:15' })
    assert.ok(dates)
    assert.equal(dates.start.getFullYear(), 2030)
    assert.equal(dates.start.getMonth(), 4)
    assert.equal(dates.start.getDate(), 6)
    assert.equal(dates.start.getHours(), 9)
    assert.equal(dates.end.getMinutes(), 15)

    assert.equal(scheduleDraftDates({ date: '2030-05-06', startTime: '12:00', endTime: '12:00' }), null)
    assert.equal(scheduleDraftDates({ date: '2030-05-06', startTime: '09:10', endTime: '10:00' }), null)
    assert.equal(scheduleDraftDates({ date: '2030-02-31', startTime: '09:00', endTime: '10:00' }), null)
})

test('the time selectors cover the day in equal fifteen-minute blocks', () => {
    assert.equal(quarterHourOptions.length, 96)
    assert.deepEqual(quarterHourOptions.slice(0, 4), ['00:00', '00:15', '00:30', '00:45'])
    assert.deepEqual(quarterHourOptions.slice(-2), ['23:30', '23:45'])
})

test('an API schedule can be loaded back into the form in local time', () => {
    const start = new Date(2030, 4, 6, 9, 7)
    const end = new Date(2030, 4, 6, 11, 38)

    assert.deepEqual(scheduleDraftFrom(start.toISOString(), end.toISOString()), {
        date: '2030-05-06',
        startTime: '09:00',
        endTime: '11:45',
    })
})

test('weekly repetition fills Monday through Sunday, including days before the selected date', () => {
    const dates = repeatedScheduleDates({ date: '2030-05-08', startTime: '09:00', endTime: '10:00' }, 'WEEK')

    assert.equal(dates.length, 7)
    assert.equal(dates[0].start.getDate(), 6)
    assert.equal(dates.at(-1)?.start.getDate(), 12)
})

test('weekday repetition fills Monday through Friday of the selected week', () => {
    const dates = repeatedScheduleDates({ date: '2030-05-08', startTime: '09:00', endTime: '10:00' }, 'WEEKDAYS')

    assert.deepEqual(dates.map(item => item.start.getDate()), [6, 7, 8, 9, 10])
    assert.deepEqual(dates.map(item => item.start.getDay()), [1, 2, 3, 4, 5])
})

test('monthly and yearly repetition keep the selected weekday', () => {
    const draft = { date: '2030-05-08', startTime: '09:00', endTime: '10:00' }
    const month = repeatedScheduleDates(draft, 'MONTH_WEEKDAY')
    const year = repeatedScheduleDates(draft, 'YEAR_WEEKDAY')

    assert.deepEqual(month.map(item => item.start.getDate()), [8, 15, 22, 29])
    assert.ok(year.length > month.length)
    assert.ok(year.every(item => item.start.getDay() === month[0].start.getDay()))
    assert.ok(year.every(item => item.start.getFullYear() === 2030))
})
