import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  startProfessionalRegistration
} from '../support/registration';
import { mockProfessionalSearch, type MockSchedule } from '../support/professionalSearch';

const PASSWORD = 'ClaveSegura2026!';
const SEARCH_URL = `${API_BASE}/api/v1/professionals/search`;
const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';

interface Offer {
  tradeId: number;
  minimumHourlyWage: number;
  maximumHourlyWage: number;
}

function uniqueValue(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createPublishedProfessional(
  request: APIRequestContext,
  options: { name: string; workingLocation: string; offers: Offer[] }
) {
  const email = `${uniqueValue('professional.search').toLowerCase()}@qa.test`;
  const started = await startProfessionalRegistration(request, {
    name: options.name,
    email,
    password: PASSWORD,
    phoneNumber: '099123456',
    workingLocation: options.workingLocation
  });
  expect(started.status()).toBe(202);

  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  const auth = await verified.json();

  const profile = await request.patch(`${API_BASE}/api/v1/professionals/me`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      description: 'Perfil de prueba para búsqueda de profesionales.',
      workingLocation: options.workingLocation
    }
  });
  expect(profile.status()).toBe(200);

  for (const offer of options.offers) {
    const response = await request.post(`${API_BASE}/api/v1/professionals/me/expertise-trades`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: offer
    });
    expect(response.status()).toBe(201);
  }

  const published = await request.post(`${API_BASE}/api/v1/professionals/me/publish`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  expect(published.status()).toBe(200);

  return auth as { id: string; token: string };
}

async function getTrades(request: APIRequestContext) {
  const response = await request.get(`${API_BASE}/api/v1/trades`);
  expect(response.status()).toBe(200);
  const trades = await response.json();
  expect(trades.length).toBeGreaterThanOrEqual(2);
  return trades as { id: number; name: string }[];
}

function search(request: APIRequestContext, params: Record<string, string>) {
  return request.get(`${SEARCH_URL}?${new URLSearchParams(params)}`);
}

/** The trades, and a search over these professionals (and their free time) that answers like the backend. */
async function mockHomeSearch(page: Page, professionals: unknown[], schedules: MockSchedule[] = []) {
  await page.route('**/api/v1/trades', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 1, name: 'Electricista' },
      { id: 2, name: 'Plomería' }
    ])
  }));
  // The cards ask for each one's week too.
  await page.route('**/api/v1/schedules?**', (route) => {
    const professionalId = new URL(route.request().url()).searchParams.get('professionalId');
    return route.fulfill({ json: schedules.filter(schedule => schedule.professionalId === professionalId) });
  });
  return mockProfessionalSearch(page, professionals, schedules);
}

function electrician(id: string, name: string, minimumHourlyWage: number, maximumHourlyWage: number) {
  return {
    id,
    name,
    profileImageUrl: null,
    workingLocation: 'Montevideo',
    description: 'Servicio de electricidad.',
    rating: 8,
    expertiseTrades: [{
      id: `${id}-electricity`,
      tradeId: 1,
      tradeName: 'Electricista',
      minimumHourlyWage,
      maximumHourlyWage
    }]
  };
}

function plumber(id: string, name: string) {
  return {
    id,
    name,
    profileImageUrl: null,
    workingLocation: 'Montevideo',
    description: 'Servicio de plomería.',
    rating: 7,
    expertiseTrades: [{
      id: `${id}-plumbing`,
      tradeId: 2,
      tradeName: 'Plomería',
      minimumHourlyWage: 500,
      maximumHourlyWage: 700
    }]
  };
}

