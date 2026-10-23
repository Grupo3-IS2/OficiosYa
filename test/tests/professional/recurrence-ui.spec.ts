import { expect, test, type Page } from '@playwright/test';
import { fakeJwt, mockChat } from '../support/ui';

const professionalId = 'recurrence-professional-id';

test('SCRUM-87: saving a weekday recurrence creates one availability per weekday', async ({ page }) => {
  const created: { startTimestamp: string; endTimestamp: string }[] = [];
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
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      created.push(body);
      return route.fulfill({ status: 201, json: {
        id: created.length, type: 'URGENT_AVAILABLE',
        startTimestamp: body.startTimestamp, endTimestamp: body.endTimestamp,
      } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/profile/edit');
  await page.getByRole('heading', { name: 'Horarios de atención' }).scrollIntoViewIfNeeded();

  const section = page.getByRole('region', { name: 'Horarios de atención' });
  await section.getByRole('button', { name: /./ }).first().click();
  const calendar = page.getByRole('dialog', { name: /.+/ });
  await calendar.locator('button.is-selected').click();
  // The time controls are custom clock pickers; the editor defaults to 09:00–18:00.
  await section.getByLabel('Repetir').selectOption('WEEKDAYS');
  await section.getByRole('button', { name: 'Agregar horario' }).click();

  await expect(section).toContainText('5 horarios agregados.');
  expect(created).toHaveLength(5);
  expect(created.map(item => new Date(item.startTimestamp).getDay()).sort()).toEqual([1, 2, 3, 4, 5]);
});
