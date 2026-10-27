import { test, expect, type Locator, type Page } from '@playwright/test';
import { blockExternalMaps, mockProfileViewer } from '../support/ui';

const profileId = '66666666-6666-4666-8666-666666666666';

function professional(trades: { tradeId: number; tradeName: string }[]) {
  return {
    id: profileId, name: 'Elena Electricista', profileImageUrl: null, workingLocation: 'Pocitos, Montevideo',
    description: 'Instalaciones y reparaciones eléctricas.', rating: null, serviceArea: null,
    expertiseTrades: trades.map((trade, index) => ({ id: index + 1, ...trade, minimumHourlyWage: 500, maximumHourlyWage: 900 })),
  };
}

const twoTrades = [{ tradeId: 3, tradeName: 'Electricidad' }, { tradeId: 5, tradeName: 'Plomería' }];

async function openProfile(page: Page, trades: { tradeId: number; tradeName: string }[], query = '') {
  await mockProfileViewer(page);
  await blockExternalMaps(page);
  await page.route(`**/api/v1/professionals/${profileId}`, route => route.fulfill({ json: professional(trades) }));
  await page.goto(`/profesionales/${profileId}${query}`);
  await expect(page.getByRole('heading', { name: 'Elena Electricista' })).toBeVisible();
}

/** The timeframe the client asks for: a week from now, so it's always in the future. */
async function fillWhen(dialog: Locator) {
  const day = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  await dialog.getByLabel('Fecha').fill(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
  await dialog.getByLabel('Desde').fill('09:00');
  await dialog.getByLabel('Hasta').fill('11:00');
}

test('"Solicitar servicio" works without choosing a service first: it is chosen in the request', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/v1/job-requests', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: 90, status: 'PROPOSED', confirmationPin: '482731' } });
  });
  await openProfile(page, twoTrades);

  const request = page.getByRole('button', { name: 'Solicitar servicio' });
  await expect(request).toBeEnabled();
  await request.click();

  const dialog = page.getByRole('dialog', { name: 'Solicitar servicio' });
  const trade = dialog.getByLabel('Oficio');
  await expect(trade).toHaveValue('0');
  await expect(trade.locator('option:checked')).toHaveText('Elegí un servicio');

  await dialog.getByLabel(/¿Dónde se realizará el trabajo\?/).fill('Av. Brasil 2500');
  await dialog.getByLabel(/Monto del servicio/).fill('1200');
  await fillWhen(dialog);
  await dialog.getByLabel('Descripción').fill('Cambiar un tomacorriente');
  await dialog.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(dialog.getByText('Seleccioná un oficio.')).toBeVisible();
  expect(sent).toBeNull();

  await trade.selectOption({ label: 'Plomería' });
  await dialog.getByRole('button', { name: 'Enviar solicitud' }).click();

  // Once sent, the dialog is titled after it
  const success = page.getByRole('dialog', { name: 'Solicitud enviada' });
  await expect(success).toBeVisible();
  await expect(success).not.toContainText('482731');
  await expect(success.getByRole('button', { name: 'Copiar PIN' })).toHaveCount(0);
  await expect(success.getByRole('button', { name: 'Ver mis solicitudes' })).toBeVisible();
  expect(sent).toMatchObject({ professionalId: profileId, tasks: [{ tradeId: 5, description: 'Cambiar un tomacorriente' }] });
  expect(sent).toHaveProperty('startTimestamp');
});

test('a service chosen on the profile comes already selected in the request', async ({ page }) => {
  await openProfile(page, twoTrades, '?tradeId=3');

  await page.getByRole('button', { name: 'Solicitar servicio' }).click();

  await expect(page.getByRole('dialog', { name: 'Solicitar servicio' }).getByLabel('Oficio')).toHaveValue('3');
});

test('with a single service, it is the one selected', async ({ page }) => {
  await openProfile(page, [{ tradeId: 3, tradeName: 'Electricidad' }]);

  await page.getByRole('button', { name: 'Solicitar servicio' }).click();

  await expect(page.getByRole('dialog', { name: 'Solicitar servicio' }).getByLabel('Oficio')).toHaveValue('3');
});

test('a professional without services cannot be asked for one', async ({ page }) => {
  await openProfile(page, []);

  await expect(page.getByRole('button', { name: 'Solicitar servicio' })).toBeDisabled();
});

test('the job location gets the same help as a professional\'s zone: suggestions and a map', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/v1/job-requests', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: 91, status: 'PROPOSED', confirmationPin: '111222' } });
  });
  await openProfile(page, [{ tradeId: 3, tradeName: 'Electricidad' }]);
  // Registered after openProfile's blank answers, so these are the ones that reply
  await page.route('https://photon.komoot.io/api/**', route => route.fulfill({
    contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ type: 'FeatureCollection', features: [{
      type: 'Feature', geometry: { type: 'Point', coordinates: [-56.188, -34.9045] },
      properties: { countrycode: 'UY', type: 'house', osm_key: 'place', street: 'Avenida 18 de Julio', housenumber: '1234', district: 'Cordón', city: 'Montevideo', state: 'Montevideo' },
    }] }),
  }));

  await page.getByRole('button', { name: 'Solicitar servicio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar servicio' });
  await expect(dialog.getByRole('region', { name: 'Mapa para elegir dónde se realizará el trabajo' })).toBeVisible();

  const location = dialog.getByLabel(/¿Dónde se realizará el trabajo\?/);
  await location.fill('18 de Julio 1234');
  const suggestion = dialog.getByRole('list', { name: 'Lugares encontrados' }).getByRole('button').first();
  const chosen = (await suggestion.locator('strong').textContent())!.trim();
  await suggestion.click();
  await expect(location).toHaveValue(chosen);
  await expect(dialog.getByRole('list', { name: 'Lugares encontrados' })).toHaveCount(0);

  // The recommended timeframe is optional: left blank, it isn't sent
  await dialog.getByLabel(/Monto del servicio/).fill('900');
  await dialog.getByLabel('Descripción').fill('Revisar el tablero');
  await dialog.getByRole('button', { name: 'Enviar solicitud' }).click();

  await expect(page.getByRole('dialog', { name: 'Solicitud enviada' })).toBeVisible();
  expect(sent).toMatchObject({ location: chosen });
  expect(sent).not.toHaveProperty('startTimestamp');
});
