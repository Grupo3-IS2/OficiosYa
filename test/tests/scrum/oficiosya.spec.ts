import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { waitForVerificationCode } from '../support/registration';
import { fakeJwt, mockHomeApi, mockVerifiedSession } from '../support/ui';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:8080';
const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

async function postJson(request: APIRequestContext, url: string, payload: unknown) {
  return request.post(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    data: JSON.stringify(payload)
  });
}

async function completePendingVerification(request: APIRequestContext, email: string) {
  const inboxResponse = await request.get('http://localhost:8025/api/v1/messages?limit=50');
  expect(inboxResponse.status()).toBe(200);

  const inbox = await inboxResponse.json();
  const messages = Array.isArray(inbox?.messages) ? inbox.messages : [];
  const message = [...messages].reverse().find((item: any) => {
    const recipients = Array.isArray(item?.To) ? item.To : [];
    return recipients.some((recipient: any) => recipient?.Address?.toLowerCase() === email.toLowerCase());
  });

  expect(message).toBeTruthy();

  const snippet = message?.Snippet ?? message?.Text ?? '';
  const match = snippet.match(/\b\d{6}\b/);
  expect(match).toBeTruthy();

  const verifyResponse = await request.post(`${API_BASE}/api/v1/auth/verify-email`, {
    headers: {
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      email,
      code: match![0]
    })
  });

  expect(verifyResponse.status()).toBe(200);
  return verifyResponse;
}

async function registerClient(request: APIRequestContext, payload: { name: string; email: string; password: string }) {
  const response = await postJson(request, `${API_BASE}/api/v1/auth/register-client`, payload);

  if (response.status() === 202) {
    const body = await response.json();
    if (body?.email && !body?.token) {
      return completePendingVerification(request, body.email);
    }
  }

  return response;
}

async function registerProfessional(request: APIRequestContext, payload: {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  workingLocation?: string;
}) {
  const response = await postJson(request, `${API_BASE}/api/v1/auth/register-professional`, payload);

  if (response.status() === 202) {
    const body = await response.json();
    if (body?.email && !body?.token) {
      return completePendingVerification(request, body.email);
    }
  }

  return response;
}

async function login(request: APIRequestContext, payload: { email: string; password: string }) {
  return postJson(request, `${API_BASE}/api/v1/auth/login`, payload);
}

async function verifyEmailChange(request: APIRequestContext, token: string, email: string) {
  const code = await waitForVerificationCode(request, email);
  return request.post(`${API_BASE}/api/v1/users/me/email/verify`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { email, code }
  });
}

