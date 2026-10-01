import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  startProfessionalRegistration
} from '../support/registration';

const PASSWORD = 'ClaveSegura2026!';
const PROFESSIONALS_URL = `${API_BASE}/api/v1/professionals`;
const SEARCH_URL = `${PROFESSIONALS_URL}/search`;

interface Offer {
  tradeId: number;
  minimumHourlyWage: number;
  maximumHourlyWage: number;
}

function uniqueValue(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getTrades(request: APIRequestContext) {
  const response = await request.get(`${API_BASE}/api/v1/trades`);
  expect(response.status()).toBe(200);
  const trades = await response.json();
  expect(trades.length).toBeGreaterThanOrEqual(2);
  return trades as { id: number; name: string }[];
}

async function createProfessional(
  request: APIRequestContext,
  options: { workingLocation: string; offers: Offer[]; description?: string }
) {
  const email = `${uniqueValue('professional.profile').toLowerCase()}@qa.test`;
  const started = await startProfessionalRegistration(request, {
    name: 'Profesional QA Perfil',
    email,
    password: PASSWORD,
    phoneNumber: '099123456',
    workingLocation: options.workingLocation
  });
  expect(started.status()).toBe(202);

  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  const auth = await verified.json();

  const profileUpdate = await request.patch(`${PROFESSIONALS_URL}/me`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      description: options.description ?? 'Perfil profesional de prueba con datos completos.',
      workingLocation: options.workingLocation
    }
  });
  expect(profileUpdate.status()).toBe(200);

  let professionalProfile = await profileUpdate.json();
  for (const offer of options.offers) {
    const added = await request.post(`${PROFESSIONALS_URL}/me/expertise-trades`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: offer
    });
    expect(added.status()).toBe(201);
    professionalProfile = await added.json();
  }

  const published = await request.post(`${PROFESSIONALS_URL}/me/publish`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  expect(published.status()).toBe(200);
  professionalProfile = await published.json();

  return {
    id: auth.id as string,
    token: auth.token as string,
    expertiseTrades: professionalProfile.expertiseTrades as {
      id: number;
      tradeId: number;
      minimumHourlyWage: number;
      maximumHourlyWage: number;
    }[]
  };
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function search(request: APIRequestContext, params: Record<string, string>) {
  return request.get(`${SEARCH_URL}?${new URLSearchParams(params)}`);
}

test.describe('Perfil profesional: oficios, tarifas y publicación de cambios', () => {
  test('permite varios oficios, quitar uno conserva el otro y actualiza la búsqueda', async ({ request }) => {
    const [firstTrade, secondTrade] = await getTrades(request);
    const location = uniqueValue('QA-PROFILE-REMOVE-TRADE');
    const professional = await createProfessional(request, {
      workingLocation: location,
      offers: [
        { tradeId: firstTrade.id, minimumHourlyWage: 300, maximumHourlyWage: 500 },
        { tradeId: secondTrade.id, minimumHourlyWage: 600, maximumHourlyWage: 900 }
      ]
    });

    expect(professional.expertiseTrades.map((offer) => offer.tradeId).sort((a, b) => a - b))
      .toEqual([firstTrade.id, secondTrade.id].sort((a, b) => a - b));

    const removedOffer = professional.expertiseTrades.find((offer) => offer.tradeId === firstTrade.id)!;
    const removeResponse = await request.delete(`${PROFESSIONALS_URL}/me/expertise-trades/${removedOffer.id}`, {
      headers: authHeaders(professional.token)
    });
    expect(removeResponse.status()).toBe(200);
    expect((await removeResponse.json()).expertiseTrades.map((offer: { tradeId: number }) => offer.tradeId)).toEqual([secondTrade.id]);

    const publicProfileResponse = await request.get(`${PROFESSIONALS_URL}/${professional.id}`);
    expect(publicProfileResponse.status()).toBe(200);
    const publicProfile = await publicProfileResponse.json();
    expect(publicProfile.expertiseTrades.map((offer: { tradeId: number }) => offer.tradeId)).toEqual([secondTrade.id]);

    const removedTradeSearch = await search(request, {
      tradeIds: String(firstTrade.id), location, page: '0', size: '20'
    });
    expect(removedTradeSearch.status()).toBe(200);
    expect((await removedTradeSearch.json()).content).toEqual([]);

    const remainingTradeSearch = await search(request, {
      tradeIds: String(secondTrade.id), location, page: '0', size: '20'
    });
    expect(remainingTradeSearch.status()).toBe(200);
    expect((await remainingTradeSearch.json()).content.map((item: { id: string }) => item.id)).toEqual([professional.id]);
  });

  test('acepta tarifa cero y rechaza tarifas negativas al crear o actualizar un oficio', async ({ request }) => {
    const trades = await getTrades(request);
    const professional = await createProfessional(request, {
      workingLocation: uniqueValue('QA-PROFILE-ZERO-PRICE'),
      offers: [{ tradeId: trades[0].id, minimumHourlyWage: 0, maximumHourlyWage: 0 }]
    });
    const freeOffer = professional.expertiseTrades.find((offer) => offer.tradeId === trades[0].id)!;
    expect(freeOffer.minimumHourlyWage).toBe(0);
    expect(freeOffer.maximumHourlyWage).toBe(0);

    const negativeCreate = await request.post(`${PROFESSIONALS_URL}/me/expertise-trades`, {
      headers: authHeaders(professional.token),
      data: { tradeId: trades[1].id, minimumHourlyWage: -1, maximumHourlyWage: 0 }
    });
    expect(negativeCreate.status()).toBe(400);

    const negativeMinimum = await request.patch(`${PROFESSIONALS_URL}/me/expertise-trades/${freeOffer.id}`, {
      headers: authHeaders(professional.token),
      data: { minimumHourlyWage: -1 }
    });
    expect(negativeMinimum.status()).toBe(400);

    const negativeMaximum = await request.patch(`${PROFESSIONALS_URL}/me/expertise-trades/${freeOffer.id}`, {
      headers: authHeaders(professional.token),
      data: { maximumHourlyWage: -1 }
    });
    expect(negativeMaximum.status()).toBe(400);

    const zeroUpdate = await request.patch(`${PROFESSIONALS_URL}/me/expertise-trades/${freeOffer.id}`, {
      headers: authHeaders(professional.token),
      data: { minimumHourlyWage: 0, maximumHourlyWage: 0 }
    });
    expect(zeroUpdate.status()).toBe(200);
    const updatedOffer = (await zeroUpdate.json()).expertiseTrades.find((offer: { id: number }) => offer.id === freeOffer.id);
    expect(updatedOffer.minimumHourlyWage).toBe(0);
    expect(updatedOffer.maximumHourlyWage).toBe(0);
  });

  test('valida la descripción en los límites exactos de 20 y 500 caracteres', async ({ request }) => {
    const [trade] = await getTrades(request);
    const professional = await createProfessional(request, {
      workingLocation: uniqueValue('QA-PROFILE-DESCRIPTION'),
      offers: [{ tradeId: trade.id, minimumHourlyWage: 200, maximumHourlyWage: 500 }]
    });

    const tooShort = await request.patch(`${PROFESSIONALS_URL}/me`, {
      headers: authHeaders(professional.token),
      data: { description: 'x'.repeat(19) }
    });
    expect(tooShort.status()).toBe(400);

    const minimumLength = await request.patch(`${PROFESSIONALS_URL}/me`, {
      headers: authHeaders(professional.token),
      data: { description: 'x'.repeat(20) }
    });
    expect(minimumLength.status()).toBe(200);

    const maximumLength = await request.patch(`${PROFESSIONALS_URL}/me`, {
      headers: authHeaders(professional.token),
      data: { description: 'x'.repeat(500) }
    });
    expect(maximumLength.status()).toBe(200);
    expect((await maximumLength.json()).description).toHaveLength(500);

    const tooLong = await request.patch(`${PROFESSIONALS_URL}/me`, {
      headers: authHeaders(professional.token),
      data: { description: 'x'.repeat(501) }
    });
    expect(tooLong.status()).toBe(400);

    const publicProfileResponse = await request.get(`${PROFESSIONALS_URL}/${professional.id}`);
    expect((await publicProfileResponse.json()).description).toBe('x'.repeat(500));
  });

  test('los cambios de zona y precio aparecen inmediatamente en la búsqueda pública', async ({ request }) => {
    const [trade] = await getTrades(request);
    const previousLocation = uniqueValue('QA-PROFILE-OLD-LOCATION');
    const nextLocation = uniqueValue('QA-PROFILE-NEW-LOCATION');
    const professional = await createProfessional(request, {
      workingLocation: previousLocation,
      offers: [{ tradeId: trade.id, minimumHourlyWage: 300, maximumHourlyWage: 500 }]
    });
    const offer = professional.expertiseTrades[0];

    const beforeUpdate = await search(request, {
      tradeIds: String(trade.id), minPrice: '300', maxPrice: '500', location: previousLocation, page: '0', size: '20'
    });
    expect(beforeUpdate.status()).toBe(200);
    expect((await beforeUpdate.json()).content.map((item: { id: string }) => item.id)).toContain(professional.id);

    const locationUpdate = await request.patch(`${PROFESSIONALS_URL}/me`, {
      headers: authHeaders(professional.token),
      data: { workingLocation: nextLocation }
    });
    expect(locationUpdate.status()).toBe(200);

    const staleLocationSearch = await search(request, {
      tradeIds: String(trade.id), location: previousLocation, page: '0', size: '20'
    });
    expect(staleLocationSearch.status()).toBe(200);
    expect((await staleLocationSearch.json()).content).toEqual([]);

    const newLocationSearch = await search(request, {
      tradeIds: String(trade.id), location: nextLocation, page: '0', size: '20'
    });
    expect(newLocationSearch.status()).toBe(200);
    expect((await newLocationSearch.json()).content.map((item: { id: string }) => item.id)).toContain(professional.id);

    const priceUpdate = await request.patch(`${PROFESSIONALS_URL}/me/expertise-trades/${offer.id}`, {
      headers: authHeaders(professional.token),
      data: { minimumHourlyWage: 800, maximumHourlyWage: 1000 }
    });
    expect(priceUpdate.status()).toBe(200);

    const stalePriceSearch = await search(request, {
      tradeIds: String(trade.id), minPrice: '300', maxPrice: '500', location: nextLocation, page: '0', size: '20'
    });
    expect(stalePriceSearch.status()).toBe(200);
    expect((await stalePriceSearch.json()).content).toEqual([]);

    const updatedPriceSearch = await search(request, {
      tradeIds: String(trade.id), minPrice: '800', maxPrice: '1000', location: nextLocation, page: '0', size: '20'
    });
    expect(updatedPriceSearch.status()).toBe(200);
    expect((await updatedPriceSearch.json()).content.map((item: { id: string }) => item.id)).toContain(professional.id);
  });
});