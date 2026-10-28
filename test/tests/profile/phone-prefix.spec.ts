import { test, expect, type Page } from '@playwright/test';
import { blockExternalMaps, fakeJwt, mockVerifiedSession } from '../support/ui';

/**
 * The phone in "Editar perfil", for a professional: the saved number is shown split into the country's prefix
 * (with its flag) and the rest, and is saved whole again. The countries' list is a mock of the public CDN.
 */

const country = (cca2: string, spa: string, root: string, suffixes: string[]) =>
  ({ cca2, name: { common: spa }, translations: { spa: { common: spa } }, idd: { root, suffixes } });

function professionalBody(phoneNumber: string) {
  return {
    id: '33333333-3333-3333-3333-333333333333', name: 'Juan Gomez', email: 'pro.tel@qa.test', phoneNumber,
    profileImageUrl: null, role: 'PROFESSIONAL', createdAt: new Date().toISOString(), hasPassword: true, googleLinked: false,
    workingLocation: 'Montevideo', description: '', published: false, rating: null, expertiseTrades: [], emailNotifications: true
  };
}

async function openProfile(page: Page, savedPhone: string, countries: 'ok' | 'down' = 'ok') {
  const patches: Record<string, unknown>[] = [];
  await mockVerifiedSession(page, { name: 'Juan Gomez', email: 'pro.tel@qa.test', role: 'PROFESSIONAL' });
  await blockExternalMaps(page);
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ json: professionalBody(savedPhone) }));
  // A professional's agenda is loaded with the session: unmocked, the fake token gets a 401 and logs out
  await page.route('**/api/v1/schedules?**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/professionals/me', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push(body);
    await route.fulfill({ json: professionalBody(String(body.phoneNumber ?? savedPhone)) });
  });
  await page.route('https://cdn.jsdelivr.net/npm/world-countries@*/**', (route) => countries === 'down' ? route.abort() : route.fulfill({ json: [
    country('UY', 'Uruguay', '+5', ['98']),
    country('AR', 'Argentina', '+5', ['4'])
  ] }));
  await page.route('https://flagcdn.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
  await page.addInitScript((token) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Juan Gomez', email: 'pro.tel@qa.test', role: 'PROFESSIONAL' }));
  }, fakeJwt());
  await page.goto('/profile/edit');
  return patches;
}

test('the saved phone shows its country and the rest, and a new prefix is saved with it', async ({ page }) => {
  const patches = await openProfile(page, '+541123456789');
  const prefix = page.getByRole('button', { name: /^Código de país/ });

  await expect(prefix).toHaveAccessibleName('Código de país: +54');
  await expect(page.locator('#profile-phone')).toHaveValue('1123456789');

  await prefix.click();
  await page.getByRole('option', { name: /Uruguay/ }).click();
  await page.locator('#profile-phone').fill('099 123 456');
  await page.getByRole('region', { name: 'Datos personales' }).getByRole('button', { name: 'Guardar cambios' }).click();

  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ phoneNumber: '+59899123456' });
});

test('a phone saved without a prefix opens as Uruguay and is not marked as changed', async ({ page }) => {
  const patches = await openProfile(page, '099123456');

  await expect(page.getByRole('button', { name: /^Código de país/ })).toHaveAccessibleName('Código de país: +598');
  await expect(page.locator('#profile-phone')).toHaveValue('099123456');
  await page.getByRole('region', { name: 'Datos personales' }).getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForTimeout(300);
  expect(patches).toHaveLength(0);
});

test('without the countries list the prefix is written by hand', async ({ page }) => {
  const patches = await openProfile(page, '+59899123456', 'down');
  const prefix = page.getByRole('textbox', { name: 'Código de país' });

  await expect(prefix).toHaveValue('+598');
  await expect(page.locator('#profile-phone')).toHaveValue('99123456');
  await prefix.fill('+54');
  await page.locator('#profile-phone').fill('1123456789');
  await page.getByRole('region', { name: 'Datos personales' }).getByRole('button', { name: 'Guardar cambios' }).click();

  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ phoneNumber: '+541123456789' });
});
