import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  startClientRegistration,
  startProfessionalRegistration
} from '../support/registration';
import { blockExternalMaps, blockGoogleIdentity } from '../support/ui';

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const PASSWORD = 'ClaveSegura2026!';

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

async function registerClient(request: APIRequestContext) {
  const email = uniqueEmail('auth.ui.client');
  const started = await startClientRegistration(request, {
    name: 'Cliente Login UI',
    email,
    password: PASSWORD
  });
  expect(started.status()).toBe(202);
  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  return { email, auth: await verified.json() };
}

async function registerProfessional(request: APIRequestContext) {
  const email = uniqueEmail('auth.ui.professional');
  const started = await startProfessionalRegistration(request, {
    name: 'Profesional Login UI',
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
  await expect(page).toHaveURL(`${FRONTEND_BASE}/`);
  await expect(page.locator('.profile-menu__trigger')).toBeVisible();
  const session = await page.evaluate(() => ({
    user: JSON.parse(localStorage.getItem('oficiosya_user') ?? 'null'),
    token: localStorage.getItem('oficiosya_token')
  }));
  expect(session.token).toBeTruthy();
  return session;
}

async function mockProfessionalRegistration(page: Page) {
  const sent: { body: Record<string, unknown> | null } = { body: null };
  await page.route('**/api/v1/auth/register-professional', async (route) => {
    sent.body = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { email: 'x@qa.test', verificationRequired: true, expiresInSeconds: 600 } });
  });
  return sent;
}

async function openProfessionalRegistration(page: Page) {
  await page.goto(`${FRONTEND_BASE}/register`);
  await page.locator('.account-type').nth(1).click();
}

async function fillProfessionalRegistration(page: Page, phone: string) {
  await page.locator('#register-name').fill('Profesional Del Exterior');
  await page.locator('#register-email').fill(uniqueEmail('professional.country.ui'));
  await page.locator('#register-phone').fill(phone);
  await page.locator('#register-location').fill('Montevideo');
  await page.locator('#register-password').fill(PASSWORD);
  await page.locator('#register-confirmation').fill(PASSWORD);
  await page.locator('.terms input').check();
  await page.locator('form button[type="submit"]').click();
}

