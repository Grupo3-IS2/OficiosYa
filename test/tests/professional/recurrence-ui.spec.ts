import { expect, test, type Page } from '@playwright/test';
import { fakeJwt, mockChat } from '../support/ui';

const professionalId = 'recurrence-professional-id';

/** Next Monday, in the browser's time zone (the same as this process). */
function nextMonday(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((8 - today.getDay()) % 7 || 7));
}

function dateInput(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

async function openSchedule(page: Page) {
  const created: Record<string, unknown>[] = [];
  await page.addInitScript(({ token, professionalId }) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({
      id: professionalId, name: 'Profesional Agenda', email: 'agenda@qa.test', role: 'PROFESSIONAL',
    }));
  }, { token: fakeJwt(), professionalId });
  await mockChat(page);
  await page.route('**/api/v1/auth/verify', route => route.fulfill({ json: { verified: true } }));
  await page.route('**/api/v1/users/me', route => route.fulfill({ json: {
    id: professionalId, name: 'Profesional Agenda', email: 'agenda@qa.test', role: 'PROFESSIONAL',
    phoneNumber: '099123456', profileImageUrl: null, workingLocation: 'Montevideo',
    description: 'Una descripción suficientemente larga para el perfil profesional.',
    published: false, expertiseTrades: [], emailNotifications: true,
  } }));
  await page.route('**/api/v1/trades', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/professionals/me', route => route.fulfill({ json: {
    id: professionalId, name: 'Profesional Agenda', email: 'agenda@qa.test', role: 'PROFESSIONAL',
    phoneNumber: '099123456', profileImageUrl: null, workingLocation: 'Montevideo',
    description: '', published: false, expertiseTrades: [],
  } }));
  await page.route('**/api/v1/schedules?**', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/schedules', async route => {
    const body = route.request().postDataJSON();
    created.push(body);
    return route.fulfill({ status: 201, json: {
      id: created.length, professionalId, jobRequestId: null, type: body.type,
      startTimestamp: body.startTimestamp, endTimestamp: body.endTimestamp,
      rrule: body.rrule ?? null, tzid: body.tzid ?? null, exdates: [], recurrenceEnd: null,
    } });
  });
  await page.goto('/profile/edit');
  const section = page.getByRole('region', { name: 'Horarios de atención' });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('status').filter({ hasText: 'Cargando horarios' })).toHaveCount(0);
  return { section, created };
}

test('SCRUM-87: the + button adds a schedule that repeats every week', async ({ page }) => {
  const { section, created } = await openSchedule(page);
  const monday = nextMonday();

  await section.getByTitle('Agregar horario').click();
  const form = page.getByRole('dialog', { name: 'Agregar horario' });
  await form.getByLabel('Día').fill(dateInput(monday));
  await form.getByLabel('Desde').fill('10:00');
  await form.getByLabel('Hasta').fill('14:00');
  await form.getByRole('switch', { name: /Se repite todos los lunes/ }).check({ force: true });
  await form.getByRole('button', { name: 'Agregar', exact: true }).click();

  await expect(section).toContainText('Listo: vas a figurar disponible todos los lunes de 10:00 a 14:00.');
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ type: 'URGENT_AVAILABLE', rrule: 'FREQ=WEEKLY' });
  expect(new Date(String(created[0].startTimestamp))).toEqual(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 10));
  expect(new Date(String(created[0].endTimestamp))).toEqual(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 14));
});

test('SCRUM-87: without turning on the repetition, the schedule is only for that day', async ({ page }) => {
  const { section, created } = await openSchedule(page);
  const monday = nextMonday();

  await section.getByTitle('Agregar horario').click();
  const form = page.getByRole('dialog', { name: 'Agregar horario' });
  await form.getByLabel('Día').fill(dateInput(monday));
  await form.getByLabel('Desde').fill('10:00');
  await form.getByLabel('Hasta').fill('14:00');
  await form.getByRole('button', { name: 'Agregar', exact: true }).click();

  await expect(section).toContainText('Horario agregado.');
  expect(created).toHaveLength(1);
  expect(created[0].rrule).toBeUndefined();
});
