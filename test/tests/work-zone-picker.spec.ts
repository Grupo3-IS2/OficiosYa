import { test, expect, type Locator, type Page } from '@playwright/test';
import { blockGoogleIdentity } from './support/ui';

/**
 * Choosing the zone on the map while registering as a professional. Photon (the suggestions while typing),
 * Nominatim (the point tapped on the map) and the map's tiles are mocks, so these cases don't need the
 * internet: they check what the form asks for, what it puts in the location field and what it sends when
 * the account is registered.
 */

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';

const BLANK_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const cordon = {
  lat: '-34.9016',
  lon: '-56.1779',
  boundingbox: ['-34.9100', '-34.8950', '-56.1900', '-56.1650'],
  display_name: 'Cordón, Montevideo, Municipio B, Departamento de Montevideo, 11200, Uruguay',
  address: { suburb: 'Cordón', city: 'Montevideo', municipality: 'Municipio B', state: 'Departamento de Montevideo', country_code: 'uy' }
};

const avenida = {
  lat: '-34.9045',
  lon: '-56.1880',
  boundingbox: ['-34.90455', '-34.90445', '-56.18805', '-56.18795'],
  display_name: '1234, Avenida 18 de Julio, Cordón, Montevideo, Municipio B, 11200, Uruguay',
  address: { house_number: '1234', road: 'Avenida 18 de Julio', suburb: 'Cordón', city: 'Montevideo', state: 'Departamento de Montevideo', country_code: 'uy' }
};

// What Photon suggests: GeoJSON, coordinates as [lon, lat], extent as [west, north, east, south].
const photon = (properties: Record<string, unknown>, coordinates = [-56.1779, -34.9016]) =>
  ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { countrycode: 'UY', ...properties } });
const suggestions = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

const photonCordon = photon({ name: 'Cordón', type: 'other', osm_key: 'place', city: 'Montevideo', state: 'Montevideo', extent: [-56.19, -34.895, -56.165, -34.91] });
const photonCordonCanelones = photon({ name: 'Cordón', type: 'district', osm_key: 'place', city: 'Barros Blancos', state: 'Canelones' }, [-56.0, -34.6]);
const photonAvenida = photon({ type: 'house', osm_key: 'place', street: 'Avenida 18 de Julio', housenumber: '1234', district: 'Cordón', city: 'Montevideo', state: 'Montevideo' }, [-56.188, -34.9045]);

interface Mocks {
  suggests: URL[];
  reverses: URL[];
  tiles: string[];
}

async function mockMaps(page: Page, answers: { suggest?: unknown; reverse?: unknown; status?: number }): Promise<Mocks> {
  const mocks: Mocks = { suggests: [], reverses: [], tiles: [] };
  const status = answers.status ?? 200;
  const answer = (body: unknown) => ({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  });

  await page.route('https://photon.komoot.io/api/**', (route) => {
    mocks.suggests.push(new URL(route.request().url()));
    return route.fulfill(answer(answers.suggest ?? suggestions()));
  });
  await page.route('https://nominatim.openstreetmap.org/search**', (route) => route.fulfill(answer([])));
  await page.route('https://nominatim.openstreetmap.org/reverse**', (route) => {
    mocks.reverses.push(new URL(route.request().url()));
    return route.fulfill(answer(answers.reverse ?? {}));
  });
  await page.route('https://tile.openstreetmap.org/**', (route) => {
    mocks.tiles.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: BLANK_TILE });
  });

  return mocks;
}

