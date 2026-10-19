import { expect, test, type Page } from '@playwright/test';

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const TOKEN = 'header.eyJleHAiOjQxMDAwMDAwMDB9.signature';
const professionalId = '44444444-4444-4444-8444-444444444444';

function professional(published = false, description = '') {
  return {
    id: professionalId,
    name: 'Profesional UI',
    email: 'professional.ui@qa.test',
    profileImageUrl: null,
    role: 'PROFESSIONAL',
    createdAt: '2026-10-19T12:00:00Z',
    hasPassword: true,
    googleLinked: false,
    emailNotifications: true,
    phoneNumber: '099123456',
    workingLocation: 'Montevideo',
    description,
    published,
    expertiseTrades: [],
  };
}

async function prepareProfile(page: Page) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  let current = professional();
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON?.() ?? null;
    calls.push({ method: request.method(), url: url.pathname, body });

    if (url.pathname === '/api/v1/auth/verify') {
      return route.fulfill({ json: { verified: true } });
    }
    if (url.pathname === '/api/v1/users/me') {
      return route.fulfill({ json: current });
    }
    if (url.pathname === '/api/v1/trades') {
      return route.fulfill({ json: [{ id: 7, name: 'Plomería' }] });
    }
    if (url.pathname === '/api/v1/professionals/me' && request.method() === 'PATCH') {
      current = { ...current, ...(body as object) };
      return route.fulfill({ json: current });
    }
    if (url.pathname === '/api/v1/professionals/me/expertise-trades' && request.method() === 'POST') {
      const trade = body as { tradeId: number; minimumHourlyWage: number; maximumHourlyWage: number };
      current = {
        ...current,
        expertiseTrades: [{
          id: 17,
          tradeId: trade.tradeId,
          tradeName: 'Plomería',
          minimumHourlyWage: trade.minimumHourlyWage,
          maximumHourlyWage: trade.maximumHourlyWage,
        }],
      };
      return route.fulfill({ json: current });
    }
    if (url.pathname === '/api/v1/professionals/me/publish' && request.method() === 'POST') {
      current = { ...current, published: true };
      return route.fulfill({ json: current });
    }
    if (url.pathname === '/api/v1/professionals/me/unpublish' && request.method() === 'POST') {
      current = { ...current, published: false };
      return route.fulfill({ json: current });
    }
    if (url.pathname === '/api/v1/schedules') return route.fulfill({ json: [] });
    return route.fulfill({ json: current });
  });

  await page.addInitScript(token => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({
      id: professionalId,
      name: 'Profesional UI',
      email: 'professional.ui@qa.test',
      role: 'PROFESSIONAL',
    }));
  }, TOKEN);
  await page.goto(`${FRONTEND_BASE}/profile/edit`);
  await expect(page.getByRole('heading', { name: 'Perfil profesional' })).toBeVisible();
  return { calls, getCurrent: () => current };
}

test.describe('Perfil profesional desde la UI', () => {
  test('rechaza descripción corta y tarifas incompletas sin llamar al backend', async ({ page }) => {
    const { calls } = await prepareProfile(page);
    await page.locator('#profile-description').fill('Muy corto');
    await page.getByRole('button', { name: 'Guardar cambios' }).last().click();
    await expect(page.getByRole('alert')).toContainText('entre 20 y 500');
    expect(calls.filter(call => call.method === 'PATCH' || call.url.endsWith('/publish'))).toHaveLength(0);
  });

  test('agrega un oficio, guarda descripción/ubicación/tarifas y publica el perfil', async ({ page }) => {
    const { calls, getCurrent } = await prepareProfile(page);
    await page.locator('#profile-description').fill('Realizo instalaciones y reparaciones domiciliarias con experiencia.');
    await page.locator('#profile-working-location').fill('Cordón, Montevideo');
    await page.locator('#profile-trade-select').selectOption('7');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.getByLabel('Tarifa mínima por hora').fill('500');
    await page.getByLabel('Tarifa máxima por hora').fill('900');
    await page.getByRole('switch', { name: /Ofrecer mis servicios/ }).check();
    await page.getByRole('button', { name: 'Guardar cambios' }).last().click();

    await expect(page.locator('.profile-feedback')).toContainText('Perfil profesional actualizado.');
    expect(getCurrent()).toMatchObject({ published: true, workingLocation: 'Cordón, Montevideo' });
    expect(calls.some(call => call.url === '/api/v1/professionals/me/expertise-trades' && call.method === 'POST')).toBe(true);
    expect(calls.some(call => call.url === '/api/v1/professionals/me/publish' && call.method === 'POST')).toBe(true);
  });
});
