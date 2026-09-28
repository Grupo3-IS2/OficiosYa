import { test, expect, type Page } from '@playwright/test';
import { API_BASE } from './support/registration';
import { blockExternalMaps, fakeJwt, mockVerifiedSession, type MockedUser } from './support/ui';

/**
 * Sign-in with Google. A real Google account can't be driven from a test, so:
 *  - the API cases check what needs no Google (validation, auth, "not configured" or "invalid token");
 *  - the UI cases replace Google's script and the API answers with mocks, and check what the page does.
 * The UI cases need the frontend started with VITE_GOOGLE_CLIENT_ID (playwright.config.ts does it
 * when it starts the dev server); against one started without it they skip.
 */

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const PASSWORD = 'ClaveSegura2026!';

/** JWT-shaped credential the page can decode the email from; nothing checks its signature in these mocked cases. */
function credential(email: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode({ sub: 'qa-google-sub', email, name: 'Usuario Google', email_verified: true })}.firma`;
}

/** Stand-in for https://accounts.google.com/gsi/client: draws a plain button that "picks" window.__googleCredential. */
async function mockGoogleIdentity(page: Page, nextCredential: string) {
  await page.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = { accounts: { id: {
      initialize(config) { window.__googleCallback = config.callback; },
      renderButton(element, options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fake-google-button';
        button.textContent = 'Google ' + options.text;
        button.onclick = () => window.__googleCallback({ credential: window.__googleCredential });
        element.appendChild(button);
      }
    } } };`
  }));
  await page.addInitScript((value) => { (window as unknown as { __googleCredential: string }).__googleCredential = value; }, nextCredential);
}

/** Skips the case when the frontend was started without a Google Client ID: there is no button to test. */
async function requireGoogleButton(page: Page) {
  const shown = await page.locator('.fake-google-button').waitFor({ timeout: 5000 }).then(() => true, () => false);
  test.skip(!shown, 'El frontend se levantó sin VITE_GOOGLE_CLIENT_ID: no hay botón de Google que probar');
}

async function jsonBody(route: { request(): { postDataJSON(): unknown } }) {
  return route.request().postDataJSON() as Record<string, unknown>;
}

const loginResponse = {
  id: '44444444-4444-4444-4444-444444444444',
  token: 'dummy-token-google',
  email: 'google.qa@qa.test',
  name: 'Usuario Google',
  role: 'CLIENT',
  message: 'OK'
};

