import { test, expect, type Page } from '@playwright/test';
import { blockExternalMaps, fakeJwt, mockVerifiedSession } from '../support/ui';

async function openProfile(page: Page) {
  await mockVerifiedSession(page, { name: 'Carla Cliente', email: 'carla@qa.test' });
  await blockExternalMaps(page);
  await page.addInitScript(token => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Carla Cliente', email: 'carla@qa.test', role: 'CLIENT' }));
  }, fakeJwt());
  await page.goto('/profile/edit');
  await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
  return page.getByRole('region', { name: 'Avisos por correo' });
}

test('the emails about requests start on, and switching them off saves it right away', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/v1/users/me/notifications', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { id: '33333333-3333-3333-3333-333333333333', name: 'Carla Cliente', email: 'carla@qa.test',
      role: 'CLIENT', hasPassword: true, googleLinked: false, emailNotifications: false } });
  });
  const section = await openProfile(page);
  const toggle = section.getByRole('switch', { name: /Recibir avisos por correo/ });

  await expect(toggle).toBeChecked();
  await toggle.uncheck();

  await expect(section.getByText('Listo: ya no vas a recibir avisos por correo.')).toBeVisible();
  await expect(toggle).not.toBeChecked();
  expect(sent).toEqual({ emailNotifications: false });
});

test('if saving fails the switch goes back to how it was and says why', async ({ page }) => {
  await page.route('**/api/v1/users/me/notifications', route => route.fulfill({ status: 503, json: { error: 'Servicio no disponible' } }));
  const section = await openProfile(page);
  const toggle = section.getByRole('switch', { name: /Recibir avisos por correo/ });

  await toggle.click();

  await expect(section.getByRole('alert')).toContainText('Servicio no disponible');
  await expect(toggle).toBeChecked();
});
