import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * The map of a professional's zone, from OpenStreetMap. Nominatim (the search that turns the zone's
 * text into coordinates) and the map's tiles are replaced with mocks, so these cases do not depend on
 * reaching the internet; what they check is what the page asks for and how it answers.
 */

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';
const PROFESSIONAL_ID = '55555555-5555-5555-5555-555555555555';

const montevideo = [{
  lat: '-34.9059039',
  lon: '-56.1913569',
  boundingbox: ['-34.9400', '-34.7000', '-56.4300', '-56.0200']
}];

function professional(workingLocation: string) {
  return {
    id: PROFESSIONAL_ID,
    name: 'Juan Gomez',
    profileImageUrl: null,
    workingLocation,
    description: 'Electricista con diez años de experiencia.',
    rating: 4.5,
    expertiseTrades: []
  };
}

interface Mocks {
  searches: URL[];
  tiles: string[];
}

// A 1x1 transparent PNG: what the map's tiles are answered with.
const BLANK_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function mockProfile(page: Page, workingLocation: string, nominatim: { status: number; body: unknown | ((query: string) => unknown) }): Promise<Mocks> {
  const mocks: Mocks = { searches: [], tiles: [] };

  await page.route(`**/api/v1/professionals/${PROFESSIONAL_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(professional(workingLocation))
  }));
  await page.route('https://nominatim.openstreetmap.org/**', (route) => {
    mocks.searches.push(new URL(route.request().url()));
    return route.fulfill({
      status: nominatim.status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(typeof nominatim.body === 'function' ? nominatim.body(mocks.searches.at(-1)!.searchParams.get('q') ?? '') : nominatim.body)
    });
  });
  await page.route('https://tile.openstreetmap.org/**', (route) => {
    mocks.tiles.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: BLANK_TILE });
  });

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

const zoneSection = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'Zona donde trabaja' }) });
const mapOf = (page: Page) => zoneSection(page).getByRole('region', { name: /Mapa de la zona donde trabaja/ });

test.describe('Mapa de la zona de trabajo (OpenStreetMap)', () => {
  test('UI: la zona se busca en Nominatim y se muestra el mapa con su marcador', async ({ page }) => {
    const mocks = await mockProfile(page, 'Cordón, Montevideo', { status: 200, body: montevideo });

    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);

    await expect(mapOf(page)).toBeVisible();
    await expect(mapOf(page).locator('.zone-pin')).toBeVisible();
    await expect(mapOf(page).locator('img.leaflet-tile').first()).toBeAttached();
    expect(mocks.tiles.length).toBeGreaterThan(0);

    // What it asked Nominatim: that zone, one result, in Uruguay.
    expect(mocks.searches).toHaveLength(1);
    expect(mocks.searches[0].searchParams.get('q')).toBe('Cordón, Montevideo');
    expect(mocks.searches[0].searchParams.get('limit')).toBe('1');
    expect(mocks.searches[0].searchParams.get('countrycodes')).toBe('uy');
  });

  test('UI: el mapa es simple: solo el crédito de OpenStreetMap y los botones de zoom, sin enlaces de más', async ({ page }) => {
    await mockProfile(page, 'Cordón, Montevideo', { status: 200, body: montevideo });

    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);

    const map = mapOf(page);
    await expect(map).toBeVisible();
    // The credit that OpenStreetMap's licence asks for, and nothing else in it.
    const credit = map.locator('.leaflet-control-attribution');
    await expect(credit).toHaveText('© OpenStreetMap');
    await expect(credit.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    await expect(map).not.toContainText(/Report a problem|Donation|Website and API terms|Leaflet/i);
    // It can be zoomed, and it is not a frame of openstreetmap.org.
    await expect(map.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(map.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(zoneSection(page).locator('iframe')).toHaveCount(0);
  });

  test('UI: el mapa se puede acercar y alejar, y tocarlo no cambia la zona', async ({ page }) => {
    const mocks = await mockProfile(page, 'Cordón, Montevideo', { status: 200, body: montevideo });
    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);
    await expect(mapOf(page)).toBeVisible();
    await expect(mapOf(page).locator('.zone-pin')).toBeVisible();
    const start = await settledZoom(mapOf(page));

    await zoomWith(mapOf(page), 'Zoom in', start + 1);
    await zoomWith(mapOf(page), 'Zoom out', start);
    await zoomWith(mapOf(page), 'Zoom out', start - 1);


    // A map that is only shown: touching it looks around, it doesn't ask Nominatim for anything else.
    await mapOf(page).click({ position: { x: 100, y: 100 } });
    expect(mocks.searches).toHaveLength(1);
  });

  test('UI: la rueda del mouse acerca y aleja el mapa', async ({ page }) => {
    await mockProfile(page, 'Cordón, Montevideo', { status: 200, body: montevideo });
    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);
    await expect(mapOf(page).locator('.zone-pin')).toBeVisible();
    const start = await settledZoom(mapOf(page));

    await mapOf(page).hover();
    await page.mouse.wheel(0, -240);
    await expect.poll(() => currentZoom(mapOf(page))).toBeGreaterThan(start);
    const closer = await settledZoom(mapOf(page));

    await page.mouse.wheel(0, 480);
    await expect.poll(() => currentZoom(mapOf(page))).toBeLessThan(closer);
  });

  test('UI: una dirección con calle se busca completa, y si OpenStreetMap no la conoce se muestra el barrio', async ({ page }) => {
    const mocks = await mockProfile(page, 'Calle Inventada 99, Cordón, Montevideo', {
      status: 200,
      // Only the neighbourhood is known.
      body: (query: string) => (query === 'Cordón, Montevideo' ? montevideo : [])
    });

    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);

    await expect(mapOf(page).locator('.zone-pin')).toBeVisible();
    expect(mocks.searches.map((url) => url.searchParams.get('q'))).toEqual(['Calle Inventada 99, Cordón, Montevideo', 'Cordón, Montevideo']);
    // The address itself is still what is written above the map.
    await expect(zoneSection(page).getByText('Calle Inventada 99, Cordón, Montevideo')).toBeVisible();
  });

  test('UI: una zona que Nominatim no conoce muestra un aviso y no un mapa', async ({ page }) => {
    await mockProfile(page, 'Zona inventada', { status: 200, body: [] });

    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);

    await expect(zoneSection(page).getByText('No pudimos ubicar esta zona en el mapa.')).toBeVisible();
    await expect(mapOf(page)).toHaveCount(0);
    // The zone's own text is still there.
    await expect(zoneSection(page).getByText('Zona inventada')).toBeVisible();
  });

  test('UI: si Nominatim falla (por ejemplo por exceso de pedidos) avisa que no se pudo cargar', async ({ page }) => {
    await mockProfile(page, 'Cordón, Montevideo', { status: 429, body: {} });

    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);

    await expect(zoneSection(page).getByText('No pudimos cargar el mapa en este momento.')).toBeVisible();
    await expect(mapOf(page)).toHaveCount(0);
  });

  test('UI: la segunda visita a la misma zona sale de la memoria y no vuelve a buscar', async ({ page }) => {
    const mocks = await mockProfile(page, 'Cordón, Montevideo', { status: 200, body: montevideo });

    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);
    await expect(mapOf(page)).toBeVisible();
    await page.reload();
    await expect(mapOf(page)).toBeVisible();

    expect(mocks.searches).toHaveLength(1);
  });

  test('UI: sin zona informada no se busca nada', async ({ page }) => {
    const mocks = await mockProfile(page, '', { status: 200, body: montevideo });

    await page.goto(`${FRONTEND_BASE}/profesionales/${PROFESSIONAL_ID}`);

    await expect(zoneSection(page).getByText('La zona de trabajo todavía no fue informada.')).toBeVisible();
    expect(mocks.searches).toHaveLength(0);
  });
});
