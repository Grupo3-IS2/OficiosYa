import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  startClientRegistration,
  startProfessionalRegistration
} from '../support/registration';

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const PASSWORD = 'ClaveSegura2026!';

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

async function registerClient(request: APIRequestContext) {
  const email = uniqueEmail('logout.real.client');
  const started = await startClientRegistration(request, {
    name: 'Cliente Logout Real',
    email,
    password: PASSWORD
  });
  expect(started.status()).toBe(202);
  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  return { email, auth: await verified.json() };
}

async function registerProfessional(request: APIRequestContext) {
  const email = uniqueEmail('logout.real.professional');
  const started = await startProfessionalRegistration(request, {
    name: 'Profesional Logout Real',
    email,
    password: PASSWORD,
    phoneNumber: '099123456',
    workingLocation: 'Montevideo'
  });
  expect(started.status()).toBe(202);
  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  return { email, auth: await verified.json() };
}

async function loginThroughUi(page: Page, email: string) {
  await page.goto(`${FRONTEND_BASE}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.profile-menu__trigger')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('oficiosya_token'));
  expect(token).toBeTruthy();
  return token!;
}

async function logoutThroughUi(page: Page) {
  await page.locator('.profile-menu__trigger').click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.profile-menu__trigger')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /iniciar sesión/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('oficiosya_token'),
    user: localStorage.getItem('oficiosya_user'),
    profile: localStorage.getItem('oficiosya_profile')
  }))).toEqual({ token: null, user: null, profile: null });
}

test.describe('Sesión real: logout, navegación e intercambio entre pestañas', () => {
  test('el logout desde UI de cliente limpia el frontend y revoca el token real', async ({ page, request }) => {
    const { email } = await registerClient(request);
    const token = await loginThroughUi(page, email);

    const beforeLogout = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(beforeLogout.status()).toBe(200);

    await logoutThroughUi(page);

    const afterLogout = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(afterLogout.status()).toBe(401);
  });

  test('el logout desde UI de profesional limpia el frontend y revoca el token real', async ({ page, request }) => {
    const { email, auth } = await registerProfessional(request);
    const token = await loginThroughUi(page, email);

    const beforeLogout = await request.get(`${API_BASE}/api/v1/professionals/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(beforeLogout.status()).toBe(200);
    expect((await beforeLogout.json()).id).toBe(auth.id);

    await logoutThroughUi(page);

    const afterLogout = await request.get(`${API_BASE}/api/v1/professionals/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(afterLogout.status()).toBe(401);
  });

  test('volver atrás después del logout no vuelve a mostrar el perfil protegido', async ({ page, request }) => {
    const { email } = await registerClient(request);
    await loginThroughUi(page, email);

    await page.locator('.profile-menu__trigger').click();
    await page.getByRole('menuitem', { name: 'Editar perfil' }).click();
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();

    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await expect(page).toHaveURL(/\/$/);
    await logoutThroughUi(page);

    await page.goBack();
    await expect(page).toHaveURL(/\/login(?:\?expired=1)?$/);
    await expect(page.getByRole('heading', { name: '¡Bienvenido de nuevo!' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar perfil' })).toHaveCount(0);
  });

  test('cerrar sesión en una pestaña actualiza la otra y bloquea la ruta protegida', async ({ page, context, request }) => {
    const { email } = await registerClient(request);
    const token = await loginThroughUi(page, email);
    const secondPage = await context.newPage();
    await secondPage.goto(FRONTEND_BASE);
    await expect(secondPage.locator('.profile-menu__trigger')).toBeVisible();

    await logoutThroughUi(page);

    await expect(secondPage).toHaveURL(/\/login(?:\?expired=1)?$/);
    await expect(secondPage.locator('.profile-menu__trigger')).toHaveCount(0);
    await secondPage.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(secondPage).toHaveURL(/\/login(?:\?expired=1)?$/);

    const protectedResponse = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(protectedResponse.status()).toBe(401);
  });
});