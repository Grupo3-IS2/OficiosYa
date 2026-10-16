import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  startClientRegistration,
  startProfessionalRegistration
} from '../support/registration';

const PASSWORD = 'ClaveSegura2026!';
const SCHEDULES_URL = `${API_BASE}/api/v1/schedules`;

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

async function registerClient(request: APIRequestContext) {
  const email = uniqueEmail('agenda.cliente');
  const started = await startClientRegistration(request, {
    name: 'Cliente QA Agenda',
    email,
    password: PASSWORD
  });
  expect(started.status()).toBe(202);

  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  return verified.json();
}

async function registerProfessional(request: APIRequestContext, prefix = 'agenda.profesional') {
  const email = uniqueEmail(prefix);
  const started = await startProfessionalRegistration(request, {
    name: 'Profesional QA Agenda',
    email,
    password: PASSWORD,
    phoneNumber: '099123456',
    workingLocation: 'Montevideo'
  });
  expect(started.status()).toBe(202);

  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  const auth = await verified.json();

  const tradesResponse = await request.get(`${API_BASE}/api/v1/trades`);
  expect(tradesResponse.status()).toBe(200);
  const trades = await tradesResponse.json();
  expect(trades.length).toBeGreaterThan(0);

  const profile = await request.patch(`${API_BASE}/api/v1/professionals/me`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      description: 'Atención profesional para trabajos y reparaciones.',
      workingLocation: 'Montevideo'
    }
  });
  expect(profile.status()).toBe(200);

  const expertise = await request.post(`${API_BASE}/api/v1/professionals/me/expertise-trades`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      tradeId: trades[0].id,
      minimumHourlyWage: 350,
      maximumHourlyWage: 600
    }
  });
  expect(expertise.status()).toBe(201);

  const publish = await request.post(`${API_BASE}/api/v1/professionals/me/publish`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  expect(publish.status()).toBe(200);

  return { ...auth, tradeId: trades[0].id };
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function getAgenda(request: APIRequestContext, professionalId: string, params: Record<string, string> = {}, token?: string) {
  return request.get(SCHEDULES_URL, {
    headers: token ? authHeaders(token) : undefined,
    params: { professionalId, ...params }
  });
}

async function createAvailableBlock(
  request: APIRequestContext,
  token: string,
  startTimestamp: string,
  endTimestamp: string,
  type = 'URGENT_AVAILABLE'
): Promise<APIResponse> {
  return request.post(SCHEDULES_URL, {
    headers: authHeaders(token),
    data: { type, startTimestamp, endTimestamp }
  });
}

test.describe('Agenda profesional', () => {
  test('un visitante consulta disponibilidad pública por rango y se conservan los instantes con offsets distintos', async ({ request }) => {
    const professional = await registerProfessional(request);
    const includedStart = '2035-02-03T10:00:00-03:00';
    const includedEnd = '2035-02-03T11:00:00-03:00';
    const outsideStart = '2035-02-03T12:00:00-03:00';
    const outsideEnd = '2035-02-03T13:00:00-03:00';

    const included = await createAvailableBlock(request, professional.token, includedStart, includedEnd);
    expect(included.status()).toBe(201);
    const includedBlock = await included.json();

    const outside = await createAvailableBlock(request, professional.token, outsideStart, outsideEnd);
    expect(outside.status()).toBe(201);
    const outsideBlock = await outside.json();

    const response = await getAgenda(request, professional.id, {
      from: '2035-02-03T12:30:00Z',
      to: '2035-02-03T13:30:00Z'
    });

    expect(response.status()).toBe(200);
    const agenda = await response.json();
    expect(agenda.map((block: { id: number }) => block.id)).toEqual([includedBlock.id]);
    expect(Date.parse(agenda[0].startTimestamp)).toBe(Date.parse(includedStart));
    expect(Date.parse(agenda[0].endTimestamp)).toBe(Date.parse(includedEnd));
    expect(agenda[0].type).toBe('URGENT_AVAILABLE');
    expect(agenda[0].jobRequestId).toBeNull();
    expect(agenda[0]).not.toHaveProperty('clientId');
    expect(agenda[0]).not.toHaveProperty('location');
    expect(agenda[0]).not.toHaveProperty('paymentAmount');
    expect(outsideBlock.id).not.toBe(includedBlock.id);

    const withoutRange = await getAgenda(request, professional.id);
    expect(withoutRange.status()).toBe(200);
    expect((await withoutRange.json()).map((block: { id: number }) => block.id)).toEqual([
      includedBlock.id,
      outsideBlock.id
    ]);
  });

  test('solo el dueño puede editar o eliminar disponibilidad propia', async ({ request }) => {
    const owner = await registerProfessional(request, 'agenda.dueno');
    const otherProfessional = await registerProfessional(request, 'agenda.otro-profesional');
    const startTimestamp = '2035-03-04T09:00:00-03:00';
    const endTimestamp = '2035-03-04T10:00:00-03:00';

    const created = await createAvailableBlock(request, owner.token, startTimestamp, endTimestamp, 'USER_RESERVED');
    expect(created.status()).toBe(201);
    const block = await created.json();

    const anonymousCreate = await request.post(SCHEDULES_URL, {
      data: {
        type: 'URGENT_AVAILABLE',
        startTimestamp: '2035-03-04T11:00:00-03:00',
        endTimestamp: '2035-03-04T12:00:00-03:00'
      }
    });
    expect(anonymousCreate.status()).toBe(401);

    const forbiddenUpdate = await request.patch(`${SCHEDULES_URL}/${block.id}`, {
      headers: authHeaders(otherProfessional.token),
      data: { startTimestamp: '2035-03-04T10:00:00-03:00' }
    });
    expect(forbiddenUpdate.status()).toBe(403);

    const forbiddenDelete = await request.delete(`${SCHEDULES_URL}/${block.id}`, {
      headers: authHeaders(otherProfessional.token)
    });
    expect(forbiddenDelete.status()).toBe(403);

    const updated = await request.patch(`${SCHEDULES_URL}/${block.id}`, {
      headers: authHeaders(owner.token),
      data: { startTimestamp: '2035-03-04T09:30:00-03:00' }
    });
    expect(updated.status()).toBe(200);
    const updatedBlock = await updated.json();
    expect(Date.parse(updatedBlock.startTimestamp)).toBe(Date.parse('2035-03-04T09:30:00-03:00'));
    expect(Date.parse(updatedBlock.endTimestamp)).toBe(Date.parse(endTimestamp));
    expect(updatedBlock.type).toBe('USER_RESERVED');

    const deleted = await request.delete(`${SCHEDULES_URL}/${block.id}`, {
      headers: authHeaders(owner.token)
    });
    expect(deleted.status()).toBe(204);

    const agenda = await getAgenda(request, owner.id);
    expect(agenda.status()).toBe(200);
    expect(await agenda.json()).toEqual([]);
  });

  test('la reserva aceptada oculta su referencia al visitante y el dueño puede gestionarla por el flujo del trabajo', async ({ request }) => {
    const professional = await registerProfessional(request, 'agenda.reserva-profesional');
    const client = await registerClient(request);

    const createdJob = await request.post(`${API_BASE}/api/v1/job-requests`, {
      headers: authHeaders(client.token),
      data: {
        professionalId: professional.id,
        location: 'Montevideo',
        paymentAmount: 1200,
        tasks: [{ tradeId: professional.tradeId, description: 'Reparación de prueba para agenda' }]
      }
    });
    expect(createdJob.status()).toBe(201);
    const job = await createdJob.json();

    const startTimestamp = '2035-04-05T14:00:00+02:00';
    const endTimestamp = '2035-04-05T15:00:00+02:00';
    const accepted = await request.post(`${API_BASE}/api/v1/job-requests/${job.id}/accept`, {
      headers: authHeaders(professional.token),
      data: { startTimestamp, endTimestamp }
    });
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).status).toBe('ACCEPTED');

    const visitorResponse = await getAgenda(request, professional.id, {
      from: '2035-04-05T11:30:00Z',
      to: '2035-04-05T12:30:00Z'
    });
    expect(visitorResponse.status()).toBe(200);
    const visitorAgenda = await visitorResponse.json();
    expect(visitorAgenda).toHaveLength(1);
    expect(visitorAgenda[0].type).toBe('SCHEDULED_JOB');
    expect(visitorAgenda[0].jobRequestId).toBeNull();
    expect(visitorAgenda[0]).not.toHaveProperty('clientId');
    expect(visitorAgenda[0]).not.toHaveProperty('location');
    expect(visitorAgenda[0]).not.toHaveProperty('paymentAmount');
    expect(visitorAgenda[0]).not.toHaveProperty('confirmationPin');
    expect(Date.parse(visitorAgenda[0].startTimestamp)).toBe(Date.parse(startTimestamp));
    expect(Date.parse(visitorAgenda[0].endTimestamp)).toBe(Date.parse(endTimestamp));

    const ownerResponse = await getAgenda(request, professional.id, {
      from: '2035-04-05T11:30:00Z',
      to: '2035-04-05T12:30:00Z'
    }, professional.token);
    expect(ownerResponse.status()).toBe(200);
    const ownerAgenda = await ownerResponse.json();
    expect(ownerAgenda[0].jobRequestId).toBe(job.id);

    const manualUpdate = await request.patch(`${SCHEDULES_URL}/${visitorAgenda[0].id}`, {
      headers: authHeaders(professional.token),
      data: { startTimestamp: '2035-04-05T15:00:00+02:00' }
    });
    expect(manualUpdate.status()).toBe(400);

    const cancelled = await request.post(`${API_BASE}/api/v1/job-requests/${job.id}/cancel`, {
      headers: authHeaders(professional.token)
    });
    expect(cancelled.status()).toBe(200);
    expect((await getAgenda(request, professional.id)).status()).toBe(200);
    expect(await (await getAgenda(request, professional.id)).json()).toEqual([]);
  });
});