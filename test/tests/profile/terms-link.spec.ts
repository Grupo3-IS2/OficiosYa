import { test, expect } from '@playwright/test';
import { blockExternalMaps, fakeJwt, mockSessionVerification, mockVerifiedSession } from '../support/ui';

test('edit profile links to the terms, which open in another tab', async ({ page, context }) => {
  // The new tab shares localStorage but does not inherit page.route handlers.
  await mockSessionVerification(context);
  await mockVerifiedSession(page, { name: 'Carla Cliente', email: 'carla@qa.test' });
  await blockExternalMaps(page);
  await page.addInitScript(token => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Carla Cliente', email: 'carla@qa.test', role: 'CLIENT' }));
  }, fakeJwt());
  await page.goto('/profile/edit');

  const section = page.getByRole('region', { name: 'Términos y condiciones' });
  const [termsPage] = await Promise.all([
    context.waitForEvent('page'),
    section.getByRole('link', { name: /Términos del servicio/ }).click()
  ]);
  await termsPage.waitForLoadState();

  await expect(termsPage).toHaveURL(/\/terminos$/);
  await expect(termsPage.getByRole('heading', { level: 1 })).toContainText('Términos y condiciones');
  await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).not.toBeNull();
});
