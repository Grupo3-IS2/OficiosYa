import { test, expect, type Locator, type Page } from '@playwright/test';
import { fakeJwt, mockVerifiedSession } from './support/ui';

/**
 * The zone picker in "Editar perfil", for a professional: it opens on the zone that is saved, choosing another
 * one fills the field, and saving sends it. The API, Nominatim (the saved zone), Photon (the suggestions) and the map's tiles are mocks.
 */

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const BLANK_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const montevideo = [{
  lat: '-34.9059',
  lon: '-56.1913',
  boundingbox: ['-34.9400', '-34.7000', '-56.4300', '-56.0200'],
  display_name: 'Montevideo, Uruguay',
  address: { city: 'Montevideo', state: 'Montevideo', country_code: 'uy' }
}];

const photonPando = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-55.9583, -34.7167] },
    properties: { name: 'Pando', type: 'city', osm_key: 'place', state: 'Canelones', countrycode: 'UY' }
  }]
};

function professionalBody(workingLocation: string) {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Juan Gomez',
    email: 'pro.zona@qa.test',
    phoneNumber: '099123456',
    profileImageUrl: null,
    role: 'PROFESSIONAL',
    createdAt: new Date().toISOString(),
    hasPassword: true,
    googleLinked: false,
    workingLocation,
    description: '',
    published: false,
    rating: null,
    expertiseTrades: []
  };
}

interface Mocks {
  searches: URL[];
  suggests: URL[];
  patches: Record<string, unknown>[];
  tiles: string[];
}

async function openEditProfile(page: Page, saved: string, searchAnswer: unknown): Promise<Mocks> {
  const mocks: Mocks = { searches: [], suggests: [], patches: [], tiles: [] };

  await mockVerifiedSession(page, { name: 'Juan Gomez', email: 'pro.zona@qa.test', role: 'PROFESSIONAL' });
  // Registered after the general one, so this is the one that answers.
  await page.route('**/api/v1/users/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(professionalBody(saved))
  }));
  await page.route('**/api/v1/professionals/me', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mocks.patches.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(professionalBody(String(body.workingLocation ?? saved)))
    });
  });
  await page.route('https://nominatim.openstreetmap.org/search**', (route) => {
    mocks.searches.push(new URL(route.request().url()));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(searchAnswer)
    });
  });
  await page.route('https://photon.komoot.io/api/**', (route) => {
    mocks.suggests.push(new URL(route.request().url()));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(photonPando)
    });
  });
  await page.route('https://tile.openstreetmap.org/**', (route) => {
    mocks.tiles.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: BLANK_TILE });
  });

  await page.goto(FRONTEND_BASE);
  await page.evaluate((token) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', name: 'Juan Gomez', email: 'pro.zona@qa.test', role: 'PROFESSIONAL' }));
  }, fakeJwt());
  await page.goto(`${FRONTEND_BASE}/profile/edit`);
  await expect(page.locator('#profile-working-location')).toHaveValue(saved);

  return mocks;
}

/** The zoom level the map is showing: the map publishes it in `data-zoom`. */
async function currentZoom(region: Locator): Promise<number> {
  return Number(await region.getAttribute('data-zoom'));
}

/** The zoom the map ended up at: it starts on the whole country and then moves to the zone. It is settled when two looks in a row agree. */
async function settledZoom(region: Locator): Promise<number> {
  let last = -1;
  await expect.poll(async () => {
    const zoom = await currentZoom(region);
    const settled = zoom === last;
    last = zoom;
    return settled;
  }, { intervals: [400], timeout: 8_000, message: 'the map never settled' }).toBe(true);
  return last;
}

/** One click on a zoom button and the wait for it to finish: Leaflet ignores a click while the last zoom is animating. */
async function zoomWith(region: Locator, button: 'Zoom in' | 'Zoom out', expected: number) {
  await region.getByRole('button', { name: button }).click();
  await expect.poll(() => currentZoom(region)).toBe(expected);
  await expect(region.locator('.leaflet-map-pane')).not.toHaveClass(/leaflet-zoom-anim/);
}

