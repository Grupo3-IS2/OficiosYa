import { test, expect } from '@playwright/test';
import { fakeJwt, mockChat } from '../support/ui';

for (const session of ['guest', 'authenticated', 'expired'] as const) {
  test(`home cards ${session === 'authenticated' ? 'show' : 'hide'} the location for ${session} users`, async ({ page }) => {
    if (session !== 'guest') {
      await page.addInitScript(token => {
        localStorage.setItem('oficiosya_token', token);
        localStorage.setItem('oficiosya_user', JSON.stringify({ id: 'client-id', name: 'Cliente QA', email: 'client@qa.test', role: 'CLIENT' }));
      }, fakeJwt(session === 'expired' ? -60 : 3600));
    }
    await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: { error: 'La sesión expiró' } }));
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