test.describe('Búsqueda y filtros de profesionales', () => {
  test('la búsqueda incluye los límites exactos del rango de precio', async ({ request }) => {
    const [trade] = await getTrades(request);
    const location = uniqueValue('QA-PRICE-BOUNDARY');
    const professional = await createPublishedProfessional(request, {
      name: 'Profesional Límite de Precio',
      workingLocation: location,
      offers: [{ tradeId: trade.id, minimumHourlyWage: 300, maximumHourlyWage: 700 }]
    });

    const atMaximum = await search(request, {
      tradeIds: String(trade.id), minPrice: '700', location, page: '0', size: '20'
    });
    expect(atMaximum.status()).toBe(200);
    expect((await atMaximum.json()).content.some((item: { id: string }) => item.id === professional.id)).toBeTruthy();

    const aboveMaximum = await search(request, {
      tradeIds: String(trade.id), minPrice: '700.01', location, page: '0', size: '20'
    });
    expect(aboveMaximum.status()).toBe(200);
    expect((await aboveMaximum.json()).content).toEqual([]);

    const atMinimum = await search(request, {
      tradeIds: String(trade.id), maxPrice: '300', location, page: '0', size: '20'
    });
    expect(atMinimum.status()).toBe(200);
    expect((await atMinimum.json()).content.some((item: { id: string }) => item.id === professional.id)).toBeTruthy();

    const belowMinimum = await search(request, {
      tradeIds: String(trade.id), maxPrice: '299.99', location, page: '0', size: '20'
    });
    expect(belowMinimum.status()).toBe(200);
    expect((await belowMinimum.json()).content).toEqual([]);
  });

  test('acepta varios oficios y aplica el precio al mismo oficio ofrecido', async ({ request }) => {
    const trades = await getTrades(request);
    const [lowerTrade, higherTrade] = trades;
    const location = uniqueValue('QA-MULTI-TRADE');
    const professional = await createPublishedProfessional(request, {
      name: 'Profesional Dos Oficios',
      workingLocation: location,
      offers: [
        { tradeId: lowerTrade.id, minimumHourlyWage: 100, maximumHourlyWage: 200 },
        { tradeId: higherTrade.id, minimumHourlyWage: 1000, maximumHourlyWage: 1500 }
      ]
    });

    const multiTradeParams = new URLSearchParams({ location, page: '0', size: '20' });
    multiTradeParams.append('tradeIds', String(lowerTrade.id));
    multiTradeParams.append('tradeIds', String(higherTrade.id));
    const multiTradeResponse = await request.get(`${SEARCH_URL}?${multiTradeParams}`);
    expect(multiTradeResponse.status()).toBe(200);
    expect((await multiTradeResponse.json()).content.some((item: { id: string }) => item.id === professional.id)).toBeTruthy();

    const mismatchedTradeAndPrice = await search(request, {
      tradeIds: String(lowerTrade.id), minPrice: '1000', maxPrice: '1200', location, page: '0', size: '20'
    });
    expect(mismatchedTradeAndPrice.status()).toBe(200);
    expect((await mismatchedTradeAndPrice.json()).content).toEqual([]);

    const matchingTradeAndPrice = await search(request, {
      tradeIds: String(higherTrade.id), minPrice: '1000', maxPrice: '1200', location, page: '0', size: '20'
    });
    expect(matchingTradeAndPrice.status()).toBe(200);
    expect((await matchingTradeAndPrice.json()).content.some((item: { id: string }) => item.id === professional.id)).toBeTruthy();
  });

  test('la paginación y el orden por nombre son estables', async ({ request }) => {
    const [trade] = await getTrades(request);
    const location = uniqueValue('QA-PAGINATION');
    const professionals = [];
    for (const name of ['QA Search Zeta', 'QA Search Alpha', 'QA Search Middle']) {
      professionals.push(await createPublishedProfessional(request, {
        name,
        workingLocation: location,
        offers: [{ tradeId: trade.id, minimumHourlyWage: 300, maximumHourlyWage: 700 }]
      }));
    }

    const firstPage = await search(request, {
      tradeIds: String(trade.id), location, page: '0', size: '2', sort: 'name,asc'
    });
    expect(firstPage.status()).toBe(200);
    const firstBody = await firstPage.json();
    expect(firstBody.totalElements).toBe(3);
    expect(firstBody.totalPages).toBe(2);
    expect(firstBody.content.map((item: { name: string }) => item.name)).toEqual([
      'QA Search Alpha',
      'QA Search Middle'
    ]);

    const secondPage = await search(request, {
      tradeIds: String(trade.id), location, page: '1', size: '2', sort: 'name,asc'
    });
    expect(secondPage.status()).toBe(200);
    const secondBody = await secondPage.json();
    expect(secondBody.content.map((item: { name: string }) => item.name)).toEqual(['QA Search Zeta']);
    expect(secondBody.content[0].id).toBe(professionals[0].id);
  });

  test('rechaza parámetros numéricos inválidos y rangos invertidos', async ({ request }) => {
    const invalidTrade = await search(request, { tradeIds: 'no-es-un-id' });
    expect(invalidTrade.status()).toBe(400);

    const invalidPrice = await search(request, { minPrice: 'precio-inválido' });
    expect(invalidPrice.status()).toBe(400);

    const invertedRange = await search(request, { minPrice: '900', maxPrice: '100' });
    expect(invertedRange.status()).toBe(400);
  });

  test('limpiar filtros desde el estado vacío restaura los resultados de la categoría', async ({ page }) => {
    await mockHomeSearch(page, [
      electrician('electrician-1', 'Ana Electricista', 350, 600),
      electrician('electrician-2', 'Bruno Electricista', 400, 700),
      plumber('plumber-1', 'Carla Plomera')
    ]);
    await page.goto(FRONTEND_BASE);
    await page.locator('.category-card').filter({ hasText: 'Electricista' }).click();
    await page.getByRole('button', { name: /filtros/i }).click();
    await page.getByLabel('Ciudad o barrio').fill('LocalidadSinResultados');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page.getByRole('heading', { name: 'No encontramos profesionales con estos filtros' })).toBeVisible();
    await page.locator('.professionals-empty').getByRole('button', { name: 'Limpiar filtros' }).click();

    await expect(page.locator('.professional-card')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Ana Electricista' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bruno Electricista' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Carla Plomera' })).toHaveCount(0);
  });

  test('cambiar de categoría no conserva el rango de precio de la categoría anterior', async ({ page }) => {
    await mockHomeSearch(page, [
      electrician('electrician-premium', 'Ana Electricista Premium', 850, 1000),
      electrician('electrician-budget', 'Bruno Electricista Económico', 200, 400),
      plumber('plumber-standard', 'Carla Plomera')
    ]);
    await page.goto(FRONTEND_BASE);
    await page.locator('.category-card').filter({ hasText: 'Electricista' }).click();
    await page.getByRole('button', { name: /filtros/i }).click();
    await page.getByLabel('Ingresar precio mínimo').fill('800');
    await page.getByLabel('Ingresar precio máximo').fill('900');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page.locator('.professional-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Ana Electricista Premium' })).toBeVisible();

    await page.locator('.category-card').filter({ hasText: 'Plomería' }).click();

    await expect(page.locator('.active-filters')).toHaveCount(0);
    await expect(page.locator('.professional-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Carla Plomera' })).toBeVisible();
  });

  test('el filtro de disponibilidad muestra solo a quien tiene horario libre en ese momento', async ({ page }) => {
    // Ana has a free block that is going on right now; Carla only a job already booked.
    const now = Date.now();
    const block = (id: number, professionalId: string, type: string) => ({
      id, professionalId, jobRequestId: null, type,
      startTimestamp: new Date(now - 60_000).toISOString(), endTimestamp: new Date(now + 30 * 60_000).toISOString()
    });
    const searches = await mockHomeSearch(page, [
      electrician('electrician-1', 'Ana Electricista', 350, 600),
      plumber('plumber-1', 'Carla Plomera')
    ], [block(1, 'electrician-1', 'URGENT_AVAILABLE'), block(2, 'plumber-1', 'SCHEDULED_JOB')]);
    await page.goto(FRONTEND_BASE);
    await expect(page.locator('.professional-card')).toHaveCount(2);

    await page.getByRole('button', { name: /filtros/i }).click();
    await page.getByRole('group', { name: 'Cuándo' }).getByRole('button', { name: 'Hoy' }).click();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page.locator('.professional-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Ana Electricista' })).toBeVisible();
    await expect(page.locator('.active-filters')).toContainText('Disponible hoy');
    // The server filters: from now to the end of today.
    const asked = searches.at(-1)!;
    expect(new Date(asked.get('availableFrom')!).getTime()).toBeLessThanOrEqual(Date.now());
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    expect(new Date(asked.get('availableTo')!).getTime()).toBe(midnight.getTime());

    await page.locator('.active-filters').getByRole('button', { name: /Disponible hoy/ }).click();
    await expect(page.locator('.professional-card')).toHaveCount(2);
  });

  test('en el calendario de disponibilidad se elige un rango de días', async ({ page }) => {
    // Ana is free in three days; Carla only today.
    const at = (days: number, hour: number) => { const date = new Date(); date.setDate(date.getDate() + days); date.setHours(hour, 0, 0, 0); return date; };
    const freeOn = (professionalId: string, days: number) => ({ professionalId, type: 'URGENT_AVAILABLE',
      startTimestamp: at(days, 0).toISOString(), endTimestamp: at(days, 23).toISOString() });
    await mockHomeSearch(page, [
      electrician('electrician-1', 'Ana Electricista', 350, 600),
      plumber('plumber-1', 'Carla Plomera')
    ], [freeOn('electrician-1', 3), freeOn('plumber-1', 0)]);
    await page.goto(FRONTEND_BASE);
    await expect(page.locator('.professional-card')).toHaveCount(2);

    await page.getByRole('button', { name: /filtros/i }).click();
    // The calendar is behind "Personalizar".
    await expect(page.locator('.date-range-calendar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Personalizar' }).click();
    const calendar = page.locator('.date-range-calendar');
    const tap = async (date: Date) => {
      if (date.getMonth() !== new Date().getMonth()) await calendar.getByRole('button', { name: 'Mes siguiente' }).click();
      await calendar.locator('.date-range-calendar__grid button:not([disabled])', { hasText: new RegExp(`^${date.getDate()}$`) }).click();
    };
    // From tomorrow to four days ahead: Ana's day is inside, Carla's (today) is not.
    await tap(at(1, 12));
    await tap(at(4, 12));
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(calendar).toHaveCount(0);
    // Closed, it shows the days chosen.
    await expect(page.getByRole('button', { name: /^Personalizar: / })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page.locator('.professional-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Ana Electricista' })).toBeVisible();
    await expect(page.locator('.active-filters')).toContainText('Disponible');
  });

  test('el inicio carga pocos profesionales y trae los siguientes al bajar', async ({ page }) => {
    const many = Array.from({ length: 30 }, (_, index) =>
      electrician(`electrician-${index}`, `Electricista ${String(index).padStart(2, '0')}`, 300 + index, 600 + index));
    const searches = await mockHomeSearch(page, many);
    await page.goto(FRONTEND_BASE);

    // Only the first page, not all of them. (The dev server's StrictMode mounts twice: page 0 may be asked twice.)
    const pagesAsked = () => [...new Set(searches.map(search => search.get('page')))];
    await expect(page.locator('.professional-card')).toHaveCount(12);
    await page.waitForTimeout(500);
    expect(pagesAsked()).toEqual(['0']);
    expect(searches[0].get('size')).toBe('12');

    await page.locator('.professional-card').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.professional-card')).toHaveCount(24);
    await page.locator('.professional-card').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.professional-card')).toHaveCount(30);
    await expect(page.getByRole('heading', { name: 'Electricista 29' })).toBeVisible();

    // Nothing left: no more pages are asked for.
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(500);
    expect(pagesAsked()).toEqual(['0', '1', '2']);
    expect(searches.filter(search => search.get('page') !== '0')).toHaveLength(2);
  });

  test('cambiar el orden vuelve a pedir la primera página ordenada por el servidor', async ({ page }) => {
    const searches = await mockHomeSearch(page, [
      electrician('electrician-1', 'Ana Electricista', 700, 900),
      electrician('electrician-2', 'Bruno Electricista', 300, 500)
    ]);
    await page.goto(FRONTEND_BASE);
    await expect(page.locator('.professional-card').first()).toContainText('Ana Electricista');

    await page.locator('.sort-control__trigger').click();
    await page.getByRole('option', { name: 'Menor precio' }).click();

    await expect(page.locator('.professional-card').first()).toContainText('Bruno Electricista');
    expect(searches.at(-1)!.get('order')).toBe('PRICE_ASC');
    expect(searches.at(-1)!.get('page')).toBe('0');
  });
});
