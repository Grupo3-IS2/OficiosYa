import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  expectMailCount,
  otherCode,
  startClientRegistration,
  waitForVerificationCode
} from '../support/registration';
import { blockExternalMaps, blockGoogleIdentity } from '../support/ui';

/**
 * "¿Olvidaste tu contraseña?": a code mailed to the account sets a new password, and the answers
 * never say whether an email has an account. Needs the backend and Mailpit running; see the README.
 */

const PASSWORD = 'ClaveSegura2026!';
const NEW_PASSWORD = 'ClaveNueva2026!';

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

function login(request: APIRequestContext, email: string, password: string) {
  return request.post(`${API_BASE}/api/v1/auth/login`, { data: { email, password } });
}

function startReset(request: APIRequestContext, email: string) {
  return request.post(`${API_BASE}/api/v1/auth/password-reset`, { data: { email } });
}

function confirmReset(request: APIRequestContext, email: string, code: string, password = NEW_PASSWORD) {
  return request.post(`${API_BASE}/api/v1/auth/password-reset/confirm`, {
    data: { email, code, newPassword: password, newPasswordConfirmation: password }
  });
}

/** A client with a password; its registration code is the first email in its inbox. */
async function registeredClient(request: APIRequestContext, prefix: string) {
  const email = uniqueEmail(prefix);
  const started = await startClientRegistration(request, { name: 'Cliente Olvidadizo', email, password: PASSWORD });
  const created = await completeRegistration(request, started, email);
  expect(created.status()).toBe(200);
  return { email, token: (await created.json()).token as string };
}

test.describe('Recuperar la contraseña con código', () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleIdentity(page);
    await blockExternalMaps(page);
  });

  test('API: con el código, la contraseña cambia, la vieja deja de servir y se cierran las sesiones', async ({ request }) => {
    const { email, token } = await registeredClient(request, 'reset.ok');

    expect((await startReset(request, email)).status()).toBe(202);
    const code = await waitForVerificationCode(request, email, 2);

    const confirmed = await confirmReset(request, email, code);
    expect(confirmed.status()).toBe(200);
    expect((await confirmed.json()).token).toBeUndefined();

    expect((await login(request, email, PASSWORD)).status()).toBe(400);
    expect((await login(request, email, NEW_PASSWORD)).status()).toBe(200);
    const profile = await request.get(`${API_BASE}/api/v1/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(profile.status()).toBe(401);
    // A code is used once
    expect((await confirmReset(request, email, code, 'OtraClaveSegura2026!')).status()).toBe(400);
  });

  test('API: un correo sin cuenta recibe la misma respuesta y no se manda nada', async ({ request }) => {
    const { email } = await registeredClient(request, 'reset.existe');
    const unknown = uniqueEmail('reset.nadie');

    const known = await startReset(request, email);
    const missing = await startReset(request, unknown);

    expect(missing.status()).toBe(known.status());
    const { email: _known, ...knownBody } = await known.json();
    const { email: _missing, ...missingBody } = await missing.json();
    expect(missingBody).toEqual(knownBody);
    await expectMailCount(request, unknown, 0);
    // Asking again inside the cooldown doesn't give it away either
    expect((await startReset(request, email)).status()).toBe(202);
  });

  test('API: un código incorrecto no cambia la contraseña', async ({ request }) => {
    const { email } = await registeredClient(request, 'reset.mal');
    await startReset(request, email);
    const code = await waitForVerificationCode(request, email, 2);

    const response = await confirmReset(request, email, otherCode(code));

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/código incorrecto o vencido/i);
    expect((await login(request, email, PASSWORD)).status()).toBe(200);
  });

  test('API: una contraseña débil se rechaza sin gastar el código', async ({ request }) => {
    const { email } = await registeredClient(request, 'reset.debil');
    await startReset(request, email);
    const code = await waitForVerificationCode(request, email, 2);

    expect((await confirmReset(request, email, code, 'abc')).status()).toBe(400);
    expect((await confirmReset(request, email, code)).status()).toBe(200);
  });

  test('UI: desde el login se pide el código y con él se elige la contraseña nueva', async ({ page, request }) => {
    const { email } = await registeredClient(request, 'reset.ui');

    await page.goto('/login');
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page).toHaveURL(/\/recuperar-contrasena$/);

    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page.getByRole('heading', { name: 'Elegí una contraseña nueva' })).toBeVisible();

    await page.getByLabel('Código').fill(await waitForVerificationCode(request, email, 2));
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Repetí la contraseña nueva').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();

    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText('Cambiaste tu contraseña. Iniciá sesión con la nueva.')).toBeVisible();
    expect((await login(request, email, NEW_PASSWORD)).status()).toBe(200);
  });
});
