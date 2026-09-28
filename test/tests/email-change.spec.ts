import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  expectMailCount,
  mailsTo,
  otherCode,
  startClientRegistration,
  waitForVerificationCode
} from './support/registration';
import { blockGoogleIdentity } from './support/ui';

/**
 * Changing the email from the profile: the current password starts it, a code mailed to the NEW
 * address finishes it, and the account keeps its email until then. Needs the backend and Mailpit
 * running; see the README.
 */

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const PASSWORD = 'ClaveSegura2026!';

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

interface Account {
  email: string;
  token: string;
}

async function createAccount(request: APIRequestContext, prefix: string): Promise<Account> {
  const email = uniqueEmail(prefix);
  const response = await completeRegistration(request, await startClientRegistration(request, { name: 'Cliente Cambia Correo', email, password: PASSWORD }), email);
  expect(response.status()).toBe(200);
  return { email, token: (await response.json()).token };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function startChange(request: APIRequestContext, account: Account, newEmail: string, currentPassword = PASSWORD) {
  return request.put(`${API_BASE}/api/v1/users/me/email`, { headers: auth(account.token), data: { newEmail, currentPassword } });
}

function verifyChange(request: APIRequestContext, account: Account, newEmail: string, code: string) {
  return request.post(`${API_BASE}/api/v1/users/me/email/verify`, { headers: auth(account.token), data: { email: newEmail, code } });
}

function resendChange(request: APIRequestContext, account: Account, newEmail: string) {
  return request.post(`${API_BASE}/api/v1/users/me/email/resend`, { headers: auth(account.token), data: { email: newEmail } });
}

async function currentEmail(request: APIRequestContext, account: Account) {
  const response = await request.get(`${API_BASE}/api/v1/users/me`, { headers: auth(account.token) });
  expect(response.status()).toBe(200);
  return (await response.json()).email as string;
}

async function login(request: APIRequestContext, email: string) {
  return request.post(`${API_BASE}/api/v1/auth/login`, { data: { email, password: PASSWORD } });
}

test.describe('Cambio de correo con código', () => {
  test.beforeEach(async ({ page }) => blockGoogleIdentity(page));

  test('API: empezar el cambio manda el código al correo NUEVO y no cambia nada todavía', async ({ request }) => {
    const account = await createAccount(request, 'cambio.manda');
    const newEmail = uniqueEmail('cambio.manda.nuevo');

    const response = await startChange(request, account, newEmail);

    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.email).toBe(newEmail);
    expect(body.codeLength).toBe(6);
    expect(body.expiresInSeconds).toBeGreaterThan(0);
    expect(body.resendCooldownSeconds).toBeGreaterThan(0);

    expect(await waitForVerificationCode(request, newEmail)).toMatch(/^\d{6}$/);
    // Only the code for the registration went to the current address; nothing to it now.
    await expectMailCount(request, account.email, 1);
    expect(await currentEmail(request, account)).toBe(account.email);
    expect((await login(request, newEmail)).status()).toBe(400);
  });

  test('API: con el código correcto el correo cambia, el token sigue sirviendo y el correo viejo deja de entrar', async ({ request }) => {
    const account = await createAccount(request, 'cambio.ok');
    const newEmail = uniqueEmail('cambio.ok.nuevo');
    await startChange(request, account, newEmail);

    const verified = await verifyChange(request, account, newEmail, await waitForVerificationCode(request, newEmail));

    expect(verified.status()).toBe(200);
    expect((await verified.json()).email).toBe(newEmail);
    expect(await currentEmail(request, account)).toBe(newEmail);
    expect((await login(request, newEmail)).status()).toBe(200);
    expect((await login(request, account.email)).status()).toBe(400);
  });

  test('API: un código incorrecto no cambia el correo, y se usa una sola vez', async ({ request }) => {
    const account = await createAccount(request, 'cambio.mal');
    const newEmail = uniqueEmail('cambio.mal.nuevo');
    await startChange(request, account, newEmail);
    const code = await waitForVerificationCode(request, newEmail);

    const wrong = await verifyChange(request, account, newEmail, otherCode(code));
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toMatch(/código incorrecto o vencido/i);
    expect(await currentEmail(request, account)).toBe(account.email);

    expect((await verifyChange(request, account, newEmail, code)).status()).toBe(200);
    expect((await verifyChange(request, account, newEmail, code)).status()).toBe(400);
  });

  test('API: tras 5 intentos fallidos el código queda bloqueado', async ({ request }) => {
    const account = await createAccount(request, 'cambio.bloqueo');
    const newEmail = uniqueEmail('cambio.bloqueo.nuevo');
    await startChange(request, account, newEmail);
    const code = await waitForVerificationCode(request, newEmail);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await verifyChange(request, account, newEmail, otherCode(code))).status()).toBe(400);
    }

    const locked = await verifyChange(request, account, newEmail, code);
    expect(locked.status()).toBe(400);
    expect((await locked.json()).error).toMatch(/intentos/i);
    expect(await currentEmail(request, account)).toBe(account.email);
  });

  test('API: la contraseña incorrecta o un correo igual al actual no mandan ningún código', async ({ request }) => {
    const account = await createAccount(request, 'cambio.rechazo');
    const newEmail = uniqueEmail('cambio.rechazo.nuevo');

    expect((await startChange(request, account, newEmail, 'ClaveIncorrecta123!')).status()).toBe(400);
    expect((await startChange(request, account, account.email)).status()).toBe(400);

    await expectMailCount(request, newEmail, 0);
    await expectMailCount(request, account.email, 1);
  });

  test('API: otro usuario no puede usar ni gastar el código de un cambio ajeno', async ({ request }) => {
    const owner = await createAccount(request, 'cambio.dueno');
    const intruder = await createAccount(request, 'cambio.intruso');
    const newEmail = uniqueEmail('cambio.ajeno.nuevo');
    await startChange(request, owner, newEmail);
    const code = await waitForVerificationCode(request, newEmail);

    // The intruder read the code somehow: it still isn't theirs.
    const stolen = await verifyChange(request, intruder, newEmail, code);
    expect(stolen.status()).toBe(400);
    expect(await currentEmail(request, intruder)).toBe(intruder.email);

    // And the attempts of the owner's code were not touched: 5 wrong tries from the intruder change nothing for them.
    for (let attempt = 1; attempt <= 6; attempt++) {
      await verifyChange(request, intruder, newEmail, otherCode(code));
    }
    expect((await verifyChange(request, owner, newEmail, code)).status()).toBe(200);
  });

  test('API: el reenvío solo sirve para un cambio empezado, no para mandar códigos a cualquier correo', async ({ request }) => {
    const account = await createAccount(request, 'cambio.reenvio.ajeno');
    const victim = uniqueEmail('cambio.victima');

    const response = await resendChange(request, account, victim);

    expect(response.status()).toBe(400);
    await expectMailCount(request, victim, 0);
  });

  test('API: pedir el reenvío antes del cooldown responde 429', async ({ request }) => {
    const account = await createAccount(request, 'cambio.cooldown');
    const newEmail = uniqueEmail('cambio.cooldown.nuevo');
    await startChange(request, account, newEmail);
    await waitForVerificationCode(request, newEmail);

    expect((await resendChange(request, account, newEmail)).status()).toBe(429);
  });

  test('API: reenviar después del cooldown manda un código nuevo y el anterior deja de servir', async ({ request }) => {
    const account = await createAccount(request, 'cambio.reenvio');
    const newEmail = uniqueEmail('cambio.reenvio.nuevo');
    const started = await startChange(request, account, newEmail);
    const cooldown = (await started.json()).resendCooldownSeconds as number;
    test.skip(cooldown > 10, `El cooldown de reenvío es de ${cooldown} s: bajalo con VERIFICATION_RESEND_COOLDOWN_SECONDS para correr este caso`);
    const first = await waitForVerificationCode(request, newEmail);

    await new Promise((resolve) => setTimeout(resolve, (cooldown + 1) * 1000));
    expect((await resendChange(request, account, newEmail)).status()).toBe(202);
    const second = await waitForVerificationCode(request, newEmail, 2);

    if (second !== first) {
      expect((await verifyChange(request, account, newEmail, first)).status()).toBe(400);
    }
    expect((await verifyChange(request, account, newEmail, second)).status()).toBe(200);
  });

  test('API: si alguien registra ese correo mientras tanto, el cambio se rechaza con 409', async ({ request }) => {
    const account = await createAccount(request, 'cambio.carrera');
    const newEmail = uniqueEmail('cambio.carrera.nuevo');
    await startChange(request, account, newEmail);
    const code = await waitForVerificationCode(request, newEmail);

    // Somebody else registers that address before the code is entered.
    const taken = await completeRegistration(request, await startClientRegistration(request, { name: 'Cliente Se Adelanta', email: newEmail, password: PASSWORD }), newEmail);
    expect(taken.status()).toBe(200);

    const response = await verifyChange(request, account, newEmail, code);
    expect(response.status()).toBe(409);
    expect(await currentEmail(request, account)).toBe(account.email);
  });

  test('API: el cambio de correo pide sesión', async ({ request }) => {
    const put = await request.put(`${API_BASE}/api/v1/users/me/email`, { data: { newEmail: uniqueEmail('cambio.sin.sesion'), currentPassword: PASSWORD } });
    const verify = await request.post(`${API_BASE}/api/v1/users/me/email/verify`, { data: { email: 'a@qa.test', code: '123456' } });
    const resend = await request.post(`${API_BASE}/api/v1/users/me/email/resend`, { data: { email: 'a@qa.test' } });

    expect([put.status(), verify.status(), resend.status()]).toEqual([401, 401, 401]);
  });

  /** A real session, so the page talks to the real backend. */
  async function openProfile(page: Page, request: APIRequestContext, prefix: string) {
    const account = await createAccount(request, prefix);
    await page.goto(FRONTEND_BASE);
    await page.evaluate(({ token, email }) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({ name: 'Cliente Cambia Correo', email, role: 'CLIENT' }));
    }, { token: account.token, email: account.email });
    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(page.locator('#profile-email')).toHaveValue(account.email);
    return account;
  }

  async function askForTheChange(page: Page, newEmail: string) {
    await page.locator('#profile-email').fill(newEmail);
    await page.locator('#profile-email-password').fill(PASSWORD);
    await page.getByRole('button', { name: /guardar cambios/i }).first().click();
  }

  test('UI: cambiar el correo pide el código, y con el código correcto el correo queda actualizado', async ({ page, request }) => {
    const account = await openProfile(page, request, 'ui.cambio.ok');
    const newEmail = uniqueEmail('ui.cambio.ok.nuevo');

    await askForTheChange(page, newEmail);

    await expect(page.locator('#email-change-code')).toBeVisible();
    await expect(page.locator('#email-change-help')).toContainText(newEmail);
    await expect(page.locator('#email-change-help')).toContainText(account.email);
    // Not applied yet.
    expect(await currentEmail(request, account)).toBe(account.email);
    await expect(page.locator('#profile-email-password')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Confirmar el nuevo correo' })).toBeDisabled();
    await page.locator('#email-change-code').fill(await waitForVerificationCode(request, newEmail));
    await page.getByRole('button', { name: 'Confirmar el nuevo correo' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Correo actualizado.' })).toBeVisible();
    await expect(page.locator('#email-change-code')).toHaveCount(0);
    await expect(page.locator('#profile-email')).toHaveValue(newEmail);
    expect(await currentEmail(request, account)).toBe(newEmail);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('oficiosya_user')!).email)).toBe(newEmail);
  });

  test('UI: un código incorrecto muestra el error y el correo sigue siendo el de antes', async ({ page, request }) => {
    const account = await openProfile(page, request, 'ui.cambio.mal');
    const newEmail = uniqueEmail('ui.cambio.mal.nuevo');
    await askForTheChange(page, newEmail);
    await page.locator('#email-change-code').waitFor();

    await page.locator('#email-change-code').fill(otherCode(await waitForVerificationCode(request, newEmail)));
    await page.getByRole('button', { name: 'Confirmar el nuevo correo' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /código incorrecto o vencido/i })).toBeVisible();
    expect(await currentEmail(request, account)).toBe(account.email);
  });

  test('UI: "Cancelar el cambio" vuelve al correo actual y no se manda ningún otro código', async ({ page, request }) => {
    const account = await openProfile(page, request, 'ui.cambio.cancela');
    const newEmail = uniqueEmail('ui.cambio.cancela.nuevo');
    await askForTheChange(page, newEmail);
    await page.locator('#email-change-code').waitFor();

    await page.getByRole('button', { name: 'Cancelar el cambio' }).click();

    await expect(page.locator('#email-change-code')).toHaveCount(0);
    await expect(page.locator('#profile-email')).toHaveValue(account.email);
    expect(await currentEmail(request, account)).toBe(account.email);
    expect(await mailsTo(request, newEmail)).toHaveLength(1);
  });

  test('UI: reenviar está deshabilitado con cuenta regresiva y luego manda un código nuevo', async ({ page, request }) => {
    await openProfile(page, request, 'ui.cambio.reenvio');
    const newEmail = uniqueEmail('ui.cambio.reenvio.nuevo');
    await askForTheChange(page, newEmail);
    await page.locator('#email-change-code').waitFor();

    const resend = page.locator('.email-change__actions button').nth(1);
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText(/Reenviar código en \d+:\d{2}/);
    const [, minutes, seconds] = /(\d+):(\d{2})/.exec(await resend.innerText())!;
    const countdown = Number(minutes) * 60 + Number(seconds);
    test.skip(countdown > 10, 'El cooldown de reenvío es largo: bajalo con VERIFICATION_RESEND_COOLDOWN_SECONDS para correr este caso');

    await expect(resend).toBeEnabled({ timeout: (countdown + 3) * 1000 });
    await resend.click();
    await expect(page.getByRole('status').filter({ hasText: 'código nuevo' })).toBeVisible();

    await page.locator('#email-change-code').fill(await waitForVerificationCode(request, newEmail, 2));
    await page.getByRole('button', { name: 'Confirmar el nuevo correo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correo actualizado.' })).toBeVisible();
  });
});
