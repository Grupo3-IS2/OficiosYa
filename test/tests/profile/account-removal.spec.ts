import { test, expect, type Page, type Route } from '@playwright/test';
import { blockExternalMaps, fakeJwt, mockVerifiedSession } from '../support/ui';

/** Removing the profile photo and deleting the account, from "Editar perfil". The API is a mock. */

const USER_ID = '33333333-3333-3333-3333-333333333333';

function user(overrides: Record<string, unknown> = {}) {
  return { id: USER_ID, name: 'Carla Cliente', email: 'carla@qa.test', phoneNumber: null, profileImageUrl: '/uploads/carla.png',
    role: 'CLIENT', createdAt: new Date().toISOString(), hasPassword: true, googleLinked: false, emailNotifications: true, ...overrides };
}

async function openProfile(page: Page, account: Record<string, unknown> = {}) {
  await mockVerifiedSession(page, { name: 'Carla Cliente', email: 'carla@qa.test' });
  await blockExternalMaps(page);
  await page.route('**/uploads/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
  const deletions: Record<string, unknown>[] = [];
  // Registered after the general mock, so this one answers: GET is the profile, DELETE the deletion.
  await page.route('**/api/v1/users/me', async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fulfill({ json: user(account) });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    deletions.push(body);
    const confirmed = account.hasPassword === false ? body.email === 'carla@qa.test' : body.currentPassword === 'ClaveSegura2026!';
    return confirmed
      ? route.fulfill({ status: 204, body: '' })
      : route.fulfill({ status: 400, json: { status: 400, error: account.hasPassword === false ? 'Escribí el correo de tu cuenta para confirmar' : 'La contraseña actual es incorrecta' } });
  });
  let codesAsked = 0;
  await page.route('**/api/v1/users/me/deletion-code', (route) => {
    codesAsked++;
    return route.fulfill({ status: 202, json: { email: 'carla@qa.test', verificationRequired: true, codeLength: 6, expiresInSeconds: 900, resendCooldownSeconds: 60 } });
  });
  await page.addInitScript((token) => {
    if (!sessionStorage.getItem('signed-in-once')) {
      sessionStorage.setItem('signed-in-once', '1');
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Carla Cliente', email: 'carla@qa.test', role: 'CLIENT' }));
    }
  }, fakeJwt());
  await page.goto('/profile/edit');
  await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
  return Object.assign(deletions, { codesAsked: () => codesAsked });
}

test('"Quitar foto" leaves the placeholder, and saving deletes the photo', async ({ page }) => {
  let removed = 0;
  await page.route('**/api/v1/users/me/profile-image', (route) => {
    if (route.request().method() === 'DELETE') removed++;
    return route.fulfill({ json: user({ profileImageUrl: null }) });
  });
  await openProfile(page);
  const personal = page.getByRole('region', { name: 'Datos personales' });

  await expect(personal.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', /carla\.png/);
  await personal.getByRole('button', { name: 'Quitar foto' }).click();
  await expect(personal.getByRole('img', { name: 'Foto de perfil' })).not.toHaveAttribute('src', /carla\.png/);
  await expect(personal.getByRole('button', { name: 'Quitar foto' })).toHaveCount(0);
  // Nothing is deleted until it is saved.
  expect(removed).toBe(0);

  await personal.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect.poll(() => removed).toBe(1);
});

test('deleting the account asks for the password and a mailed code, and ends the session', async ({ page }) => {
  const deletions = await openProfile(page);
  const section = page.getByRole('region', { name: 'Eliminar cuenta' });

  await section.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  // Without asking for the code first, nothing is sent.
  await section.getByLabel('Contraseña actual').fill('ClaveSegura2026!');
  await section.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(section.getByRole('alert')).toContainText('Primero pide el código');
  expect(deletions).toHaveLength(0);

  await section.getByRole('button', { name: 'Enviar código de verificación' }).click();
  await expect(section.getByText('Te enviamos un código de 6 dígitos a')).toBeVisible();
  expect(deletions.codesAsked()).toBe(1);
  await section.getByLabel('Código de verificación').fill('123456');

  await section.getByLabel('Contraseña actual').fill('incorrecta');
  await section.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(section.getByRole('alert')).toContainText('La contraseña actual es incorrecta');
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).not.toBeNull();

  await section.getByLabel('Contraseña actual').fill('ClaveSegura2026!');
  await section.getByRole('button', { name: 'Eliminar definitivamente' }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(deletions.at(-1)).toEqual({ currentPassword: 'ClaveSegura2026!', code: '123456' });
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
});

test('an account created with Google confirms the deletion with its email', async ({ page }) => {
  const deletions = await openProfile(page, { hasPassword: false, googleLinked: true });
  const section = page.getByRole('region', { name: 'Eliminar cuenta' });

  await section.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await section.getByLabel(/Escribe tu correo/).fill('carla@qa.test');
  await section.getByRole('button', { name: 'Enviar código de verificación' }).click();
  await section.getByLabel('Código de verificación').fill('654321');
  await section.getByRole('button', { name: 'Eliminar definitivamente' }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(deletions.at(-1)).toEqual({ email: 'carla@qa.test', code: '654321' });
});

test('with a job still open no code is mailed, and it says why', async ({ page }) => {
  await openProfile(page);
  await page.route('**/api/v1/users/me/deletion-code', (route) =>
    route.fulfill({ status: 409, json: { status: 409, error: 'Tenés trabajos en curso: cancelalos o terminalos antes de eliminar tu cuenta' } }));
  const section = page.getByRole('region', { name: 'Eliminar cuenta' });

  await section.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await section.getByRole('button', { name: 'Enviar código de verificación' }).click();

  await expect(section.getByRole('alert')).toContainText('trabajos en curso');
  await expect(section.getByLabel('Código de verificación')).toBeDisabled();
  await expect(page).toHaveURL(/\/profile\/edit$/);
});