/** Lets the page's clock run on, so a timer that would have fired (a search after the typing pause) has: nothing here really waits. */
async function letTimeRun(page: Page, ms: number) {
  await page.clock.runFor(ms);
  // A round trip with the page: what it sent while the clock ran has been seen by the mocks by now.
  await page.evaluate(() => undefined);
}

const picker = (page: Page) => page.getByRole('region', { name: 'Mapa para elegir tu zona de trabajo' });

test.describe('Elegir la zona en el mapa al editar el perfil', () => {
  test('UI: el mapa se abre sobre la zona guardada, con el zoom y solo el crédito de OpenStreetMap', async ({ page }) => {
    await page.clock.install();
    const mocks = await openEditProfile(page, 'Montevideo', montevideo);

    await expect(picker(page).locator('.zone-pin')).toBeVisible();
    await expect(picker(page).getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(picker(page).locator('.leaflet-control-attribution')).toHaveText('© OpenStreetMap');
    // It looked the saved zone up once, without anyone asking.
    expect(mocks.searches).toHaveLength(1);
    expect(mocks.searches[0].searchParams.get('q')).toBe('Montevideo');
    // And the field is as it was saved: the saved zone is not something typed, so nothing is suggested for it.
    await expect(page.locator('#profile-working-location')).toHaveValue('Montevideo');
    await letTimeRun(page, 1_000);
    expect(mocks.suggests).toHaveLength(0);
    await expect(page.getByRole('list', { name: 'Lugares encontrados' })).toHaveCount(0);
  });

  test('UI: elegir otra zona en el mapa llena el campo, y al guardar se manda esa zona', async ({ page }) => {
    const mocks = await openEditProfile(page, 'Montevideo', montevideo);
    await expect(picker(page).locator('.zone-pin')).toBeVisible();

    await page.locator('#profile-working-location').fill('pando');
    await page.getByRole('list', { name: 'Lugares encontrados' }).getByRole('button', { name: /Pando, Canelones/ }).click();

    await expect(page.locator('#profile-working-location')).toHaveValue('Pando, Canelones');
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Perfil profesional' }) });
    await section.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(section.getByText('Perfil profesional actualizado.')).toBeVisible();
    expect(mocks.patches).toHaveLength(1);
    expect(mocks.patches[0]).toEqual({ workingLocation: 'Pando, Canelones' });
  });

  test('UI: el mapa de editar el perfil también se acerca y se aleja', async ({ page }) => {
    await openEditProfile(page, 'Montevideo', montevideo);
    await expect(picker(page).locator('.zone-pin')).toBeVisible();
    const start = await settledZoom(picker(page));

    await zoomWith(picker(page), 'Zoom in', start + 1);
    await zoomWith(picker(page), 'Zoom out', start);
    await zoomWith(picker(page), 'Zoom out', start - 1);

    await expect.poll(() => currentZoom(picker(page))).toBe(start - 1);
  });

  test('UI: la rueda del mouse acerca el mapa de editar el perfil', async ({ page }) => {
    await openEditProfile(page, 'Montevideo', montevideo);
    await expect(picker(page).locator('.zone-pin')).toBeVisible();
    const start = await settledZoom(picker(page));

    await picker(page).hover();
    await page.mouse.wheel(0, -240);

    await expect.poll(() => currentZoom(picker(page))).toBeGreaterThan(start);
  });

  test('UI: si la zona guardada no se encuentra, el mapa queda en Uruguay y el campo no se toca', async ({ page }) => {
    await openEditProfile(page, 'Zona inventada', []);

    await expect(picker(page)).toBeVisible();
    await expect(picker(page).locator('.zone-pin')).toHaveCount(0);
    await expect(page.locator('#profile-working-location')).toHaveValue('Zona inventada');
  });
});
