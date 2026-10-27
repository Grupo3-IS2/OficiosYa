import { test, expect } from '@playwright/test';
import { fakeJwt, mockChat, mockVerifiedSession } from '../support/ui';

for (const session of ['guest', 'authenticated', 'expired'] as const) {
  test(`home cards ${session === 'authenticated' ? 'show' : 'hide'} the location for ${session} users`, async ({ page }) => {
    if (session !== 'guest') {
      await page.addInitScript(token => {
        localStorage.setItem('oficiosya_token', token);
        localStorage.setItem('oficiosya_user', JSON.stringify({ id: 'client-id', name: 'Cliente QA', email: 'client@qa.test', role: 'CLIENT' }));
      }, fakeJwt(session === 'expired' ? -60 : 3600));
    }
    await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: { error: 'La sesión expiró' } }));
    // Startup now verifies the session even on Home; this UI test uses an unsigned fixture token.
    await page.route('**/api/v1/auth/verify', route => route.fulfill({ json: { verified: true } }));
    // The header asks for the user's requests (the "Mis solicitudes" alert): the fake token would be refused
    await mockChat(page);
    await page.route('**/api/v1/job-requests/mine', route => route.fulfill({ json: [] }));
    await page.route('**/api/v1/trades', route => route.fulfill({ json: [] }));
    await page.route('**/api/v1/professionals/search**', route => route.fulfill({ json: {
      totalPages: 1,
      content: [{
        id: 'professional-id', name: 'Profesional Privacidad', profileImageUrl: null,
        workingLocation: 'Dirección privada 123', description: 'Servicio de prueba', rating: null,
        expertiseTrades: [{ id: 1, tradeId: 1, tradeName: 'Electricista', minimumHourlyWage: 350, maximumHourlyWage: 600 }],
      }],
    } }));
    await page.route('**/api/v1/schedules**', route => route.fulfill({ json: [] }));
    await page.goto('/');
    const card = page.locator('.professional-card');
    await expect(card.getByRole('heading', { name: 'Profesional Privacidad' })).toBeVisible();
    if (session === 'authenticated') {
      await expect(card.getByText('Dirección privada 123', { exact: true })).toBeVisible();
    } else {
      await expect(card.getByText('Dirección privada 123', { exact: true })).toHaveCount(0);
    }
    await expect(card.getByRole('button', { name: 'Ver perfil' })).toBeVisible();
  });
}

test('the own professional card opens the same profile as Panel profesional without self-contact actions', async ({ page }) => {
  const id = '33333333-3333-3333-3333-333333333333';
  const professional = { id, name: 'Mi perfil profesional', profileImageUrl: null, workingLocation: '',
    description: 'Instalaciones eléctricas para el hogar.', rating: null,
    expertiseTrades: [{ id: 1, tradeId: 1, tradeName: 'Electricista', minimumHourlyWage: 350, maximumHourlyWage: 600 }] };
  await mockVerifiedSession(page, { name: professional.name, email: 'own@qa.test', role: 'PROFESSIONAL' });
  await page.addInitScript(({ id, token }) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id, name: 'Mi perfil profesional', role: 'PROFESSIONAL' }));
  }, { id, token: fakeJwt() });
  await page.route('**/api/v1/professionals/search**', route => route.fulfill({ json: { content: [professional], totalPages: 1 } }));
  await page.route(`**/api/v1/professionals/${id}`, route => route.fulfill({ json: professional }));
  await page.route(`**/api/v1/professionals/${id}/reviews?**`, route => route.fulfill({ json: { content: [], number: 0, totalElements: 0, last: true } }));
  await page.route('**/api/v1/schedules?**', route => route.fulfill({ json: [] }));
  let selfChats = 0;
  await page.route('**/api/v1/conversations', route => {
    if (route.request().method() === 'POST') selfChats++;
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Panel profesional', exact: true }).click();
  await expect(page.getByRole('heading', { name: professional.name, exact: true })).toBeVisible();
  const panelUrl = page.url();
  await page.goto('/');
  await page.getByRole('button', { name: 'Ir a panel profesional', exact: true }).click();
  await expect(page).toHaveURL(panelUrl);
  await expect(page.getByRole('heading', { name: professional.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Hablar por chat/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Solicitar servicio', exact: true })).toHaveCount(0);
  expect(selfChats).toBe(0);
});