test.describe('Registro y login: validaciones visuales y roles', () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleIdentity(page);
    await blockExternalMaps(page);
  });

  test('registro con campos vacíos marca los campos requeridos y no envía la solicitud', async ({ page }) => {
    let registrationCalls = 0;
    await page.route('**/api/v1/auth/register-client', (route) => { registrationCalls++; return route.abort(); });
    await page.route('**/api/v1/auth/register-professional', (route) => { registrationCalls++; return route.abort(); });
    await page.goto(`${FRONTEND_BASE}/register`);

    await page.locator('form button[type="submit"]').click();

    for (const field of ['#register-name', '#register-email', '#register-password', '#register-confirmation']) {
      expect(await page.locator(field).evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBeTruthy();
      expect(await page.locator(field).evaluate((element: HTMLInputElement) => element.validationMessage)).not.toBe('');
    }
    expect(registrationCalls).toBe(0);
  });

  test('sin elegir explícitamente otro rol, el formulario usa Cliente como opción predeterminada', async ({ page }) => {
    let clientPayload: Record<string, unknown> | null = null;
    let professionalCalls = 0;
    await page.route('**/api/v1/auth/register-client', async (route) => {
      clientPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'default.client@qa.test', verificationRequired: true, message: 'OK', codeLength: 6, expiresInSeconds: 900, resendCooldownSeconds: 60 })
      });
    });
    await page.route('**/api/v1/auth/register-professional', (route) => { professionalCalls++; return route.abort(); });
    await page.goto(`${FRONTEND_BASE}/register`);

    await expect(page.locator('.account-type').nth(0)).toHaveClass(/is-selected/);
    await expect(page.locator('.account-type').nth(1)).not.toHaveClass(/is-selected/);
    await page.locator('#register-name').fill('Cliente Predeterminado');
    await page.locator('#register-email').fill('default.client@qa.test');
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible();
    expect(clientPayload).toMatchObject({ name: 'Cliente Predeterminado', email: 'default.client@qa.test' });
    expect(clientPayload).not.toHaveProperty('phoneNumber');
    expect(professionalCalls).toBe(0);
  });

  test('email mal formado muestra la validación del campo y no envía el registro', async ({ page }) => {
    let registrationCalls = 0;
    await page.route('**/api/v1/auth/register-client', (route) => { registrationCalls++; return route.abort(); });
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Cliente Email Inválido');
    await page.locator('#register-email').fill('correo-invalido');
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();

    await page.locator('form button[type="submit"]').click();

    expect(await page.locator('#register-email').evaluate((element: HTMLInputElement) => element.validity.typeMismatch)).toBeTruthy();
    expect(await page.locator('#register-email').evaluate((element: HTMLInputElement) => element.validationMessage)).not.toBe('');
    expect(registrationCalls).toBe(0);
  });

  test('teléfono profesional inválido muestra un error específico y no envía el registro', async ({ page }) => {
    let registrationCalls = 0;
    await page.route('**/api/v1/auth/register-professional', (route) => { registrationCalls++; return route.abort(); });
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('.account-type').nth(1).click();
    await page.locator('#register-name').fill('Profesional Teléfono Inválido');
    await page.locator('#register-email').fill(uniqueEmail('professional.phone.invalid.ui'));
    await page.locator('#register-phone').fill('123abc');
    await page.locator('#register-location').fill('Montevideo');
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();

    await page.locator('form button[type="submit"]').click();

    await expect(page.getByRole('alert')).toContainText('ingresá un número de teléfono válido');
    expect(registrationCalls).toBe(0);
  });

  test('el teléfono profesional se envía con el prefijo del país elegido en la lista', async ({ page }) => {
    const sent = await mockProfessionalRegistration(page);
    // The countries come from a public CDN: here, a short answer of the same shape.
    await page.route('https://cdn.jsdelivr.net/npm/world-countries@*/**', (route) => route.fulfill({ json: [
      { cca2: 'UY', name: { common: 'Uruguay' }, translations: { spa: { common: 'Uruguay' } }, idd: { root: '+5', suffixes: ['98'] } },
      { cca2: 'AR', name: { common: 'Argentina' }, translations: { spa: { common: 'Argentina' } }, idd: { root: '+5', suffixes: ['4'] } }
    ] }));
    await page.route('https://flagcdn.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await openProfessionalRegistration(page);

    const prefix = page.getByRole('button', { name: /^Código de país/ });
    await expect(prefix).toHaveAccessibleName('Código de país: +598');
    await prefix.click();
    await expect(page.getByRole('option').first()).toContainText('Uruguay');
    await page.getByLabel('Buscar país').fill('arg');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.getByRole('option', { name: /Argentina/ }).click();
    await expect(prefix).toHaveAccessibleName('Código de país: +54');

    await fillProfessionalRegistration(page, '11 2345 6789');
    await expect.poll(() => sent.body).not.toBeNull();
    expect(sent.body).toMatchObject({ phoneNumber: '+541123456789' });
  });

  test('si la lista de países no carga, el prefijo se escribe a mano', async ({ page }) => {
    const sent = await mockProfessionalRegistration(page);
    await page.route('https://cdn.jsdelivr.net/npm/world-countries@*/**', (route) => route.abort());
    await openProfessionalRegistration(page);

    const prefix = page.getByRole('textbox', { name: 'Código de país' });
    await expect(prefix).toHaveValue('+598');
    await prefix.fill('+56');

    await fillProfessionalRegistration(page, '9 1234 5678');
    await expect.poll(() => sent.body).not.toBeNull();
    expect(sent.body).toMatchObject({ phoneNumber: '+56912345678' });
  });

  test('login con campos vacíos marca email y contraseña como requeridos sin llamar al backend', async ({ page }) => {
    let loginCalls = 0;
    await page.route('**/api/v1/auth/login', (route) => { loginCalls++; return route.abort(); });
    await page.goto(`${FRONTEND_BASE}/login`);

    await page.locator('form button[type="submit"]').click();

    expect(await page.locator('#email').evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBeTruthy();
    expect(await page.locator('#password').evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBeTruthy();
    expect(loginCalls).toBe(0);
  });

  test('login real de cliente inicia sesión y permite consultar su perfil', async ({ page, request }) => {
    const { email } = await registerClient(request);
    const { user, token } = await loginThroughUi(page, email);

    expect(user.role).toBe('CLIENT');
    const profile = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(profile.status()).toBe(200);
    expect((await profile.json()).role).toBe('CLIENT');
  });

  test('login real de profesional inicia sesión con rol profesional y permite consultar su perfil', async ({ page, request }) => {
    const { email, auth } = await registerProfessional(request);
    const { user, token } = await loginThroughUi(page, email);

    expect(user.role).toBe('PROFESSIONAL');
    expect(user.id).toBe(auth.id);
    const profile = await request.get(`${API_BASE}/api/v1/professionals/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(profile.status()).toBe(200);
    expect((await profile.json()).id).toBe(auth.id);
  });
});
test.describe('Términos y condiciones', () => {
  test('el enlace del registro abre los términos en otra pestaña, leídos del archivo de texto', async ({ page, context }) => {
    await blockGoogleIdentity(page);
    await page.goto(`${FRONTEND_BASE}/register`);

    const [termsPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: 'Términos y condiciones' }).click()
    ]);
    await termsPage.waitForLoadState();

    await expect(termsPage).toHaveURL(`${FRONTEND_BASE}/terminos`);
    await expect(termsPage.getByRole('heading', { level: 1 })).toContainText('Términos y condiciones');
    await expect(termsPage.getByRole('heading', { level: 2 }).first()).toBeVisible();
    // The sign-up form stays where it was, with the checkbox untouched.
    await expect(page.locator('.terms input')).not.toBeChecked();
  });

  test('si el archivo no se puede leer, la página lo dice', async ({ page }) => {
    await page.route('**/terminos.txt', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(`${FRONTEND_BASE}/terminos`);

    await expect(page.getByRole('alert')).toContainText('No pudimos cargar los términos');
  });
});
