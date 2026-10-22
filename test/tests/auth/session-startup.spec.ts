import { test, expect, type Page } from '@playwright/test';
import { fakeJwt, mockHomeApi } from '../support/ui';

async function setup(page: Page, token: string | null) {
  await page.addInitScript(token => {
    // Seed once: logout/navigation must not put the old credentials back.
    if (sessionStorage.getItem('session-seeded')) return;
    sessionStorage.setItem('session-seeded', '1');
    if (token) {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({ id: 'client-id', name: 'Ana', email: 'ana@qa.test', role: 'CLIENT' }));
    }
  }, token);
  await mockHomeApi(page);
  await page.route('**/api/v1/auth/verify', route => route.fulfill({ json: { verified: true } }));
}

test('home waits for delayed renewal and uses the same session when opening a professional', async ({ page }) => {
  await setup(page, fakeJwt(-60));
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let refreshes = 0;
  await page.route('**/api/v1/auth/refresh', async route => {
    refreshes++;
    await wait;
    await route.fulfill({ json: { token: fakeJwt(), id: 'client-id', name: 'Ana', email: 'ana@qa.test', role: 'CLIENT' } });
  });
  await page.route('**/api/v1/professionals/search?**', route => route.fulfill({ json: { totalPages: 1, content: [{
    id: 'pro-id', name: 'Electricista QA', description: 'Servicios', profileImageUrl: null, workingLocation: '', rating: null, expertiseTrades: [],
  }] } }));
  await page.route('**/api/v1/professionals/pro-id', route => route.fulfill({ json: {
    id: 'pro-id', name: 'Electricista QA', description: 'Servicios', profileImageUrl: null, workingLocation: '', rating: null, expertiseTrades: [],
  } }));
  await page.route('**/api/v1/schedules?**', route => route.fulfill({ json: [] }));
  await page.route('**/reviews?**', route => route.fulfill({ json: { content: [], totalElements: 0, last: true, number: 0 } }));
  await page.goto('/');
  await expect(page.getByText('Comprobando sesión...')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Iniciar sesión', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: 'Perfil', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Electricista QA', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Perfil', exact: true })).toBeVisible();
  expect(refreshes).toBe(1);
});

test('a confirmed session bypasses the login form', async ({ page }) => {
  await setup(page, fakeJwt());
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Perfil', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Correo electrónico' })).toHaveCount(0);
});

test('a dead refresh session becomes anonymous and is not recovered by opening a profile', async ({ page }) => {
  await setup(page, fakeJwt(-60));
  let refreshes = 0;
  await page.route('**/api/v1/auth/refresh', route => { refreshes++; return route.fulfill({ status: 401, json: {} }); });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
  await page.goto('/profesionales/pro-id');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(refreshes).toBe(1);
});

test('a network failure preserves credentials and retry can recover the session', async ({ page }) => {
  const oldToken = fakeJwt(-60);
  await setup(page, oldToken);
  let requests = 0;
  await page.route('**/api/v1/auth/refresh', route => {
    requests++;
    return requests === 1 ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { token: fakeJwt(), id: 'client-id', name: 'Ana', role: 'CLIENT' } });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('No pudimos comprobar tu sesión');
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBe(oldToken);
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Perfil', exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test('logout stays anonymous after reload even if a refresh cookie could still answer', async ({ page }) => {
  await setup(page, fakeJwt());
  let refreshes = 0;
  await page.route('**/api/v1/auth/refresh', route => { refreshes++; return route.fulfill({ json: { token: fakeJwt(), id: 'client-id', name: 'Ana', role: 'CLIENT' } }); });
  await page.route('**/api/v1/auth/logout', route => route.fulfill({ status: 204 }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Perfil', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(refreshes).toBe(0);
});

test('a revoked fresh access token is checked before displaying the authenticated home', async ({ page }) => {
  await setup(page, fakeJwt());
  await page.route('**/api/v1/auth/verify', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
});
