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

/** The edit page of a professional, or of a client who can become one (`asClient`). */
async function prepareProfile(page: Page, asClient = false) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  let current: ReturnType<typeof professional> = asClient
    ? { ...professional(), role: 'CLIENT', phoneNumber: '', workingLocation: '' }
    : professional();
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
    if (url.pathname === '/api/v1/professionals/me' && request.method() === 'POST') {
      current = { ...professional(), ...(body as object) };
      return route.fulfill({ status: 201, json: current });
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
    // What the header asks for on the become-professional page
    if (url.pathname === '/api/v1/conversations/unread-count') return route.fulfill({ json: { count: 0 } });
    if (url.pathname === '/api/v1/job-requests/mine') return route.fulfill({ json: [] });
    if (url.pathname === '/api/v1/conversations') return route.fulfill({ json: [] });
    return route.fulfill({ json: current });
  });

  await page.routeWebSocket('**/ws/chat', () => {});
  await page.addInitScript(({ token, professionalId, role }) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({
      id: professionalId,
      name: 'Profesional UI',
      email: 'professional.ui@qa.test',
      role,
    }));
  }, { token: TOKEN, professionalId, role: current.role });
  await page.goto(`${FRONTEND_BASE}/profile/edit`);
  await expect(page.getByRole('heading', { name: asClient ? '¿Quieres ofrecer tus servicios en OficiosYa?' : 'Perfil profesional' })).toBeVisible();
  return { calls, getCurrent: () => current };
}

test.describe('Perfil profesional desde la UI', () => {
  test('un cliente se convierte en profesional y ve las secciones para completar su perfil', async ({ page }) => {
    const { calls } = await prepareProfile(page, true);
    await page.getByRole('button', { name: 'Quiero ofrecer mis servicios' }).click();
    await expect(page).toHaveURL(/\/convertirse-en-profesional$/);
    await page.getByLabel('Número de teléfono').fill('099 123 456');
    await page.getByLabel('Ubicación').fill('  Cordón, Montevideo  ');
    await page.getByRole('button', { name: 'Activar perfil profesional' }).click();

    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.getByRole('heading', { name: 'Perfil profesional' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '¿Quieres ofrecer tus servicios en OficiosYa?' })).toHaveCount(0);
    const sent = calls.find(call => call.url === '/api/v1/professionals/me' && call.method === 'POST');
    expect(sent?.body).toMatchObject({ workingLocation: 'Cordón, Montevideo' });
    expect((sent?.body as { phoneNumber: string }).phoneNumber).toMatch(/99123456$/);
  });

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