async function openProfessionalForm(page: Page) {
  await page.goto(`${FRONTEND_BASE}/register`);
  await page.locator('.account-type').nth(1).click();
  await expect(page.locator('#register-location')).toBeVisible();
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
const suggestedPlaces = (page: Page) => page.getByRole('list', { name: 'Lugares encontrados' });

test.describe('Elegir la zona en el mapa al registrarse', () => {
  test.beforeEach(async ({ page }) => blockGoogleIdentity(page));

  test('UI: un profesional ve el mapa bajo el campo de ubicación, con el zoom y solo el crédito de OpenStreetMap', async ({ page }) => {
    await mockMaps(page, {});

    await openProfessionalForm(page);

    await expect(picker(page)).toBeVisible();
    await expect(picker(page).locator('.leaflet-control-zoom')).toBeVisible();
    await expect(picker(page).locator('.leaflet-control-attribution')).toHaveText('© OpenStreetMap');
    await expect(picker(page)).not.toContainText(/Report a problem|Donation|Website and API terms|Leaflet/i);
  });

  test('UI: el mapa se puede acercar y alejar', async ({ page }) => {
    const mocks = await mockMaps(page, {});
    await openProfessionalForm(page);
    await expect(picker(page)).toBeVisible();
    const start = await settledZoom(picker(page));

    await zoomWith(picker(page), 'Zoom in', start + 1);
    await zoomWith(picker(page), 'Zoom out', start);
    await zoomWith(picker(page), 'Zoom out', start - 1);

  });

  test('UI: la rueda del mouse acerca y aleja el mapa', async ({ page }) => {
    await mockMaps(page, {});
    await openProfessionalForm(page);
    await expect(picker(page)).toBeVisible();
    const start = await settledZoom(picker(page));

    await picker(page).hover();
    await page.mouse.wheel(0, -240);
    await expect.poll(() => currentZoom(picker(page))).toBeGreaterThan(start);
    const closer = await settledZoom(picker(page));

    await page.mouse.wheel(0, 480);
    await expect.poll(() => currentZoom(picker(page))).toBeLessThan(closer);
  });

  test('UI: una dirección se sugiere con la calle y el número, y al elegirla el mapa se acerca hasta la calle', async ({ page }) => {
    await mockMaps(page, { suggest: suggestions(photonAvenida) });
    await openProfessionalForm(page);

    await page.locator('#register-location').fill('18 de Julio 1234, Montevideo');

    await expect(suggestedPlaces(page)).toContainText('Avenida 18 de Julio 1234, Cordón, Montevideo');
    await suggestedPlaces(page).getByRole('button').click();

    await expect(page.locator('#register-location')).toHaveValue('Avenida 18 de Julio 1234, Cordón, Montevideo');
    await expect(picker(page).locator('.zone-pin')).toBeVisible();
    // A single address is close-up: street level, not the whole city.
    await expect.poll(() => currentZoom(picker(page))).toBeGreaterThanOrEqual(16);
  });

  test('UI: cuanto más cerca mira el mapa, más precisa es la dirección que se pide al tocarlo', async ({ page }) => {
    const mocks = await mockMaps(page, { suggest: suggestions(photonAvenida), reverse: avenida });
    await openProfessionalForm(page);

    // Far away: the neighbourhood.
    await picker(page).click({ position: { x: 150, y: 120 } });
    await expect(page.locator('#register-location')).not.toHaveValue('');
    expect(mocks.reverses[0].searchParams.get('zoom')).toBe('14');

    // Looking at a single address, at street level: the address.
    await page.locator('#register-location').fill('18 de Julio 1234');
    await suggestedPlaces(page).getByRole('button').click();
    await expect.poll(() => currentZoom(picker(page))).toBeGreaterThanOrEqual(16);
    await picker(page).click({ position: { x: 150, y: 120 } });

    await expect.poll(() => mocks.reverses.length).toBe(2);
    expect(mocks.reverses[1].searchParams.get('zoom')).toBe('18');
    await expect(page.locator('#register-location')).toHaveValue('Avenida 18 de Julio 1234, Cordón, Montevideo');
  });

  test('UI: un cliente no ve el mapa, porque no elige zona', async ({ page }) => {
    await mockMaps(page, {});
    await page.goto(`${FRONTEND_BASE}/register`);

    await expect(page.locator('#register-location')).toHaveCount(0);
    await expect(picker(page)).toHaveCount(0);
  });

  test('UI: sugiere mientras se escribe, pero no antes de tres letras ni una vez por tecla', async ({ page }) => {
    await page.clock.install();
    const mocks = await mockMaps(page, { suggest: suggestions(photonCordon) });
    await openProfessionalForm(page);

    await page.locator('#register-location').pressSequentially('Co');
    await letTimeRun(page, 1_000);
    expect(mocks.suggests).toHaveLength(0);

    // The rest is typed in one go: one search, for the whole text, after the pause.
    await page.locator('#register-location').pressSequentially('rdón, Montevideo');
    await expect(suggestedPlaces(page)).toBeVisible();
    expect(mocks.suggests).toHaveLength(1);
    const asked = mocks.suggests[0].searchParams;
    expect(asked.get('q')).toBe('Cordón, Montevideo');
    expect(asked.get('bbox')).toBe('-58.45,-35.0,-53.0,-30.0');
  });

  test('UI: al elegir una sugerencia el campo toma su nombre corto, el mapa marca el lugar y no se vuelve a buscar', async ({ page }) => {
    await page.clock.install();
    const mocks = await mockMaps(page, { suggest: suggestions(photonCordon) });
    await openProfessionalForm(page);

    await page.locator('#register-location').fill('cordon');
    await suggestedPlaces(page).getByRole('button', { name: /Cordón, Montevideo/ }).click();

    await expect(page.locator('#register-location')).toHaveValue('Cordón, Montevideo');
    await expect(picker(page).locator('.zone-pin')).toBeVisible();
    await expect(suggestedPlaces(page)).toHaveCount(0);
    // The name that was put in the field is not something typed: it is not searched.
    await letTimeRun(page, 1_000);
    expect(mocks.suggests).toHaveLength(1);
  });

  test('UI: con varias sugerencias las muestra con su dirección, y al elegir una el campo toma su nombre', async ({ page }) => {
    await mockMaps(page, { suggest: suggestions(photonCordon, photonCordonCanelones) });
    await openProfessionalForm(page);

    await page.locator('#register-location').fill('cordon');

    await expect(suggestedPlaces(page).getByRole('listitem')).toHaveCount(2);
    await expect(suggestedPlaces(page)).toContainText('Barros Blancos');
    // Nothing chosen yet.
    await expect(page.locator('#register-location')).toHaveValue('cordon');

    await suggestedPlaces(page).getByRole('button', { name: /Barros Blancos/ }).click();

    await expect(page.locator('#register-location')).toHaveValue('Cordón, Barros Blancos, Canelones');
    await expect(suggestedPlaces(page)).toHaveCount(0);
    await expect(picker(page).locator('.zone-pin')).toBeVisible();
  });

  test('UI: no sugiere lo que no es una zona: otros países ni comercios', async ({ page }) => {
    const abroad = photon({ name: 'Cordón', type: 'district', osm_key: 'place', city: 'Buenos Aires', countrycode: 'AR' });
    const shop = photon({ name: 'Cordón Carnes', type: 'house', osm_key: 'shop', street: 'Requena', housenumber: '1504', city: 'Montevideo' });
    await mockMaps(page, { suggest: suggestions(abroad, shop, photonCordon) });
    await openProfessionalForm(page);

    await page.locator('#register-location').fill('cordon');

    await expect(suggestedPlaces(page).getByRole('listitem')).toHaveCount(1);
    await expect(suggestedPlaces(page)).toContainText('Cordón, Montevideo');
  });

  test('UI: si no encuentra el lugar lo dice y sugiere cómo escribirlo', async ({ page }) => {
    await mockMaps(page, { suggest: suggestions() });
    await openProfessionalForm(page);

    await page.locator('#register-location').fill('zona inventada');

    await expect(page.getByText(/No encontramos ese lugar/)).toBeVisible();
    await expect(page.locator('#register-location')).toHaveValue('zona inventada');
  });

  test('UI: tocar el mapa marca el punto y el campo toma el nombre de la zona de ahí', async ({ page }) => {
    const mocks = await mockMaps(page, { reverse: cordon });
    await openProfessionalForm(page);

    await picker(page).click({ position: { x: 150, y: 120 } });

    await expect(page.locator('#register-location')).toHaveValue('Cordón, Montevideo');
    await expect(picker(page).locator('.zone-pin')).toBeVisible();
    expect(mocks.reverses).toHaveLength(1);
    expect(mocks.reverses[0].searchParams.get('zoom')).toBe('14');
    expect(Number(mocks.reverses[0].searchParams.get('lat'))).toBeLessThan(-29);
  });

  test('UI: un punto fuera de Uruguay se rechaza y el campo queda como estaba', async ({ page }) => {
    await mockMaps(page, { reverse: { ...cordon, address: { city: 'Buenos Aires', country_code: 'ar' } } });
    await openProfessionalForm(page);
    await page.locator('#register-location').fill('Mi zona');

    await picker(page).click({ position: { x: 150, y: 120 } });

    await expect(page.getByText('Elegí un lugar dentro de Uruguay.')).toBeVisible();
    await expect(page.locator('#register-location')).toHaveValue('Mi zona');
  });

  test('UI: si el servicio de búsqueda falla avisa, y se puede seguir escribiendo la zona a mano', async ({ page }) => {
    await mockMaps(page, { status: 429 });
    await openProfessionalForm(page);

    await page.locator('#register-location').fill('Cordón');

    await expect(page.getByRole('alert').filter({ hasText: 'No pudimos buscar en el mapa' })).toBeVisible();
    await page.locator('#register-location').fill('Cordón, Montevideo');
    await expect(page.locator('#register-location')).toHaveValue('Cordón, Montevideo');
  });

  test('UI: la zona elegida en el mapa es la que se manda al registrar al profesional', async ({ page }) => {
    await mockMaps(page, { suggest: suggestions(photonCordon) });
    let sent: Record<string, unknown> | null = null;
    await page.route('**/api/v1/auth/register-professional', async (route) => {
      sent = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'pro.mapa@qa.test', message: 'OK', codeLength: 6, expiresInSeconds: 900, resendCooldownSeconds: 60 })
      });
    });
    await openProfessionalForm(page);

    await page.locator('#register-name').fill('Profesional Mapa');
    await page.locator('#register-email').fill('pro.mapa@qa.test');
    await page.locator('#register-phone').fill('099123456');
    await page.locator('#register-location').fill('cordon');
    await suggestedPlaces(page).getByRole('button', { name: /Cordón, Montevideo/ }).click();
    await expect(page.locator('#register-location')).toHaveValue('Cordón, Montevideo');
    await page.locator('#register-password').fill('ClaveSegura2026!');
    await page.locator('#register-confirmation').fill('ClaveSegura2026!');
    await page.locator('.terms input').check();
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible();
    expect(sent).toMatchObject({ workingLocation: 'Cordón, Montevideo', phoneNumber: '099123456' });
  });
});
