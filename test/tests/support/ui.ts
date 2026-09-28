import type { Page } from '@playwright/test';

/**
 * Unsigned JWT for UI tests. The frontend only reads `exp` to decide if the session
 * looks alive; the backend rejects it, so pages that call the API need mockVerifiedSession.
 */
export function fakeJwt(expiresInSeconds = 3600) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'RS256' })}.${encode({ sub: 'qa-ui-user', iat: now, exp: now + expiresInSeconds })}.firma-invalida`;
}

/**
 * Home loads trades and professionals on mount. With a fakeJwt stored, the real backend answers
 * 401 to those calls and the frontend expires the session, so UI tests with a session mock them.
 */
export async function mockHomeApi(page: Page) {
  await page.route('**/api/v1/trades', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]'
  }));
  await page.route('**/api/v1/professionals/search**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ content: [], totalPages: 0 })
  }));
}

/**
 * The frontend under test is started with a Google Client ID, so its login and register pages
 * load Google's script. Cases that don't test Google swap it for an inert one, so the suite
 * never depends on reaching accounts.google.com.
 */
export async function blockGoogleIdentity(page: Page) {
  await page.route('https://accounts.google.com/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.google = { accounts: { id: { initialize() {}, renderButton() {} } } };'
  }));
}

/**
 * The register form of a professional shows a map, which asks OpenStreetMap for its tiles. Cases that
 * don't test the map answer them with a blank one, so the suite never depends on reaching it (nor
 * loads its servers from CI).
 */
export async function blockExternalMaps(page: Page) {
  const blank = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: blank }));
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '[]'
  }));
  await page.route('https://photon.komoot.io/**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ type: 'FeatureCollection', features: [] })
  }));
}

export interface MockedUser {
  name: string;
  email: string;
  role?: 'CLIENT' | 'PROFESSIONAL';
  /** False for an account created with Google. */
  hasPassword?: boolean;
  googleLinked?: boolean;
}

export async function mockVerifiedSession(page: Page, user: MockedUser) {
  await mockHomeApi(page);
  await page.route('**/api/v1/auth/verify', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      verified: true,
      emittedDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 3_600_000).toISOString()
    })
  }));
  await page.route('**/api/v1/users/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: '33333333-3333-3333-3333-333333333333',
      name: user.name,
      email: user.email,
      phoneNumber: null,
      profileImageUrl: null,
      role: user.role ?? 'CLIENT',
      createdAt: new Date().toISOString(),
      hasPassword: user.hasPassword ?? true,
      googleLinked: user.googleLinked ?? false
    })
  }));
}
