import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  API_BASE,
  expectMailCount,
  mailsTo,
  otherCode,
  resendCode,
  startClientRegistration,
  startProfessionalRegistration,
  verifyEmail,
  waitForVerificationCode
} from './support/registration';
import { blockExternalMaps, blockGoogleIdentity } from './support/ui';

/**
 * Registration with an emailed code: the account does not exist until the code is verified.
 * Needs the backend and Mailpit (the inbox the app's emails land in) running; see the README.
 */

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const PASSWORD = 'ClaveSegura2026!';
const GENERIC_WRONG_CODE = /código incorrecto o vencido/i;

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

async function login(request: APIRequestContext, email: string, password = PASSWORD) {
  return request.post(`${API_BASE}/api/v1/auth/login`, { data: { email, password } });
}

test.describe('Registro con código por correo', () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleIdentity(page);
    await blockExternalMaps(page);
  });

  test('API: registrar cliente responde 202, manda el código y NO crea la cuenta', async ({ request }) => {
    const email = uniqueEmail('pin.cliente');

    const response = await startClientRegistration(request, { name: 'Cliente Con Pin', email, password: PASSWORD });

    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.email).toBe(email);
    expect(body.token).toBeUndefined();
    expect(body.codeLength).toBe(6);
    expect(body.expiresInSeconds).toBeGreaterThan(0);
    expect(body.resendCooldownSeconds).toBeGreaterThan(0);

    expect(await waitForVerificationCode(request, email)).toMatch(/^\d{6}$/);
    // Nobody can log in yet: there is no account.
    expect((await login(request, email)).status()).toBe(400);
  });

  test('API: el código correcto crea la cuenta de cliente y deja la sesión iniciada', async ({ request }) => {
    const email = uniqueEmail('pin.verifica');
    await startClientRegistration(request, { name: 'Cliente Verifica', email, password: PASSWORD });
    const code = await waitForVerificationCode(request, email);

    const verified = await verifyEmail(request, email, code);

    expect(verified.status()).toBe(200);
    const body = await verified.json();
    expect(body.role).toBe('CLIENT');
    expect(body.email).toBe(email);
    expect(body.token).toBeTruthy();

    const profile = await request.get(`${API_BASE}/api/v1/users/me`, { headers: { Authorization: `Bearer ${body.token}` } });
    expect(profile.status()).toBe(200);
    expect((await login(request, email)).status()).toBe(200);
  });

  test('API: el código correcto crea un profesional con su teléfono y ubicación', async ({ request }) => {
    const email = uniqueEmail('pin.profesional');
    const started = await startProfessionalRegistration(request, {
      name: 'Profesional Con Pin',
      email,
      password: PASSWORD,
      phoneNumber: '099123456',
      workingLocation: 'Montevideo'
    });
    expect(started.status()).toBe(202);

    const verified = await verifyEmail(request, email, await waitForVerificationCode(request, email));

    expect(verified.status()).toBe(200);
    const auth = await verified.json();
    expect(auth.role).toBe('PROFESSIONAL');
    const profile = await (await request.get(`${API_BASE}/api/v1/users/me`, { headers: { Authorization: `Bearer ${auth.token}` } })).json();
    expect(profile.phoneNumber).toBe('099123456');
    expect(profile.workingLocation).toBe('Montevideo');
  });

  test('API: un código se usa una sola vez', async ({ request }) => {
    const email = uniqueEmail('pin.unavez');
    await startClientRegistration(request, { name: 'Cliente Una Vez', email, password: PASSWORD });
    const code = await waitForVerificationCode(request, email);

    expect((await verifyEmail(request, email, code)).status()).toBe(200);

    const again = await verifyEmail(request, email, code);
    expect(again.status()).toBe(400);
  });

  test('API: un código incorrecto se rechaza y no crea la cuenta', async ({ request }) => {
    const email = uniqueEmail('pin.incorrecto');
    await startClientRegistration(request, { name: 'Cliente Incorrecto', email, password: PASSWORD });
    const code = await waitForVerificationCode(request, email);

    const response = await verifyEmail(request, email, otherCode(code));

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(GENERIC_WRONG_CODE);
    expect((await login(request, email)).status()).toBe(400);
  });

  test('API: tras 5 intentos fallidos el código queda bloqueado, aunque después se ingrese el correcto', async ({ request }) => {
    const email = uniqueEmail('pin.bloqueo');
    await startClientRegistration(request, { name: 'Cliente Bloqueo', email, password: PASSWORD });
    const code = await waitForVerificationCode(request, email);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await verifyEmail(request, email, otherCode(code))).status()).toBe(400);
    }

    const locked = await verifyEmail(request, email, code);
    expect(locked.status()).toBe(400);
    expect((await locked.json()).error).toMatch(/intentos/i);
    expect((await login(request, email)).status()).toBe(400);
  });

  test('API: verificar con un código no numérico o con un email sin registro pendiente responde 400', async ({ request }) => {
    const nonNumeric = await verifyEmail(request, uniqueEmail('pin.letras'), 'abc123');
    expect(nonNumeric.status()).toBe(400);

    // The same answer as a wrong code: it must not reveal whether a registration is pending.
    const nobody = await verifyEmail(request, uniqueEmail('pin.nadie'), '123456');
    expect(nobody.status()).toBe(400);
    expect((await nobody.json()).error).toMatch(GENERIC_WRONG_CODE);
  });

  test('API: los datos inválidos se rechazan al empezar y no se manda ningún código', async ({ request }) => {
    const email = uniqueEmail('pin.invalido');

    const response = await startClientRegistration(request, { name: 'A', email, password: 'abc' });

    expect(response.status()).toBe(400);
    await expectMailCount(request, email, 0);
  });

  test('API: pedir el reenvío antes del cooldown responde 429', async ({ request }) => {
    const email = uniqueEmail('pin.cooldown');
    await startClientRegistration(request, { name: 'Cliente Cooldown', email, password: PASSWORD });
    await waitForVerificationCode(request, email);

    const response = await resendCode(request, email);

    expect(response.status()).toBe(429);
  });

  test('API: reenviar después del cooldown manda un código nuevo y el anterior deja de servir', async ({ request }) => {
    const email = uniqueEmail('pin.reenvio');
    const started = await startClientRegistration(request, { name: 'Cliente Reenvio', email, password: PASSWORD });
    const cooldown = (await started.json()).resendCooldownSeconds as number;
    // The default is 60 s; CI shortens it (VERIFICATION_RESEND_COOLDOWN_SECONDS) so this can run.
    test.skip(cooldown > 10, `El cooldown de reenvío es de ${cooldown} s: bajalo con VERIFICATION_RESEND_COOLDOWN_SECONDS para correr este caso`);
    const first = await waitForVerificationCode(request, email);

    await new Promise((resolve) => setTimeout(resolve, (cooldown + 1) * 1000));
    const resent = await resendCode(request, email);
    expect(resent.status()).toBe(202);
    const second = await waitForVerificationCode(request, email, 2);

    if (second !== first) {
      expect((await verifyEmail(request, email, first)).status()).toBe(400);
    }
    expect((await verifyEmail(request, email, second)).status()).toBe(200);
  });

  test('API: reenviar el código de un email sin registro pendiente responde 202 y no manda nada', async ({ request }) => {
    const email = uniqueEmail('pin.reenvio.nadie');

    const response = await resendCode(request, email);

    expect(response.status()).toBe(202);
    await expectMailCount(request, email, 0);
  });

  test('API: empezar de nuevo el mismo registro antes del cooldown responde 429 y no manda otro correo', async ({ request }) => {
    const email = uniqueEmail('pin.reemplaza');
    await startClientRegistration(request, { name: 'Cliente Reemplaza', email, password: PASSWORD });
    await waitForVerificationCode(request, email);

    // Same email, still inside the cooldown: no second code so soon.
    const soon = await startClientRegistration(request, { name: 'Cliente Reemplaza Dos', email, password: 'OtraClave2026!' });
    expect(soon.status()).toBe(429);
    expect(await mailsTo(request, email)).toHaveLength(1);
  });

  test('UI: el formulario lleva al paso del código y el código correcto crea la cuenta y entra', async ({ page, request }) => {
    const email = uniqueEmail('ui.pin.ok');

    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario Ui Pin');
    await page.locator('#register-email').fill(email);
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible();
    await expect(page.locator('.register-intro')).toContainText(email);
    // No session and no account yet.
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
    expect((await login(request, email)).status()).toBe(400);

    await page.locator('#register-code').fill(await waitForVerificationCode(request, email));
    await page.getByRole('button', { name: /verificar y crear cuenta/i }).click();

    await expect(page).toHaveURL(`${FRONTEND_BASE}/`);
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeTruthy();
    expect((await login(request, email)).status()).toBe(200);
  });

  test('UI: un código incorrecto muestra el error y no crea la cuenta', async ({ page, request }) => {
    const email = uniqueEmail('ui.pin.mal');
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario Ui Pin Mal');
    await page.locator('#register-email').fill(email);
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();
    await page.locator('form button[type="submit"]').click();
    await page.locator('#register-code').waitFor();

    await expect(page.getByRole('button', { name: /verificar y crear cuenta/i })).toBeDisabled();
    await page.locator('#register-code').fill(otherCode(await waitForVerificationCode(request, email)));
    await page.getByRole('button', { name: /verificar y crear cuenta/i }).click();

    await expect(page.getByRole('alert')).toContainText(GENERIC_WRONG_CODE);
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
    expect((await login(request, email)).status()).toBe(400);
  });

  test('UI: el campo del código solo admite dígitos', async ({ page }) => {
    await page.route('**/api/v1/auth/register-client', (route) => route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'ui.digitos@qa.test', message: 'OK', codeLength: 6, expiresInSeconds: 900, resendCooldownSeconds: 60 })
    }));
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario Digitos');
    await page.locator('#register-email').fill('ui.digitos@qa.test');
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();
    await page.locator('form button[type="submit"]').click();

    await page.locator('#register-code').pressSequentially('12a3-4 5x6789');

    await expect(page.locator('#register-code')).toHaveValue('123456');
  });

  test('UI: "Cambiar correo" vuelve al formulario conservando lo escrito', async ({ page }) => {
    await page.route('**/api/v1/auth/register-client', (route) => route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'ui.cambia@qa.test', message: 'OK', codeLength: 6, expiresInSeconds: 900, resendCooldownSeconds: 60 })
    }));
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario Cambia Correo');
    await page.locator('#register-email').fill('ui.cambia@qa.test');
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();
    await page.locator('form button[type="submit"]').click();
    await page.locator('#register-code').waitFor();

    await page.getByRole('button', { name: 'Cambiar correo' }).click();

    await expect(page.locator('#register-name')).toHaveValue('Usuario Cambia Correo');
    await expect(page.locator('#register-email')).toHaveValue('ui.cambia@qa.test');
  });

  test('UI: reenviar está deshabilitado con cuenta regresiva y luego manda un código nuevo', async ({ page, request }) => {
    const email = uniqueEmail('ui.pin.reenvio');
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario Ui Reenvio');
    await page.locator('#register-email').fill(email);
    await page.locator('#register-password').fill(PASSWORD);
    await page.locator('#register-confirmation').fill(PASSWORD);
    await page.locator('.terms input').check();
    await page.locator('form button[type="submit"]').click();
    await page.locator('#register-code').waitFor();

    const resend = page.locator('.register-code-actions button').first();
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText(/Reenviar código en \d+:\d{2}/);

    const [, minutes, seconds] = /(\d+):(\d{2})/.exec(await resend.innerText())!;
    const countdown = Number(minutes) * 60 + Number(seconds);
    test.skip(countdown > 10, 'El cooldown de reenvío es largo: bajalo con VERIFICATION_RESEND_COOLDOWN_SECONDS para correr este caso');

    await expect(resend).toBeEnabled({ timeout: (countdown + 3) * 1000 });
    await resend.click();
    await expect(page.getByRole('status')).toContainText('código nuevo');

    await page.locator('#register-code').fill(await waitForVerificationCode(request, email, 2));
    await page.getByRole('button', { name: /verificar y crear cuenta/i }).click();
    await expect(page).toHaveURL(`${FRONTEND_BASE}/`);
  });
});
