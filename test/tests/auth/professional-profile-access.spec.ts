import { test, expect } from '@playwright/test';
import { blockGoogleIdentity, fakeJwt, mockProfileViewer } from '../support/ui';

const profileId = '55555555-5555-4555-8555-555555555555';
const profilePath = `/profesionales/${profileId}`;

test.beforeEach(async ({ page }) => {
  await blockGoogleIdentity(page);
});

for (const session of ['absent', 'expired'] as const) {
  test(`a ${session} session redirects to login without loading the professional profile`, async ({ page }) => {
    let profileReads = 0;
    let verificationReads = 0;
    await page.route(`**/api/v1/professionals/${profileId}`, route => {
      profileReads++;
      return route.fulfill({ json: {} });
    });
    await page.route('**/api/v1/auth/verify', route => {
      verificationReads++;
      return route.fulfill({ json: { verified: true } });
    });
    if (session === 'expired') {
      await page.addInitScript(token => {
        if (window.location.pathname.startsWith('/profesionales/')) localStorage.setItem('oficiosya_token', token);
      }, fakeJwt(-60));
    }
    await page.goto(profilePath);
    await expect(page).toHaveURL(session === 'expired' ? /\/login\?expired=1$/ : /\/login$/);
    expect(profileReads).toBe(0);
    expect(verificationReads).toBe(0);
    await expect(page.getByRole('button', { name: 'Solicitar servicio' })).toHaveCount(0);
  });
}

test('a session rejected by the backend cannot open the profile and is cleared', async ({ page }) => {
  await mockProfileViewer(page);
  let profileReads = 0;
  await page.route(`**/api/v1/professionals/${profileId}`, route => {
    profileReads++;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/auth/verify', route => route.fulfill({ status: 401, json: { message: 'Sesión inválida' } }));
  await page.goto(profilePath);
  await expect(page).toHaveURL(/\/login\?expired=1$/);
  expect(profileReads).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
});

test('a verification outage shows an error without exposing the profile or discarding the session', async ({ page }) => {
  await mockProfileViewer(page);
  let profileReads = 0;
  await page.route(`**/api/v1/professionals/${profileId}`, route => {
    profileReads++;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/auth/verify', route => route.fulfill({ status: 503, json: { message: 'Unavailable' } }));
  await page.goto(profilePath);
  await expect(page.getByRole('alert')).toContainText('No pudimos verificar tu sesión');
  await expect(page).toHaveURL(new RegExp(`${profilePath}$`));
  expect(profileReads).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).not.toBeNull();
});

test('the profile loads only after the backend verifies the session', async ({ page }) => {
  await mockProfileViewer(page);
  let profileReads = 0;
  let releaseVerification!: () => void;
  const verificationReady = new Promise<void>(resolve => { releaseVerification = resolve; });
  await page.route('**/api/v1/auth/verify', async route => {
    await verificationReady;
    await route.fulfill({ json: { verified: true } });
  });
  await page.route(`**/api/v1/professionals/${profileId}`, route => {
    profileReads++;
    return route.fulfill({ json: {
      id: profileId, name: 'Profesional protegido', profileImageUrl: null, workingLocation: '',
      description: 'Perfil de prueba', rating: null, expertiseTrades: [],
    } });
  });
  await page.goto(profilePath);
  await expect(page.getByText('Verificando sesión...')).toBeVisible();
  expect(profileReads).toBe(0);
  releaseVerification();
  await expect(page.getByRole('heading', { name: 'Profesional protegido' })).toBeVisible();
  expect(profileReads).toBeGreaterThan(0);
});