test.describe('Acceso con Google - API', () => {
  test('API: entrar con Google sin credencial responde 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/auth/google/login`, { data: {} });
    expect(response.status()).toBe(400);
  });

  test('API: una credencial que no es un token de Google se rechaza con JSON estándar', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/auth/google/login`, { data: { credential: 'no-es-un-token' } });

    // 401 when Google sign-in is configured, 503 when it is not (no GOOGLE_CLIENT_ID): never a login.
    expect([401, 503]).toContain(response.status());
    const body = await response.json();
    expect(body.status).toBe(response.status());
    expect(body.token).toBeUndefined();
    expect(typeof body.error).toBe('string');
  });

  test('API: registrar como profesional con Google exige teléfono y ubicación', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/auth/google/register-professional`, { data: { credential: 'x' } });
    expect(response.status()).toBe(400);
  });

  test('API: vincular Google desde el perfil pide sesión', async ({ request }) => {
    const link = await request.put(`${API_BASE}/api/v1/users/me/google`, { data: { credential: 'x', currentPassword: PASSWORD } });
    expect([401, 403]).toContain(link.status());
    const unlink = await request.delete(`${API_BASE}/api/v1/users/me/google`, { data: { currentPassword: PASSWORD } });
    expect([401, 403]).toContain(unlink.status());
  });

  test('API: vincular Google a una cuenta sin la contraseña no es posible', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/auth/google/link`, { data: { credential: 'x' } });
    expect(response.status()).toBe(400);
  });
});

test.describe('Acceso con Google - UI (Google y API simulados)', () => {
  test.beforeEach(async ({ page }) => blockExternalMaps(page));

  test('UI: el login ofrece el botón de Google', async ({ page }) => {
    await mockGoogleIdentity(page, credential('ana@qa.test'));
    await page.goto(`${FRONTEND_BASE}/login`);
    await requireGoogleButton(page);

    await expect(page.locator('.auth-divider')).toBeVisible();
    await expect(page.locator('.fake-google-button')).toContainText('signin_with');
  });

  test('UI: Google sin cuenta muestra el mensaje del backend y no inicia sesión', async ({ page }) => {
    await mockGoogleIdentity(page, credential('nadie@qa.test'));
    await page.route('**/api/v1/auth/google/login', (route) => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ status: 404, error: 'No encontramos una cuenta con ese correo, registrate primero' })
    }));
    await page.goto(`${FRONTEND_BASE}/login`);
    await requireGoogleButton(page);

    await page.locator('.fake-google-button').click();

    await expect(page.getByRole('alert')).toContainText('registrate primero');
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
  });

  test('UI: un correo con cuenta y contraseña sin vincular abre el cuadro, y "No, gracias" no vincula nada', async ({ page }) => {
    let linkCalls = 0;
    await mockGoogleIdentity(page, credential('ana@qa.test'));
    await page.route('**/api/v1/auth/google/login', (route) => route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ status: 409, error: 'Ya existe una cuenta con este correo. Confirmá tu contraseña si querés vincularla con Google' })
    }));
    await page.route('**/api/v1/auth/google/link', (route) => { linkCalls++; return route.abort(); });
    await page.goto(`${FRONTEND_BASE}/login`);
    await requireGoogleButton(page);

    await page.locator('.fake-google-button').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('ana@qa.test');
    await expect(dialog.getByRole('button', { name: 'Vincular y entrar' })).toBeDisabled();

    await dialog.getByRole('button', { name: 'No, gracias' }).click();

    await expect(dialog).toHaveCount(0);
    expect(linkCalls).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
  });

  test('UI: "Vincular y entrar" manda la credencial con la contraseña, y una contraseña mala deja el cuadro abierto', async ({ page }) => {
    const sent: Record<string, unknown>[] = [];
    await mockGoogleIdentity(page, credential('ana@qa.test'));
    await page.route('**/api/v1/auth/google/login', (route) => route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ status: 409, error: 'Ya existe una cuenta con este correo' })
    }));
    await page.route('**/api/v1/auth/google/link', async (route) => {
      const body = await jsonBody(route);
      sent.push(body);
      if (body.password === PASSWORD) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loginResponse) });
      }
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ status: 400, error: 'Contraseña incorrecta' }) });
    });
    await page.route('**/api/v1/trades', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/v1/professionals/search**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [], totalPages: 0 }) }));
    await page.goto(`${FRONTEND_BASE}/login`);
    await requireGoogleButton(page);
    await page.locator('.fake-google-button').click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Contraseña de OficiosYa').fill('incorrecta');
    await dialog.getByRole('button', { name: 'Vincular y entrar' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Contraseña incorrecta');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Contraseña de OficiosYa').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Vincular y entrar' }).click();

    await expect(page).toHaveURL(`${FRONTEND_BASE}/`);
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBe('dummy-token-google');
    expect(sent.at(-1)).toMatchObject({ credential: credential('ana@qa.test'), password: PASSWORD });
  });

  test('UI: registrarse con Google exige aceptar los términos', async ({ page }) => {
    let calls = 0;
    await mockGoogleIdentity(page, credential('bob@qa.test'));
    await page.route('**/api/v1/auth/google/register-client', (route) => { calls++; return route.abort(); });
    await page.goto(`${FRONTEND_BASE}/register`);
    await requireGoogleButton(page);

    await page.locator('.fake-google-button').click();

    await expect(page.getByRole('alert')).toContainText('términos');
    expect(calls).toBe(0);
  });

  test('UI: registrar un cliente con Google llama a register-client y entra', async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await mockGoogleIdentity(page, credential('bob@qa.test'));
    await page.route('**/api/v1/auth/google/register-client', async (route) => {
      sent = await jsonBody(route);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loginResponse) });
    });
    await page.route('**/api/v1/trades', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/v1/professionals/search**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [], totalPages: 0 }) }));
    await page.goto(`${FRONTEND_BASE}/register`);
    await requireGoogleButton(page);
    await page.locator('.terms input').check();

    await expect(page.locator('.fake-google-button')).toContainText('signup_with');
    await page.locator('.fake-google-button').click();

    await expect(page).toHaveURL(`${FRONTEND_BASE}/`);
    expect(sent).toEqual({ credential: credential('bob@qa.test') });
  });

  test('UI: registrar un profesional con Google pide teléfono y ubicación primero', async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await mockGoogleIdentity(page, credential('pro@qa.test'));
    await page.route('**/api/v1/auth/google/register-professional', async (route) => {
      sent = await jsonBody(route);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...loginResponse, role: 'PROFESSIONAL' }) });
    });
    await page.route('**/api/v1/trades', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/v1/professionals/search**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [], totalPages: 0 }) }));
    await page.goto(`${FRONTEND_BASE}/register`);
    await requireGoogleButton(page);
    await page.locator('.account-type').nth(1).click();
    await page.locator('.terms input').check();

    await page.locator('.fake-google-button').click();
    await expect(page.getByRole('alert')).toContainText('ubicación');
    expect(sent).toBeNull();

    await page.locator('#register-location').fill('Salto');
    await page.locator('#register-phone').fill('099123456');
    await page.locator('.fake-google-button').click();

    await expect(page).toHaveURL(`${FRONTEND_BASE}/`);
    expect(sent).toEqual({ credential: credential('pro@qa.test'), phoneNumber: '099123456', workingLocation: 'Salto' });
  });

  async function openProfile(page: Page, user: Partial<MockedUser>) {
    await mockVerifiedSession(page, { name: 'Perfil Google QA', email: 'perfil.google@qa.test', ...user });
    await page.goto(FRONTEND_BASE);
    await page.evaluate((token) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Perfil Google QA', email: 'perfil.google@qa.test', role: 'CLIENT' }));
    }, fakeJwt());
    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
  }

  test('UI: perfil con Google vinculado permite desvincular con la contraseña actual', async ({ page }) => {
    let unlinkBody: Record<string, unknown> | null = null;
    await mockGoogleIdentity(page, credential('perfil.google@qa.test'));
    await page.route('**/api/v1/users/me/google', async (route) => {
      unlinkBody = await jsonBody(route);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Perfil Google QA', email: 'perfil.google@qa.test', role: 'CLIENT', hasPassword: true, googleLinked: false })
      });
    });
    await openProfile(page, { googleLinked: true });

    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Cuenta de Google' }) });
    await section.getByRole('button', { name: 'Desvincular Google' }).click();
    await expect(section.getByRole('alert')).toContainText('contraseña actual');
    expect(unlinkBody).toBeNull();

    await section.getByLabel('Contraseña actual').fill(PASSWORD);
    await section.getByRole('button', { name: 'Desvincular Google' }).click();

    await expect(section.getByRole('status')).toContainText('desvinculada');
    expect(unlinkBody).toEqual({ currentPassword: PASSWORD });
    await expect(section.getByRole('button', { name: 'Desvincular Google' })).toHaveCount(0);
  });

  test('UI: perfil sin Google vinculado ofrece vincularlo, y pide la contraseña antes', async ({ page }) => {
    let linkBody: Record<string, unknown> | null = null;
    await mockGoogleIdentity(page, credential('perfil.google@qa.test'));
    await page.route('**/api/v1/users/me/google', async (route) => {
      linkBody = await jsonBody(route);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Perfil Google QA', email: 'perfil.google@qa.test', role: 'CLIENT', hasPassword: true, googleLinked: true })
      });
    });
    await openProfile(page, { googleLinked: false });
    await requireGoogleButton(page);
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Cuenta de Google' }) });

    await section.locator('.fake-google-button').click();
    await expect(section.getByRole('alert')).toContainText('contraseña actual');
    expect(linkBody).toBeNull();

    await section.getByLabel('Contraseña actual').fill(PASSWORD);
    await section.locator('.fake-google-button').click();

    await expect(section.getByRole('status')).toContainText('vinculada');
    expect(linkBody).toEqual({ credential: credential('perfil.google@qa.test'), currentPassword: PASSWORD });
  });

  test('UI: un Google con otro correo se rechaza y el perfil sigue sin vincular; avisa qué correo usar', async ({ page }) => {
    await mockGoogleIdentity(page, credential('otro.correo@qa.test'));
    await page.route('**/api/v1/users/me/google', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ status: 400, error: 'Esa cuenta de Google usa otro correo. Elegí la cuenta de Google con el correo de tu cuenta: perfil.google@qa.test' })
    }));
    await openProfile(page, { googleLinked: false });
    await requireGoogleButton(page);
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Cuenta de Google' }) });
    // Before choosing, the page already says which Google it has to be.
    await expect(section).toContainText('perfil.google@qa.test');

    await section.getByLabel('Contraseña actual').fill(PASSWORD);
    await section.locator('.fake-google-button').click();

    await expect(section.getByRole('alert')).toContainText('usa otro correo');
    await expect(section.getByRole('alert')).toContainText('perfil.google@qa.test');
    await expect(section.getByRole('button', { name: 'Desvincular Google' })).toHaveCount(0);
  });

  test('UI: una cuenta creada con Google no tiene contraseña que cambiar ni correo editable', async ({ page }) => {
    await mockGoogleIdentity(page, credential('perfil.google@qa.test'));
    await openProfile(page, { hasPassword: false, googleLinked: true });

    await expect(page.getByRole('heading', { name: 'Cuenta de Google' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Desvincular Google' })).toHaveCount(0);
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('readonly', '');
  });
});
