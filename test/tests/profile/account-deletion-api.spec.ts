import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  API_BASE,
  completeRegistration,
  mailsTo,
  otherCode,
  waitForVerificationCode,
  startClientRegistration,
  startProfessionalRegistration
} from '../support/registration';

/**
 * Deleting an account against the real API: it is refused while a job is open, and once done the
 * account can't sign in, its profile is gone, the jobs it was in show "Cuenta eliminada" to the other
 * side, and its email can register again.
 */

const PASSWORD = 'ClaveSegura2026!';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

async function registerClient(request: APIRequestContext) {
  const email = uniqueEmail('borrar.cliente');
  const verified = await completeRegistration(request, await startClientRegistration(request, { name: 'Cliente Borrado QA', email, password: PASSWORD }), email);
  expect(verified.status()).toBe(200);
  return { email, ...(await verified.json()) };
}

async function registerPublishedProfessional(request: APIRequestContext) {
  const email = uniqueEmail('borrar.profesional');
  const started = await startProfessionalRegistration(request, {
    name: 'Profesional Borrado QA', email, password: PASSWORD, phoneNumber: '+59899123456', workingLocation: 'Montevideo'
  });
  const verified = await completeRegistration(request, started, email);
  expect(verified.status()).toBe(200);
  const login = await verified.json();
  expect((await request.patch(`${API_BASE}/api/v1/professionals/me`, {
    headers: auth(login.token), data: { description: 'Arreglos de plomería en general.', workingLocation: 'Montevideo' }
  })).status()).toBe(200);
  const trades = await (await request.get(`${API_BASE}/api/v1/trades`)).json();
  expect((await request.post(`${API_BASE}/api/v1/professionals/me/expertise-trades`, {
    headers: auth(login.token), data: { tradeId: trades[0].id, minimumHourlyWage: 350, maximumHourlyWage: 600 }
  })).status()).toBe(201);
  expect((await request.post(`${API_BASE}/api/v1/professionals/me/publish`, { headers: auth(login.token) })).status()).toBe(200);
  return { email, tradeId: trades[0].id, ...login };
}

test('a professional with an open job can delete the account only once it is cancelled, and is wiped', async ({ request }) => {
  const professional = await registerPublishedProfessional(request);
  const client = await registerClient(request);
  const created = await request.post(`${API_BASE}/api/v1/job-requests`, {
    headers: auth(client.token),
    data: { professionalId: professional.id, location: 'Montevideo', paymentAmount: 1200, tasks: [{ tradeId: professional.tradeId, description: 'Trabajo antes de borrar la cuenta' }] }
  });
  expect(created.status()).toBe(201);
  const job = await created.json();

  // Open job: neither side can leave yet, and no code is mailed for it.
  const refused = await request.post(`${API_BASE}/api/v1/users/me/deletion-code`, { headers: auth(professional.token) });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toMatch(/trabajos en curso/);
  expect((await request.post(`${API_BASE}/api/v1/users/me/deletion-code`, { headers: auth(client.token) })).status()).toBe(409);
  expect((await request.delete(`${API_BASE}/api/v1/users/me`, { headers: auth(client.token), data: { currentPassword: PASSWORD, code: '123456' } })).status()).toBe(409);

  expect((await request.post(`${API_BASE}/api/v1/job-requests/${job.id}/cancel`, { headers: auth(client.token) })).status()).toBe(200);

  const mailsBefore = (await mailsTo(request, professional.email)).length;
  expect((await request.post(`${API_BASE}/api/v1/users/me/deletion-code`, { headers: auth(professional.token) })).status()).toBe(202);
  const code = await waitForVerificationCode(request, professional.email, mailsBefore + 1);

  expect((await request.delete(`${API_BASE}/api/v1/users/me`, { headers: auth(professional.token), data: { currentPassword: 'Incorrecta2026!', code } })).status()).toBe(400);
  expect((await request.delete(`${API_BASE}/api/v1/users/me`, { headers: auth(professional.token), data: { currentPassword: PASSWORD, code: otherCode(code) } })).status()).toBe(400);
  const deleted = await request.delete(`${API_BASE}/api/v1/users/me`, { headers: auth(professional.token), data: { currentPassword: PASSWORD, code } });
  expect(deleted.status()).toBe(204);

  // No way in, no profile, and the session it had is over.
  const login = await request.post(`${API_BASE}/api/v1/auth/login`, { data: { email: professional.email, password: PASSWORD } });
  expect(login.status()).toBe(400);
  expect((await login.json()).error).toBe('Email o contraseña incorrectos');
  expect((await request.get(`${API_BASE}/api/v1/professionals/${professional.id}`)).status()).toBe(404);
  expect((await request.get(`${API_BASE}/api/v1/users/me`, { headers: auth(professional.token) })).status()).toBe(401);

  // The client keeps the job in the history, under the new name.
  const seen = await request.get(`${API_BASE}/api/v1/job-requests/${job.id}`, { headers: auth(client.token) });
  expect(seen.status()).toBe(200);
  expect((await seen.json()).professionalName).toBe('Cuenta eliminada');

  // The email is free again. For a taken email registration answers 202 and mails nothing (so it doesn't
  // tell which emails exist); a 429 means it went on to mail a code, held back only by the cooldown since
  // this email's first registration code. A 202 has to go all the way to prove it.
  const again = await startClientRegistration(request, { name: 'Vuelve Otra Vez', email: professional.email, password: PASSWORD });
  if (again.status() === 202) {
    expect((await completeRegistration(request, again, professional.email)).status()).toBe(200);
  } else {
    expect(again.status()).toBe(429);
  }
});

test('an account with a password can not use the setup meant for accounts created with Google', async ({ request }) => {
  const client = await registerClient(request);
  const asked = await request.post(`${API_BASE}/api/v1/users/me/password/setup`, { headers: auth(client.token) });
  expect(asked.status()).toBe(400);
  expect((await asked.json()).error).toMatch(/ya tiene una contraseña/);
});