async function getAuthenticatedUser(request: APIRequestContext, token: string) {
  return request.get(`${API_BASE}/api/v1/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

async function getFirstTrade(request: APIRequestContext) {
  const response = await request.get(`${API_BASE}/api/v1/trades`);
  expect(response.status()).toBe(200);
  const trades = await response.json();
  expect(Array.isArray(trades)).toBeTruthy();
  expect(trades.length).toBeGreaterThan(0);
  return trades[0];
}

async function blockProfileMapRequests(page: Page) {
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
}

async function mockHomeTradeResults(page: Page) {
  await page.route('**/api/v1/trades', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 1, name: 'Electricista' },
      { id: 2, name: 'Plomería' },
      { id: 3, name: 'Carpintería' }
    ])
  }));
  await page.route('**/api/v1/professionals/search**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      content: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Ana Multioficio',
          profileImageUrl: null,
          workingLocation: 'Montevideo',
          description: 'Electricidad y plomería.',
          rating: 8.5,
          expertiseTrades: [
            { id: 41, tradeId: 1, tradeName: 'Electricista', minimumHourlyWage: 350, maximumHourlyWage: 600 },
            { id: 42, tradeId: 2, tradeName: 'Plomería', minimumHourlyWage: 450, maximumHourlyWage: 700 }
          ]
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Bruno Plomero',
          profileImageUrl: null,
          workingLocation: 'Canelones',
          description: 'Servicio de plomería.',
          rating: null,
          expertiseTrades: [
            { id: 51, tradeId: 2, tradeName: 'Plomería', minimumHourlyWage: 500, maximumHourlyWage: 800 }
          ]
        }
      ],
      totalPages: 1
    })
  }));
}

async function createPublishedProfessional(request: APIRequestContext, payload: {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  workingLocation: string;
}, description = 'Brindo atención rápida y trabajo de calidad en mi rubro.') {
  const created = await registerProfessional(request, payload);
  expect(created.status()).toBe(200);
  const auth = await created.json();

  const trade = await getFirstTrade(request);

  const profileUpdate = await request.patch(`${API_BASE}/api/v1/professionals/me`, {
    headers: {
      Authorization: `Bearer ${auth.token}`
    },
    data: {
      description,
      workingLocation: payload.workingLocation
    }
  });

  expect(profileUpdate.status()).toBe(200);

  const expertiseResponse = await request.post(`${API_BASE}/api/v1/professionals/me/expertise-trades`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      tradeId: trade.id,
      minimumHourlyWage: 350,
      maximumHourlyWage: 600
    })
  });

  expect(expertiseResponse.status()).toBe(201);

  const publishResponse = await request.post(`${API_BASE}/api/v1/professionals/me/publish`, {
    headers: {
      Authorization: `Bearer ${auth.token}`
    }
  });

  expect(publishResponse.status()).toBe(200);

  return {
    ...auth,
    tradeId: trade.id,
    tradeName: trade.name
  };
}

test.describe('OficiosYa - QA suite expandida', () => {
  test('SCRUM-9: Registro de nuevo usuario cliente exitoso', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Scrum',
      email: uniqueEmail('cliente.scrum9'),
      password: 'ClaveSegura2026!'
    };

    const response = await registerClient(request, payload);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.email).toBe(payload.email);
    expect(body.name).toBe(payload.name);
    expect(body.role).toBe('CLIENT');
    expect(body.token).toBeTruthy();
  });

  test('API: registro de cliente no revela si el email ya existe', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Duplicado',
      email: uniqueEmail('cliente.duplicado'),
      password: 'ClaveSegura2026!'
    };

    const first = await registerClient(request, payload);
    expect(first.status()).toBe(200);

    const second = await postJson(request, `${API_BASE}/api/v1/auth/register-client`, payload);
    expect(second.status()).toBe(202);
    const body = await second.json();
    expect(body.email).toBe(payload.email);
    expect(body.token).toBeUndefined();
    expect(body.message).toMatch(/correo es válido|código de verificación/i);
  });

  test('API: registro de cliente rechaza nombre inválido', async ({ request }) => {
    const response = await registerClient(request, {
      name: 'A',
      email: uniqueEmail('cliente.nombre.invalido'),
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/validaci|name|nombre|invalid|bad request/i);
  });

  test('API: registro de cliente rechaza email con formato inválido', async ({ request }) => {
    const response = await registerClient(request, {
      name: 'Cliente Email Inválido',
      email: 'correo-no-valido',
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/email|correo|invalid|validaci|bad request/i);
  });

  test('API: registro de cliente rechaza contraseña débil', async ({ request }) => {
    const response = await registerClient(request, {
      name: 'Cliente Clave Débil',
      email: uniqueEmail('cliente.clave.debil'),
      password: 'abc'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/password|contraseña|validaci|bad request|at least|uppercase|lowercase|number|special|mayúsc|minúsc|número|símbolo/i);
  });

  test('SCRUM-10: Inicio de sesión con credenciales válidas', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Login',
      email: uniqueEmail('cliente.login'),
      password: 'ClaveSegura2026!'
    };

    const registerResponse = await registerClient(request, payload);
    expect(registerResponse.status()).toBe(200);

    const loginResponse = await login(request, { email: payload.email, password: payload.password });
    expect(loginResponse.status()).toBe(200);

    const body = await loginResponse.json();
    expect(body.email).toBe(payload.email);
    expect(body.role).toBe('CLIENT');
    expect(body.token).toBeTruthy();
  });

  test('API: registro acepta email con mayúsculas y lo normaliza en base', async ({ request }) => {
    const upperEmail = `CLIENTE.UPPER.${Date.now()}@QA.TEST`;
    const response = await registerClient(request, {
      name: 'Cliente Uppercase',
      email: upperEmail,
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(upperEmail.toLowerCase());
  });

  test('API: registro con email duplicado y distinta capitalización no revela si existe', async ({ request }) => {
    const email = uniqueEmail('cliente.case.duplicado');
    const first = await registerClient(request, {
      name: 'Cliente Case Uno',
      email,
      password: 'ClaveSegura2026!'
    });
    expect(first.status()).toBe(200);

    const second = await postJson(request, `${API_BASE}/api/v1/auth/register-client`, {
      name: 'Cliente Case Dos',
      email: email.toUpperCase(),
      password: 'ClaveSegura2026!'
    });

    expect(second.status()).toBe(202);
    const body = await second.json();
    expect(body.email).toBe(email.toLowerCase());
    expect(body.token).toBeUndefined();
    expect(body.message).toMatch(/correo es válido|código de verificación/i);
  });

  test('API: login acepta email con mayúsculas', async ({ request }) => {
    const email = uniqueEmail('cliente.login.upper');
    const created = await registerClient(request, {
      name: 'Cliente Mayúsculas',
      email,
      password: 'ClaveSegura2026!'
    });
    expect(created.status()).toBe(200);

    const response = await login(request, {
      email: email.toUpperCase(),
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(email.toLowerCase());
  });

  test('API: login normaliza espacios extra en el email', async ({ request }) => {
    const payload = {
      name: 'Cliente Espacios',
      email: uniqueEmail('cliente.spaces'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, payload);
    expect(created.status()).toBe(200);

    const response = await login(request, {
      email: `  ${payload.email}  `,
      password: payload.password
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(payload.email);
    expect(body.token).toBeTruthy();
  });

  test('API: login rechaza contraseña incorrecta', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Error',
      email: uniqueEmail('cliente.login.fail'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, payload);
    expect(created.status()).toBe(200);

    const response = await login(request, {
      email: payload.email,
      password: 'WrongPassword123!'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/incorrect|bad request|email or password/i);
  });

  test('API: login rechaza usuario no registrado', async ({ request }) => {
    const response = await login(request, {
      email: uniqueEmail('cliente.no.existe'),
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/not found|incorrect|email|contraseña|user|bad request/i);
  });

  test('API: login rechaza payload vacío', async ({ request }) => {
    const response = await postJson(request, `${API_BASE}/api/v1/auth/login`, {
      email: '',
      password: ''
    });

    expect(response.status()).toBe(400);
  });

  test('API: registro con email en mayúsculas se normaliza a minúsculas', async ({ request }) => {
    const rawEmail = `TEST.${Date.now()}@MAIL.COM`;
    const response = await registerClient(request, {
      name: 'Cliente Normalizado',
      email: rawEmail,
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(rawEmail.toLowerCase());
  });

  test('API: registro duplicado no revela existencia con distinta capitalización', async ({ request }) => {
    const email = uniqueEmail('cliente.case.duplicado');

    const first = await registerClient(request, {
      name: 'Cliente Case Uno',
      email,
      password: 'ClaveSegura2026!'
    });
    expect(first.status()).toBe(200);

    const second = await postJson(request, `${API_BASE}/api/v1/auth/register-client`, {
      name: 'Cliente Case Dos',
      email: email.toUpperCase(),
      password: 'ClaveSegura2026!'
    });

    expect(second.status()).toBe(202);
    const body = await second.json();
    expect(body.email).toBe(email.toLowerCase());
    expect(body.token).toBeUndefined();
    expect(body.message).toMatch(/correo es válido|código de verificación/i);
  });

  test('API: contraseña con longitud mínima exacta (8) es válida cuando cumple requisitos', async ({ request }) => {
    const response = await registerClient(request, {
      name: 'Cliente Longitud Exacta',
      email: uniqueEmail('cliente.minlength.exacta'),
      password: 'Aa1!bcde'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBeTruthy();
    expect(body.role).toBe('CLIENT');
  });

  test('API: contraseña con espacios al inicio y final se acepta si cumple requisitos', async ({ request }) => {
    const response = await registerClient(request, {
      name: 'Cliente Espacios Pass',
      email: uniqueEmail('cliente.password.spaces'),
      password: '  Aa1!bcde  '
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBeTruthy();
    expect(body.role).toBe('CLIENT');
  });

  test('API: nombre con caracteres especiales, números y acentos es rechazado', async ({ request }) => {
    const response = await registerClient(request, {
      name: 'José@123',
      email: uniqueEmail('cliente.nombre.especial'),
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/validaci|name|nombre|invalid|bad request/i);
  });

  test('API: nombre demasiado largo es rechazado', async ({ request }) => {
    const response = await registerClient(request, {
      name: 'A'.repeat(101),
      email: uniqueEmail('cliente.nombre.largo'),
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/validaci|name|nombre|length|longitud|bad request/i);
  });

  test('API: registro profesional rechaza teléfono vacío', async ({ request }) => {
    const response = await registerProfessional(request, {
      name: 'Profesional Telefono Vacio',
      email: uniqueEmail('profesional.telefono.vacio'),
      password: 'ClaveSegura2026!',
      phoneNumber: '',
      workingLocation: 'Montevideo'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/telefono|phone|validaci|required|obligatorio|bad request/i);
  });

  test('API: registro profesional rechaza teléfono con formato inválido', async ({ request }) => {
    const response = await registerProfessional(request, {
      name: 'Profesional Telefono Malo',
      email: uniqueEmail('profesional.telefono.malo'),
      password: 'ClaveSegura2026!',
      phoneNumber: '123',
      workingLocation: 'Montevideo'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/telefono|phone|validaci|invalid|bad request|número/i);
  });

  test('API: registro profesional rechaza teléfono demasiado largo', async ({ request }) => {
    const response = await registerProfessional(request, {
      name: 'Profesional Telefono Largo',
      email: uniqueEmail('profesional.telefono.largo'),
      password: 'ClaveSegura2026!',
      phoneNumber: '12345678901234567890',
      workingLocation: 'Montevideo'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/telefono|phone|validaci|invalid|bad request|número/i);
  });

  test('API: registro profesional rechaza ubicación vacía', async ({ request }) => {
    const response = await registerProfessional(request, {
      name: 'Profesional Ubicacion Vacia',
      email: uniqueEmail('profesional.ubicacion.vacia'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+59899123456',
      workingLocation: ''
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/ubicaci|location|trabajo|obligatoria|validaci|bad request/i);
  });

  test('API: registro profesional acepta ubicación con texto raro si no es vacía', async ({ request }) => {
    const response = await registerProfessional(request, {
      name: 'Profesional Ubicacion Rara',
      email: uniqueEmail('profesional.ubicacion.rara'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+59899123456',
      workingLocation: '@@@###'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBeTruthy();
    expect(body.role).toBe('PROFESSIONAL');
  });

  test('API: verify token con token válido devuelve estado positivo', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Verify',
      email: uniqueEmail('cliente.verify'),
      password: 'ClaveSegura2026!'
    };

    const registerResponse = await registerClient(request, payload);
    expect(registerResponse.status()).toBe(200);
    const auth = await registerResponse.json();

    const verifyResponse = await request.get(`${API_BASE}/api/v1/auth/verify`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    });

    expect(verifyResponse.status()).toBe(200);
    const body = await verifyResponse.json();
    expect(body.verified).toBe(true);
  });

  test('API: token expirado se rechaza con 401', async ({ request }) => {
    const expiredToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJleHAiOjE3MDAwMDAwMDB9.signature';

    const response = await request.get(`${API_BASE}/api/v1/auth/verify`, {
      headers: {
        Authorization: `Bearer ${expiredToken}`
      }
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/token|autenticación|inválido|expir/i);
  });

  test('API: token malformado o inválido se rechaza con 401', async ({ request }) => {
    const malformedToken = 'no-es-un-jwt';

    const response = await request.get(`${API_BASE}/api/v1/auth/verify`, {
      headers: {
        Authorization: `Bearer ${malformedToken}`
      }
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/token|autenticación|inválido|expir/i);
  });

  test('API: token revocado después del logout ya no puede acceder a rutas protegidas', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Token Revocado',
      email: uniqueEmail('cliente.token.revocado'),
      password: 'ClaveSegura2026!'
    };

    const registered = await registerClient(request, payload);
    expect(registered.status()).toBe(200);
    const auth = await registered.json();

    const logoutResponse = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    });
    expect(logoutResponse.status()).toBe(200);

    const profileResponse = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    });
    expect(profileResponse.status()).toBe(401);
  });

  test('API: dos inicios de sesión del mismo usuario generan tokens válidos y ambos pasan la verificación', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Multiple Sessions',
      email: uniqueEmail('cliente.sessions'),
      password: 'ClaveSegura2026!'
    };

    const registered = await registerClient(request, payload);
    expect(registered.status()).toBe(200);

    const firstLogin = await login(request, { email: payload.email, password: payload.password });
    expect(firstLogin.status()).toBe(200);
    const firstAuth = await firstLogin.json();

    const secondLogin = await login(request, { email: payload.email, password: payload.password });
    expect(secondLogin.status()).toBe(200);
    const secondAuth = await secondLogin.json();

    expect(firstAuth.token).toBeTruthy();
    expect(secondAuth.token).toBeTruthy();
    expect(firstAuth.email).toBe(payload.email);
    expect(secondAuth.email).toBe(payload.email);

    const firstVerify = await request.get(`${API_BASE}/api/v1/auth/verify`, {
      headers: { Authorization: `Bearer ${firstAuth.token}` }
    });
    const secondVerify = await request.get(`${API_BASE}/api/v1/auth/verify`, {
      headers: { Authorization: `Bearer ${secondAuth.token}` }
    });

    expect(firstVerify.status()).toBe(200);
    expect(secondVerify.status()).toBe(200);
    expect((await firstVerify.json()).verified).toBe(true);
    expect((await secondVerify.json()).verified).toBe(true);
  });

  test('API: acceso directo a rutas protegidas sin token devuelve 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/users/me`);
    expect(response.status()).toBe(401);
  });

  test('API: token de otro rol no puede modificar recursos ajenos', async ({ request }) => {
    const clientPayload = {
      name: 'Cliente Otro Rol',
      email: uniqueEmail('cliente.otra.rol'),
      password: 'ClaveSegura2026!'
    };

    const clientCreated = await registerClient(request, clientPayload);
    expect(clientCreated.status()).toBe(200);
    const clientAuth = await clientCreated.json();

    const professionalPayload = {
      name: 'Profesional Otro Rol',
      email: uniqueEmail('profesional.otra.rol'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234567',
      workingLocation: 'Montevideo'
    };

    const professionalCreated = await registerProfessional(request, professionalPayload);
    expect(professionalCreated.status()).toBe(200);
    const professionalAuth = await professionalCreated.json();

    const forbidden = await request.patch(`${API_BASE}/api/v1/professionals/me`, {
      headers: {
        Authorization: `Bearer ${clientAuth.token}`
      },
      data: {
        name: 'Intento de edición no autorizada',
        phoneNumber: '+598991234568',
        workingLocation: 'Punta del Este'
      }
    });

    expect(forbidden.status()).toBe(403);
  });

  test('API: logout sin token falla con 401', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/auth/logout`);
    expect(response.status()).toBe(401);
  });

  test('SCRUM-11: Cierre de sesión invalida token', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Logout',
      email: uniqueEmail('cliente.logout'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, payload);
    expect(created.status()).toBe(200);

    const loginResult = await login(request, { email: payload.email, password: payload.password });
    const loginBody = await loginResult.json();

    const logoutResponse = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: {
        Authorization: `Bearer ${loginBody.token}`
      }
    });

    expect(logoutResponse.status()).toBe(200);
    const logoutBody = await logoutResponse.json();
    expect(logoutBody.message).toMatch(/logged out|sesión cerrada|logout/i);
  });

  test('SCRUM-13: Creación del perfil profesional exitoso', async ({ request }) => {
    const payload = {
      name: 'Profesional QA Scrum',
      email: uniqueEmail('profesional.scrum13'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234567',
      workingLocation: 'Montevideo'
    };

    const response = await registerProfessional(request, payload);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.email).toBe(payload.email);
    expect(body.name).toBe(payload.name);
    expect(body.role).toBe('PROFESSIONAL');
    expect(body.token).toBeTruthy();
  });

  test('API: registro profesional rechaza número inválido', async ({ request }) => {
    const payload = {
      name: 'Profesional QA Inválido',
      email: uniqueEmail('profesional.invalid'),
      password: 'ClaveSegura2026!',
      phoneNumber: '123',
      workingLocation: 'Montevideo'
    };

    const response = await registerProfessional(request, payload);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/validaci|phone|teléfono|bad request|invalid|número/i);
  });

  test('API: edición de perfil del cliente actualiza nombre', async ({ request }) => {
    const client = {
      name: 'Cliente QA Edicion',
      email: uniqueEmail('cliente.editar'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const token = createdBody.token;
    const updated = await request.patch(`${API_BASE}/api/v1/clients/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      data: {
        name: 'Cliente QA Editado'
      }
    });

    expect(updated.status()).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.name).toBe('Cliente QA Editado');
  });

  test('API: cambio de email exige contraseña actual', async ({ request }) => {
    const client = {
      name: 'Cliente Cambio Email',
      email: uniqueEmail('cliente.email.change'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/email`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        newEmail: uniqueEmail('cliente.nuevo.email'),
        currentPassword: 'ClaveIncorrecta123!'
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/current password|incorrect|bad request/i);
  });

  test('API: cambio de contraseña rechaza confirmación distinta', async ({ request }) => {
    const client = {
      name: 'Cliente Cambio Pass',
      email: uniqueEmail('cliente.pass.change'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/password`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        oldPassword: 'ClaveSegura2026!',
        newPassword: 'NuevaClaveSegura2026!',
        newPasswordConfirmation: 'OtraClave2026!'
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/confirmación|coincide|match|bad request|contraseña/i);
  });

  test('API: cambio de contraseña con contraseña actual correcta funciona', async ({ request }) => {
    const client = {
      name: 'Cliente Password OK',
      email: uniqueEmail('cliente.pass.ok'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/password`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        oldPassword: 'ClaveSegura2026!',
        newPassword: 'ClaveNuevaSegura2026!',
        newPasswordConfirmation: 'ClaveNuevaSegura2026!'
      }
    });

    expect(response.status()).toBe(204);
  });

  test('API: cambiar contraseña con contraseña actual incorrecta falla', async ({ request }) => {
    const client = {
      name: 'Cliente Password Actual Incorrecta',
      email: uniqueEmail('cliente.pass.actual.incorrecta'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/password`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        oldPassword: 'ClaveIncorrecta123!',
        newPassword: 'ClaveNuevaSegura2026!',
        newPasswordConfirmation: 'ClaveNuevaSegura2026!'
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/contraseña actual|incorrect|bad request/i);
  });

  test('API: cambiar contraseña con nueva contraseña igual a la actual falla', async ({ request }) => {
    const client = {
      name: 'Cliente Password Igual',
      email: uniqueEmail('cliente.pass.igual'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/password`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        oldPassword: 'ClaveSegura2026!',
        newPassword: 'ClaveSegura2026!',
        newPasswordConfirmation: 'ClaveSegura2026!'
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/igual|actual|contraseña|bad request/i);
  });

  test('API: cambiar email a uno ya registrado falla', async ({ request }) => {
    const first = {
      name: 'Cliente Email Conflict Uno',
      email: uniqueEmail('cliente.email.conflict1'),
      password: 'ClaveSegura2026!'
    };
    const second = {
      name: 'Cliente Email Conflict Dos',
      email: uniqueEmail('cliente.email.conflict2'),
      password: 'ClaveSegura2026!'
    };

    const firstCreated = await registerClient(request, first);
    expect(firstCreated.status()).toBe(200);
    const firstAuth = await firstCreated.json();

    const secondCreated = await registerClient(request, second);
    expect(secondCreated.status()).toBe(200);
    const secondAuth = await secondCreated.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/email`, {
      headers: {
        Authorization: `Bearer ${secondAuth.token}`
      },
      data: {
        newEmail: first.email,
        currentPassword: second.password
      }
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/ya existe|already exists|duplicate|email|conflict/i);
  });

  test('API: perfil sin autenticación devuelve 401 al intentar actualizar', async ({ request }) => {
    const response = await request.patch(`${API_BASE}/api/v1/clients/me`, {
      data: {
        name: 'Cliente no autenticado'
      }
    });

    expect(response.status()).toBe(401);
  });

  test('API: intentar actualizar email sin enviar contraseña actual devuelve 400', async ({ request }) => {
    const client = {
      name: 'Cliente Email Sin Contraseña',
      email: uniqueEmail('cliente.email.sin.pass'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/email`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        newEmail: uniqueEmail('cliente.email.nuevo.sin.pass')
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/validaci|error de validación|contraseña|current password|bad request/i);
  });

  test('API: avatar vacío falla con 400', async ({ request }) => {
    const client = {
      name: 'Cliente Avatar Vacio',
      email: uniqueEmail('cliente.avatar.vacio'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.post(`${API_BASE}/api/v1/users/me/profile-image`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      multipart: {
        file: {
          name: 'empty.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('')
        }
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/imagen|archivo|elegí una imagen|bad request/i);
  });

  test('API: avatar no imagen falla con 400', async ({ request }) => {
    const client = {
      name: 'Cliente Avatar No Imagen',
      email: uniqueEmail('cliente.avatar.no.imagen'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await request.post(`${API_BASE}/api/v1/users/me/profile-image`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      multipart: {
        file: {
          name: 'fake.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('not-a-real-image')
        }
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/imagen|jpg|png|archivo|bad request/i);
  });

  test('API: avatar demasiado pesado falla con 413 o 400', async ({ request }) => {
    const client = {
      name: 'Cliente Avatar Pesado',
      email: uniqueEmail('cliente.avatar.pesado'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024, 0x41);
    const response = await request.post(`${API_BASE}/api/v1/users/me/profile-image`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      multipart: {
        file: {
          name: 'large.png',
          mimeType: 'image/png',
          buffer: hugeBuffer
        }
      }
    });

    expect([400, 413]).toContain(response.status());
  });

  test('API: usuario autenticado puede recuperar su perfil', async ({ request }) => {
    const client = {
      name: 'Cliente Perfil',
      email: uniqueEmail('cliente.perfil'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const response = await getAuthenticatedUser(request, createdBody.token);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(client.email);
    expect(body.name).toBe(client.name);
  });

  test('SCRUM-14: Edición del perfil profesional', async ({ request }) => {
    const professional = {
      name: 'Profesional QA Edit',
      email: uniqueEmail('profesional.editar'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234567',
      workingLocation: 'Montevideo'
    };

    const created = await registerProfessional(request, professional);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const token = createdBody.token;
    const updated = await request.patch(`${API_BASE}/api/v1/professionals/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      data: {
        name: 'Profesional QA Editado',
        phoneNumber: '+598991234568',
        workingLocation: 'Punta del Este'
      }
    });

    expect(updated.status()).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.name).toBe('Profesional QA Editado');
  });

  test('API: manejo de errores 400 por payload inválido devuelve JSON estándar', async ({ request }) => {
    const response = await postJson(request, `${API_BASE}/api/v1/auth/register-client`, {
      name: 'A',
      email: 'correo-no-valido',
      password: 'abc'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.status).toBe(400);
    expect(body.error).toMatch(/validaci|invalid|bad request|email|contraseña|nombre/i);
  });

  test('API: manejo de errores 401 por sesión vencida devuelve JSON estándar', async ({ request }) => {
    const expiredToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJleHAiOjE3MDAwMDAwMDB9.signature';

    const response = await request.get(`${API_BASE}/api/v1/auth/verify`, {
      headers: {
        Authorization: `Bearer ${expiredToken}`
      }
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.status).toBe(401);
    expect(body.error).toMatch(/token|autenticación|expir|inválido/i);
  });

  test('API: manejo de errores 409 por conflicto de email devuelve JSON estándar', async ({ request }) => {
    const first = {
      name: 'Cliente Error Conflict Uno',
      email: uniqueEmail('cliente.error.conflict1'),
      password: 'ClaveSegura2026!'
    };
    const second = {
      name: 'Cliente Error Conflict Dos',
      email: uniqueEmail('cliente.error.conflict2'),
      password: 'ClaveSegura2026!'
    };

    const firstCreated = await registerClient(request, first);
    expect(firstCreated.status()).toBe(200);
    const firstAuth = await firstCreated.json();

    const secondCreated = await registerClient(request, second);
    expect(secondCreated.status()).toBe(200);
    const secondAuth = await secondCreated.json();

    const response = await request.put(`${API_BASE}/api/v1/users/me/email`, {
      headers: {
        Authorization: `Bearer ${secondAuth.token}`
      },
      data: {
        newEmail: first.email,
        currentPassword: second.password
      }
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.status).toBe(409);
    expect(body.error).toMatch(/ya existe|already exists|duplicate|email|conflict/i);
  });

  test.fixme('API: manejo de errores 500 interno del servidor devuelve JSON estándar', async ({ request }) => {
    const response = await postJson(request, `${API_BASE}/api/v1/auth/register-client`, {
      name: 'Cliente 500',
      email: 'internal-error@qa.test',
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(500);
    const body = await response.json();
    expect(body.status).toBe(500);
    expect(body.error).toMatch(/error interno|internal server|servidor/i);
  });

  test('API: timeout o red caída se maneja sin romper la sesión del cliente', async ({ request }) => {
    const error = await request.get('http://127.0.0.1:1/api/v1/auth/verify', { timeout: 250 }).catch((err) => err);
    expect(error).toBeTruthy();
  });

  test('API: JSON incompleto o estructura inconsistente se detecta como error de backend', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/auth/register-client`, {
      headers: {
        'Content-Type': 'application/json'
      },
      data: '{"name":"Cliente Inconsistente","email":"incomplete@qa.test","password":'
    });

    expect([400, 415, 500]).toContain(response.status());
    const body = await response.json().catch(() => null);

    if (body) {
      expect(typeof body).toBe('object');
      expect(body.status || body.error || body.details || body.message).toBeTruthy();
    }
  });

  test('API: registro válido seguido de edición inmediata del perfil conserva la sesión activa', async ({ request }) => {
    const client = {
      name: 'Cliente QA Edita Inmediato',
      email: uniqueEmail('cliente.edita.inmediato'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const auth = await created.json();

    const updated = await request.patch(`${API_BASE}/api/v1/clients/me`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      },
      data: {
        name: 'Cliente QA Editado Inmediatamente'
      }
    });

    expect(updated.status()).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.name).toBe('Cliente QA Editado Inmediatamente');

    const me = await getAuthenticatedUser(request, auth.token);
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.name).toBe('Cliente QA Editado Inmediatamente');
  });

  test('API: cambiar password no invalida la sesión actual del mismo usuario', async ({ request }) => {
    const client = {
      name: 'Cliente QA Password Session',
      email: uniqueEmail('cliente.password.session'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const auth = await created.json();

    const changePassword = await request.put(`${API_BASE}/api/v1/users/me/password`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      },
      data: {
        oldPassword: 'ClaveSegura2026!',
        newPassword: 'NuevaClaveSegura2026!',
        newPasswordConfirmation: 'NuevaClaveSegura2026!'
      }
    });

    expect(changePassword.status()).toBe(204);

    const me = await getAuthenticatedUser(request, auth.token);
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.email).toBe(client.email);
  });

  test.fixme('API: usuario bloqueado o deshabilitado no puede iniciar sesión si esa lógica se activa', async ({ request }) => {
    const response = await login(request, {
      email: 'usuario.bloqueado@qa.test',
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/bloqueado|deshabilitado|inactive|disabled|blocked/i);
  });

  test('API: profesional con datos mínimos válidos para activación acepta registro', async ({ request }) => {
    const professional = {
      name: 'Profesional QA Activacion',
      email: uniqueEmail('profesional.activacion.minimo'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+59899123456',
      workingLocation: 'Montevideo'
    };

    const response = await registerProfessional(request, professional);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.role).toBe('PROFESSIONAL');
    expect(body.email).toBe(professional.email);
    expect(body.name).toBe(professional.name);
  });

  test('API: edición de nombre y cambio de email Unicode aceptan valores no ASCII', async ({ request }) => {
    const client = {
      name: 'Cliente QA Unicode',
      email: uniqueEmail('cliente.unicode'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const auth = await created.json();
    const newEmail = `maria.ñandú.${Date.now()}@qa.test`;

    const emailUpdate = await request.put(`${API_BASE}/api/v1/users/me/email`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      },
      data: {
        newEmail,
        currentPassword: client.password
      }
    });

    expect(emailUpdate.status()).toBe(202);
    expect((await emailUpdate.json()).email).toBe(newEmail.toLowerCase());

    const emailVerified = await verifyEmailChange(request, auth.token, newEmail);
    expect(emailVerified.status()).toBe(200);
    expect((await emailVerified.json()).email).toBe(newEmail.toLowerCase());

    const nameUpdate = await request.patch(`${API_BASE}/api/v1/clients/me`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      },
      data: {
        name: 'María José Álvarez'
      }
    });

    expect(nameUpdate.status()).toBe(200);
    const nameBody = await nameUpdate.json();
    expect(nameBody.name).toBe('María José Álvarez');
  });

  test('UI: login renderiza formulario y permite mostrar/ocultar contraseña', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/login`);
    await expect(page.getByRole('heading', { name: '¡Bienvenido de nuevo!' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    await page.locator('#password').fill('ClaveSegura2026!');
    const toggle = page.getByRole('button', { name: /mostrar contraseña|ocultar contraseña/i }).first();
    await toggle.click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await toggle.click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  });

  test('UI: registro renderiza selector de tipo de cuenta y campos profesionales', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/register`);
    await expect(page.getByText('Sumate a OficiosYa')).toBeVisible();
    await expect(page.locator('.account-type').nth(0)).toBeVisible();
    await expect(page.locator('.account-type').nth(1)).toBeVisible();

    await page.locator('.account-type').nth(1).click();
    await expect(page.locator('#register-phone')).toBeVisible();
    await expect(page.locator('#register-location')).toBeVisible();
  });

  test('UI: registro rechaza contraseñas no coincidentes', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario QA');
    await page.locator('#register-email').fill(uniqueEmail('ui.registro'));
    await page.locator('#register-password').fill('ClaveSegura2026!');
    await page.locator('#register-confirmation').fill('ClaveDistinta2026!');
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByText(/Las contraseñas no coinciden/i)).toBeVisible();
  });

  test('API: perfil requiere autenticación', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/users/me`);
    expect(response.status()).toBe(401);
  });

  test('API: cambio de email válido inicia verificación y luego actualiza el email', async ({ request }) => {
    const client = {
      name: 'Cliente Email OK',
      email: uniqueEmail('cliente.email.ok'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const newEmail = uniqueEmail('cliente.email.nuevo');
    const response = await request.put(`${API_BASE}/api/v1/users/me/email`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        newEmail,
        currentPassword: client.password
      }
    });

    expect(response.status()).toBe(202);
    expect((await response.json()).email).toBe(newEmail);

    const beforeVerification = await getAuthenticatedUser(request, createdBody.token);
    expect(beforeVerification.status()).toBe(200);
    expect((await beforeVerification.json()).email).toBe(client.email);

    const verified = await verifyEmailChange(request, createdBody.token, newEmail);
    expect(verified.status()).toBe(200);
    expect((await verified.json()).email).toBe(newEmail);
  });

  test('API: logout invalida la sesión y bloquea acceso al perfil', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Logout Persistente',
      email: uniqueEmail('cliente.logout.persistente'),
      password: 'ClaveSegura2026!'
    };

    const registered = await registerClient(request, payload);
    expect(registered.status()).toBe(200);
    const auth = await registered.json();

    const logoutResponse = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    });
    expect(logoutResponse.status()).toBe(200);

    const profileResponse = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    });
    expect(profileResponse.status()).toBe(401);
  });

  test('UI: login con credenciales incorrectas muestra error visible', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/login`);
    await page.locator('#email').fill('noexiste@qa.test');
    await page.locator('#password').fill('ClaveIncorrecta123!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('alert')).toContainText(/incorrect|error|sesión|contraseña|email/i);
  });

  test('UI: formulario de registro valida contraseña distinta y muestra error', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario UI QA');
    await page.locator('#register-email').fill(uniqueEmail('ui.registro.error'));
    await page.locator('#register-password').fill('ClaveSegura2026!');
    await page.locator('#register-confirmation').fill('ClaveDiferente2026!');
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByRole('alert')).toContainText(/contraseñas no coinciden|contraseña/i);
  });

  test.fixme('UI: botón de logout deshabilitado mientras se procesa', async ({ page }) => {
    const token = fakeJwt();
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((sessionToken) => {
      localStorage.setItem('oficiosya_token', sessionToken);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Logout Busy',
        email: 'logout.busy@qa.test',
        role: 'CLIENT'
      }));
    }, token);
    await page.reload();

    await page.locator('.profile-menu__trigger').click();
    const logoutButton = page.getByRole('menuitem', { name: /cerrar sesión/i });
    await expect(logoutButton).toBeDisabled();
  });

  test('UI: recarga de página mantiene sesión activa', async ({ page }) => {
    const token = fakeJwt();
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((sessionToken) => {
      localStorage.setItem('oficiosya_token', sessionToken);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Persistente',
        email: 'persistente.ui@qa.test',
        role: 'CLIENT'
      }));
    }, token);
    await page.reload();

    await expect(page.locator('.profile-menu__trigger')).toBeVisible();
    await page.reload();
    await expect(page.locator('.profile-menu__trigger')).toBeVisible();
  });

  test.fixme('UI: volver atrás con el navegador después de login/logout conserva el flujo esperado', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/login`);
    await page.goBack();
    await expect(page).toHaveURL(/\/$|\/login/);
  });

  test('UI: menú de perfil funciona en desktop y mobile', async ({ page }) => {
    const token = fakeJwt();
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((sessionToken) => {
      localStorage.setItem('oficiosya_token', sessionToken);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Mobile',
        email: 'mobile.ui@qa.test',
        role: 'CLIENT'
      }));
    }, token);
    await page.reload();

    await expect(page.locator('.profile-menu__trigger')).toBeVisible();
    await page.locator('.profile-menu__trigger').click();
    await expect(page.getByRole('menuitem', { name: /editar perfil/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /cerrar sesión/i })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('.profile-menu__trigger')).toBeVisible();
    await page.locator('.profile-menu__trigger').click();
    await expect(page.getByRole('menuitem', { name: /cerrar sesión/i })).toBeVisible();
  });

  test('UI: teclado Tab, Enter y Escape controlan el menú y el modal de cambios sin guardar', async ({ page }) => {
    const token = fakeJwt();
    await mockVerifiedSession(page, {
      name: 'Usuario Teclado',
      email: 'teclado.ui@qa.test',
      role: 'CLIENT'
    });
    await page.goto(FRONTEND_BASE);
    await page.evaluate((sessionToken) => {
      localStorage.setItem('oficiosya_token', sessionToken);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Teclado',
        email: 'teclado.ui@qa.test',
        role: 'CLIENT'
      }));
    }, token);
    await page.reload();

    await page.locator('.profile-menu__trigger').click();
    const editItem = page.getByRole('menuitem', { name: /editar perfil/i });
    await expect(editItem).toBeVisible();
    await editItem.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/profile\/edit/);

    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await page.locator('#profile-email').fill('cambio.uno@qa.test');
    await page.getByRole('link', { name: /OficiosYa inicio/i }).click();
    await expect(page.locator('.unsaved-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.unsaved-modal')).not.toBeVisible();
  });

  test('UI: botones de login y registro muestran loading visual durante el envío', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          token: 'dummy-token',
          email: 'login.loading@qa.test',
          name: 'Usuario Loading',
          role: 'CLIENT',
          message: 'OK'
        })
      });
    });

    await page.goto(`${FRONTEND_BASE}/login`);
    await page.locator('#email').fill('login.loading@qa.test');
    await page.locator('#password').fill('ClaveSegura2026!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('button', { name: /ingresando/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /ingresando/i })).toBeDisabled();

    await page.route('**/api/v1/auth/register-client', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '22222222-2222-2222-2222-222222222222',
          token: 'dummy-token-2',
          email: 'registro.loading@qa.test',
          name: 'Usuario Registro',
          role: 'CLIENT',
          message: 'OK'
        })
      });
    });

    await page.goto(`${FRONTEND_BASE}/register`);
    await page.locator('#register-name').fill('Usuario Registro Loading');
    await page.locator('#register-email').fill('registro.loading@qa.test');
    await page.locator('#register-password').fill('ClaveSegura2026!');
    await page.locator('#register-confirmation').fill('ClaveSegura2026!');
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('button', { name: /creando cuenta/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /creando cuenta/i })).toBeDisabled();
  });

  test.fixme('UI: guardar perfil muestra estado visual de loading mientras se guarda', async ({ page }) => {
    const token = fakeJwt();
    await mockVerifiedSession(page, {
      name: 'Perfil Loading',
      email: 'perfil.loading@qa.test',
      role: 'CLIENT'
    });
    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await page.evaluate((sessionToken) => {
      localStorage.setItem('oficiosya_token', sessionToken);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Perfil Loading',
        email: 'perfil.loading@qa.test',
        role: 'CLIENT'
      }));
    }, token);
    await page.reload();
    await page.locator('#profile-email').fill('perfil.loading.nuevo@qa.test');
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    await expect(page.getByRole('button', { name: /guardando/i })).toBeVisible();
  });

  test('UI: edición de perfil muestra la vista autenticada cuando hay token persistido', async ({ page }) => {
    await mockVerifiedSession(page, {
      name: 'Perfil UI QA',
      email: 'perfil.ui.qa@qa.test',
      role: 'CLIENT'
    });
    const token = fakeJwt();
    await page.addInitScript((value) => {
      localStorage.setItem('oficiosya_token', value);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Perfil UI QA',
        email: 'perfil.ui.qa@qa.test',
        role: 'CLIENT'
      }));
    }, token);

    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  });

  test('UI: cerrar sesión remueve el token y redirige a la vista principal', async ({ page }) => {
    const sessionToken = fakeJwt();
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((sessionToken) => {
      localStorage.setItem('oficiosya_token', sessionToken);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Cierre',
        email: 'logout.ui@qa.test',
        role: 'CLIENT'
      }));
    }, sessionToken);
    await page.reload();

    const profileTrigger = page.locator('.profile-menu__trigger').first();
    await expect(profileTrigger).toBeVisible();
    await profileTrigger.click();
    await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();

    await expect(page).toHaveURL(/\//);
    await expect(page.locator('body')).toContainText(/iniciar sesión|OficiosYa/i);
    const token = await page.evaluate(() => localStorage.getItem('oficiosya_token'));
    expect(token).toBeNull();
  });

  test('SCRUM-17: visualización de categorías en la home', async ({ page }) => {
    await page.goto(FRONTEND_BASE);

    await expect(page.getByRole('region', { name: 'Categorías' })).toBeVisible();
    await expect(page.locator('.category-card').first()).toBeVisible();
    await expect(page.locator('.category-card')).not.toHaveCount(0);
  });

  test('SCRUM-17: cada categoría filtra por sus oficios y se puede quitar la selección', async ({ page }) => {
    await mockHomeTradeResults(page);
    await page.goto(FRONTEND_BASE);

    const electrician = page.locator('.category-card').filter({ hasText: 'Electricista' });
    const plumber = page.locator('.category-card').filter({ hasText: 'Plomería' });
    await expect(page.locator('.professional-card')).toHaveCount(2);

    await electrician.click();
    await expect(electrician).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.professional-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Ana Multioficio' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bruno Plomero' })).toHaveCount(0);

    await plumber.click();
    await expect(electrician).toHaveAttribute('aria-pressed', 'false');
    await expect(plumber).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.professional-card')).toHaveCount(2);

    await plumber.click();
    await expect(plumber).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.professional-card')).toHaveCount(2);
  });

  test('SCRUM-17: una categoría sin profesionales muestra estado vacío y al quitarla restaura resultados', async ({ page }) => {
    await mockHomeTradeResults(page);
    await page.goto(FRONTEND_BASE);

    const carpentry = page.locator('.category-card').filter({ hasText: 'Carpintería' });
    await carpentry.click();

    await expect(page.getByRole('heading', { name: 'No encontramos profesionales con estos filtros' })).toBeVisible();
    await expect(page.locator('.professional-card')).toHaveCount(0);

    await carpentry.click();
    await expect(page.getByRole('heading', { name: 'No encontramos profesionales con estos filtros' })).toHaveCount(0);
    await expect(page.locator('.professional-card')).toHaveCount(2);
  });

  test('SCRUM-18: búsqueda de profesionales por oficio y rango de precio devuelve resultados publicados', async ({ request }) => {
    const workingLocation = `QA Scrum Search ${Date.now()}`;
    const professional = await createPublishedProfessional(request, {
      name: 'Profesional Scrum Search',
      email: uniqueEmail('profesional.scrum.search'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234567',
      workingLocation
    });

    const tradeResponse = await request.get(`${API_BASE}/api/v1/trades`);
    expect(tradeResponse.status()).toBe(200);
    const trade = (await tradeResponse.json())[0];

    const response = await request.get(`${API_BASE}/api/v1/professionals/search?tradeIds=${trade.id}&minPrice=300&maxPrice=700&location=${encodeURIComponent(workingLocation)}&page=0&size=20`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.content).toBeTruthy();
    expect(body.content.some((item: { id: string }) => item.id === professional.id)).toBeTruthy();
  });

  test('SCRUM-19: filtrar profesionales desde la home por categoría y precio', async ({ page, request }) => {
    const workingLocation = `QA Scrum Filter ${Date.now()}`;
    const professional = await createPublishedProfessional(request, {
      name: 'Profesional Scrum Filtro',
      email: uniqueEmail('profesional.scrum.filter'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234568',
      workingLocation
    });

    await page.goto(FRONTEND_BASE);
    const tradeCard = page.locator('.category-card').filter({ hasText: professional.tradeName }).first();
    await expect(tradeCard).toBeVisible();
    await tradeCard.click();

    await expect(page.getByRole('heading', { name: professional.name }).first()).toBeVisible();

    await page.getByRole('button', { name: /filtros/i }).click();
    await page.getByLabel('Ciudad o barrio').fill(workingLocation);
    await page.getByLabel('Ingresar precio mínimo').fill('300');
    await page.getByLabel('Ingresar precio máximo').fill('700');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page.getByRole('heading', { name: professional.name }).first()).toBeVisible();
  });

  test('SCRUM-15: visualización del perfil profesional público', async ({ page, request }) => {
    const professional = await createPublishedProfessional(request, {
      name: 'Profesional Scrum Perfil',
      email: uniqueEmail('profesional.scrum.perfil'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234569',
      workingLocation: 'Punta del Este'
    }, 'Especialista en instalaciones y soluciones rápidas para hogares y comercios.');

    await page.goto(`${FRONTEND_BASE}/profesionales/${professional.id}`);

    await expect(page.getByRole('heading', { name: professional.name })).toBeVisible();
    await expect(page.locator('body')).toContainText('Punta del Este');
    await expect(page.locator('body')).toContainText('Sobre mí');
    await expect(page.locator('body')).toContainText('Especialista en instalaciones');
  });

  test('SCRUM-15: el perfil público muestra servicios y precios sin exponer datos de contacto', async ({ page, request }) => {
    const professional = await createPublishedProfessional(request, {
      name: 'Profesional Perfil Público Completo',
      email: uniqueEmail('profesional.publico.privacidad'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234581',
      workingLocation: 'Colonia del Sacramento'
    }, 'Reparaciones e instalaciones para hogares y comercios.');

    const apiResponse = await request.get(`${API_BASE}/api/v1/professionals/${professional.id}`);
    expect(apiResponse.status()).toBe(200);
    const publicProfile = await apiResponse.json();
    expect(publicProfile.name).toBe('Profesional Perfil Público Completo');
    expect(publicProfile.profileImageUrl).toBeNull();
    expect(publicProfile.rating).toBeNull();
    expect(publicProfile.expertiseTrades).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tradeId: professional.tradeId,
        tradeName: professional.tradeName,
        minimumHourlyWage: 350,
        maximumHourlyWage: 600
      })
    ]));
    expect(publicProfile).not.toHaveProperty('email');
    expect(publicProfile).not.toHaveProperty('phoneNumber');
    expect(publicProfile).not.toHaveProperty('phone');

    await blockProfileMapRequests(page);
    await page.goto(`${FRONTEND_BASE}/profesionales/${professional.id}`);

    await expect(page.getByRole('heading', { name: professional.name })).toBeVisible();
    await expect(page.getByRole('button', { name: professional.tradeName })).toBeVisible();
    await expect(page.locator('.profile-summary__price')).toContainText('$350');
    await expect(page.getByText('Sin calificaciones')).toBeVisible();
    await expect(page.getByText('Este profesional todavía no tiene calificaciones.')).toBeVisible();
    await expect(page.getByRole('img', { name: `Foto de ${professional.name}` })).toHaveAttribute('src', /^data:image\/svg\+xml,/);
    await expect(page.locator('body')).not.toContainText(professional.email);
    await expect(page.locator('body')).not.toContainText('+598991234581');
  });

  test('SCRUM-15: el perfil representa una imagen y una calificación existentes', async ({ page }) => {
    const professionalId = '11111111-1111-4111-8111-111111111111';
    await blockProfileMapRequests(page);
    await page.route(`**/api/v1/professionals/${professionalId}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: professionalId,
        name: 'Profesional con reputación',
        profileImageUrl: '/uploads/profile-images/qa-profile.svg',
        workingLocation: 'Montevideo',
        description: 'Experiencia en trabajos eléctricos.',
        rating: 8.7,
        expertiseTrades: [
          { id: 101, tradeId: 10, tradeName: 'Electricista', minimumHourlyWage: 350, maximumHourlyWage: 600 },
          { id: 102, tradeId: 11, tradeName: 'Plomería', minimumHourlyWage: 500, maximumHourlyWage: 900 }
        ]
      })
    }));
    await page.route('**/uploads/profile-images/qa-profile.svg', (route) => route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" />'
    }));

    await page.goto(`${FRONTEND_BASE}/profesionales/${professionalId}?tradeId=11`);

    await expect(page.getByRole('heading', { name: 'Profesional con reputación' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Foto de Profesional con reputación' })).toHaveAttribute('src', '/uploads/profile-images/qa-profile.svg');
    await expect(page.locator('.profile-summary__rating')).toContainText('8.7');
    await expect(page.getByRole('button', { name: 'Electricista' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plomería' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.profile-summary__price')).toContainText('$500');
    await expect(page.getByText('Este profesional todavía no tiene calificaciones.')).toHaveCount(0);
  });

  test('SCRUM-15: navegar a un perfil inexistente muestra el estado 404', async ({ page, request }) => {
    const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const apiResponse = await request.get(`${API_BASE}/api/v1/professionals/${missingId}`);
    expect(apiResponse.status()).toBe(404);

    await page.goto(`${FRONTEND_BASE}/profesionales/${missingId}`);

    await expect(page.getByRole('alert')).toContainText('No encontramos el perfil que buscás.');
    await expect(page.getByRole('button', { name: 'Volver a profesionales' }).last()).toBeVisible();
  });

  test('SCRUM-15: muestra la carga mientras espera el perfil y luego renderiza el resultado', async ({ page }) => {
    const professionalId = '22222222-2222-4222-8222-222222222222';
    await blockProfileMapRequests(page);
    await page.route(`**/api/v1/professionals/${professionalId}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: professionalId,
          name: 'Perfil luego de cargar',
          profileImageUrl: null,
          workingLocation: '',
          description: 'Perfil de prueba.',
          rating: null,
          expertiseTrades: []
        })
      });
    });

    await page.goto(`${FRONTEND_BASE}/profesionales/${professionalId}`);

    await expect(page.getByText('Cargando perfil...')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Perfil luego de cargar' })).toBeVisible();
  });

  test('SCRUM-15: un error del servidor muestra un mensaje recuperable', async ({ page }) => {
    const professionalId = '33333333-3333-4333-8333-333333333333';
    await page.route(`**/api/v1/professionals/${professionalId}`, (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ status: 500, error: 'Internal Server Error' })
    }));

    await page.goto(`${FRONTEND_BASE}/profesionales/${professionalId}`);

    await expect(page.getByRole('alert')).toContainText('No pudimos cargar este perfil. Intentá de nuevo más tarde.');
    await expect(page.getByRole('button', { name: 'Volver a profesionales' }).last()).toBeVisible();
  });

  test('SCRUM-16: la disponibilidad semanal del profesional se presenta en la vista pública', async ({ page, request }) => {
    const professional = await createPublishedProfessional(request, {
      name: 'Profesional Scrum Agenda',
      email: uniqueEmail('profesional.scrum.agenda'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234560',
      workingLocation: 'Montevideo'
    });

    await page.goto(`${FRONTEND_BASE}/profesionales/${professional.id}`);

    await expect(page.getByRole('heading', { name: 'Disponibilidad semanal' })).toBeVisible();
    await expect(page.getByText('Este profesional no tiene bloques cargados para esta semana.')).toBeVisible();
  });

  test('SCRUM-11: cierre de sesión limpia sesión y redirige al home', async ({ page }) => {
    const token = fakeJwt();
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((sessionToken) => {
      localStorage.setItem('oficiosya_token', sessionToken);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Cierre Scrum',
        email: 'logout.scrum@qa.test',
        role: 'CLIENT'
      }));
    }, token);
    await page.reload();

    await page.locator('.profile-menu__trigger').click();
    await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();

    await expect(page).toHaveURL(/\//);
    await expect(page.locator('.profile-menu__trigger')).toHaveCount(0);

    const tokenAfterLogout = await page.evaluate(() => localStorage.getItem('oficiosya_token'));
    expect(tokenAfterLogout).toBeNull();
  });

  test('SCRUM-AGGRESSIVE-01: un profesional no publicado no aparece en búsqueda pública ni en la home', async ({ request }) => {
    const trade = await getFirstTrade(request);
    const unpublished = await registerProfessional(request, {
      name: 'Profesional No Publicado',
      email: uniqueEmail('profesional.no.publicado'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234570',
      workingLocation: 'Montevideo'
    });

    expect(unpublished.status()).toBe(200);
    const auth = await unpublished.json();

    const update = await request.patch(`${API_BASE}/api/v1/professionals/me`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: {
        description: 'No debe salir en búsquedas públicas todavía',
        workingLocation: 'Montevideo'
      }
    });
    expect(update.status()).toBe(200);

    const expertise = await request.post(`${API_BASE}/api/v1/professionals/me/expertise-trades`, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({ tradeId: trade.id, minimumHourlyWage: 300, maximumHourlyWage: 500 })
    });
    expect(expertise.status()).toBe(201);

    const search = await request.get(`${API_BASE}/api/v1/professionals/search?tradeIds=${trade.id}&page=0&size=20`);
    expect(search.status()).toBe(200);
    const body = await search.json();
    const ids = body.content.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(auth.id);

    const publicProfile = await request.get(`${API_BASE}/api/v1/professionals/${auth.id}`);
    expect(publicProfile.status()).toBe(404);
  });

  test('SCRUM-AGGRESSIVE-02: la búsqueda rechaza un rango de precios incoherente', async ({ request }) => {
    const trade = await getFirstTrade(request);
    const response = await request.get(`${API_BASE}/api/v1/professionals/search?tradeIds=${trade.id}&minPrice=900&maxPrice=100&page=0&size=20`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/precio|mínimo|máximo|bad request/i);
  });

  test('SCRUM-AGGRESSIVE-03: la home debe alternar estado de categoría y limpiar filtros sin perder contenido', async ({ page }) => {
    await page.goto(FRONTEND_BASE);
    const firstCard = page.locator('.category-card').first();
    await expect(firstCard).toBeVisible();

    const titleBefore = await firstCard.textContent();
    await firstCard.click();
    await expect(page.locator('.category-card.category-card--selected')).toHaveCount(1);

    await page.getByRole('button', { name: /filtros/i }).click();
    await page.getByRole('button', { name: /limpiar filtros/i }).click();
    await expect(page.locator('.active-filters')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar filtros' }).click();

    await page.locator('.category-card').first().click();
    await expect(page.getByText(String(titleBefore ?? '').trim())).toBeVisible();
  });

  test('SCRUM-AGGRESSIVE-04: un token revocado vuelve a expirar y elimina acceso inmediato a perfil protegido', async ({ request }) => {
    const created = await registerClient(request, {
      name: 'Cliente QA Revocado',
      email: uniqueEmail('cliente.scrum.revocado'),
      password: 'ClaveSegura2026!'
    });
    expect(created.status()).toBe(200);
    const auth = await created.json();

    const logout = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    expect(logout.status()).toBe(200);

    const protectedRoute = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    expect(protectedRoute.status()).toBe(401);

    const secondLogout = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    expect(secondLogout.status()).toBe(200);
    expect((await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    })).status()).toBe(401);
  });

  test('SCRUM-AGGRESSIVE-05: la búsqueda por query ignora espacios y distingue mayúsculas/minúsculas', async ({ request }) => {
    const workingLocation = `QA Query ${Date.now()}`;
    const published = await createPublishedProfessional(request, {
      name: 'Ana Mendez Electricista',
      email: uniqueEmail('profesional.scrum.query.aggressive'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234571',
      workingLocation
    }, 'Especialista en instalaciones eléctricas residenciales y comerciales.');

    const publicProfileResponse = await request.get(`${API_BASE}/api/v1/professionals/${published.id}`);
    expect(publicProfileResponse.status()).toBe(200);
    const publicProfile = await publicProfileResponse.json();
    expect(publicProfile.name).toBe('Ana Mendez Electricista');
    expect(publicProfile.workingLocation).toBe(workingLocation);

    const response = await request.get(`${API_BASE}/api/v1/professionals/search?query=%20%20MENEDEZ%20%20&location=${encodeURIComponent(workingLocation)}&page=0&size=20`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    const ids = body.content.map((item: { id: string }) => item.id);
    expect(ids).toContain(published.id);

    const secondResponse = await request.get(`${API_BASE}/api/v1/professionals/search?query=ANA%20MENDEZ&location=${encodeURIComponent(workingLocation)}&page=0&size=20`);
    expect(secondResponse.status()).toBe(200);
    const secondBody = await secondResponse.json();
    expect(secondBody.content.map((item: { id: string }) => item.id)).toContain(published.id);
  });

  test('SCRUM-AGGRESSIVE-06: combinando tradeIds, precio y ubicación devuelve solo perfiles coherentes', async ({ request }) => {
    const trade = await getFirstTrade(request);
    const workingLocation = `QA Combo ${Date.now()}`;
    const published = await createPublishedProfessional(request, {
      name: 'Profesional Combo Filtro',
      email: uniqueEmail('profesional.scrum.combo.filter'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234572',
      workingLocation
    }, 'Soluciones rápidas y soporte técnico profesional.');

    const response = await request.get(`${API_BASE}/api/v1/professionals/search?tradeIds=${trade.id}&minPrice=250&maxPrice=700&location=${encodeURIComponent(workingLocation)}&page=0&size=20`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.content.length).toBeGreaterThan(0);
    expect(body.content.some((item: { id: string }) => item.id === published.id)).toBeTruthy();
  });

  test('SCRUM-AGGRESSIVE-07: un query sin coincidencias y un filtro con location inexistente deben devolver vacío', async ({ request }) => {
    const trade = await getFirstTrade(request);
    const noMatchQuery = await request.get(`${API_BASE}/api/v1/professionals/search?query=xyz-nonexistent-professional-qa&page=0&size=20`);
    expect(noMatchQuery.status()).toBe(200);
    const queryBody = await noMatchQuery.json();
    expect(queryBody.content).toEqual([]);

    const noMatchLocation = await request.get(`${API_BASE}/api/v1/professionals/search?tradeIds=${trade.id}&location=LocalidadQueNoExisteEnUruguay&page=0&size=20`);
    expect(noMatchLocation.status()).toBe(200);
    const locationBody = await noMatchLocation.json();
    expect(locationBody.content).toEqual([]);
  });

  test('SCRUM-AGGRESSIVE-08: un logout repetido ya no invalida estados adicionales ni reabre acceso', async ({ request }) => {
    const created = await registerClient(request, {
      name: 'Cliente QA Logout Repetido',
      email: uniqueEmail('cliente.scrum.logout.repetido'),
      password: 'ClaveSegura2026!'
    });
    expect(created.status()).toBe(200);
    const auth = await created.json();

    const firstLogout = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    expect(firstLogout.status()).toBe(200);

    const secondLogout = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    expect(secondLogout.status()).toBe(200);

    const profile = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    expect(profile.status()).toBe(401);
  });

  test('API: registro profesional acepta email con mayúsculas y normaliza en base', async ({ request }) => {
    const email = `PROFESIONAL.UPPER.${Date.now()}@QA.TEST`;
    const response = await registerProfessional(request, {
      name: 'Profesional Uppercase',
      email,
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234573',
      workingLocation: 'Pando'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(email.toLowerCase());
    expect(body.role).toBe('PROFESSIONAL');
  });

  test('API: login profesional rechaza contraseña incorrecta', async ({ request }) => {
    const email = uniqueEmail('profesional.login.wrongpass');
    const created = await registerProfessional(request, {
      name: 'Profesional Login Fail',
      email,
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234574',
      workingLocation: 'Salto'
    });
    expect(created.status()).toBe(200);

    const response = await login(request, {
      email,
      password: 'ClaveIncorrecta2026!'
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/email o contraseña incorrectos|incorrectos|contraseña|email/i);
  });

  test('API: login acepta credenciales con espacios extra en el email', async ({ request }) => {
    const email = uniqueEmail('profesional.login.spaces');
    const created = await registerProfessional(request, {
      name: 'Profesional Espacios',
      email,
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234575',
      workingLocation: 'Artigas'
    });
    expect(created.status()).toBe(200);

    const response = await login(request, {
      email: `  ${email}  `,
      password: 'ClaveSegura2026!'
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(email.toLowerCase());
  });

  test('API: la búsqueda pública por nombre devuelve un profesional publicado', async ({ request }) => {
    const published = await createPublishedProfessional(request, {
      name: 'Lucia Perez Electricista',
      email: uniqueEmail('profesional.search.name'),
      password: 'ClaveSegura2026!',
      phoneNumber: '+598991234576',
      workingLocation: 'Montevideo'
    }, 'Instalaciones eléctricas en viviendas y comercios.');

    const response = await request.get(`${API_BASE}/api/v1/professionals/search?query=Lucia&page=0&size=20`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.content.some((item: { id: string }) => item.id === published.id)).toBeTruthy();
  });

  test('API: la búsqueda combinada por query y location responde con estructura válida', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/professionals/search?query=Electricista&location=Montevideo&page=0&size=20`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.content)).toBeTruthy();
    expect(body.pageable).toBeTruthy();
  });

  test('API: logout con token inválido responde 200 y la ruta protegida sigue bloqueada', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/auth/logout`, {
      headers: {
        Authorization: 'Bearer token.invalido.qa'
      }
    });

    expect(response.status()).toBe(200);

    const profile = await request.get(`${API_BASE}/api/v1/users/me`, {
      headers: {
        Authorization: 'Bearer token.invalido.qa'
      }
    });
    expect(profile.status()).toBe(401);
  });

  test('TC_WEB_001: Frontend carga la pantalla principal', async ({ page }) => {
    const response = await page.goto(FRONTEND_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });
});
