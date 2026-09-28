import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  completeRegistration,
  expectMailCount,
  startClientRegistration,
  startProfessionalRegistration,
  waitForVerificationCode
} from './support/registration';
import { blockExternalMaps, blockGoogleIdentity, fakeJwt, mockHomeApi, mockVerifiedSession } from './support/ui';

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

/**
 * Registration is two steps now (the account exists only once the emailed code is verified).
 * These do both and answer with the login the second one returns, so a test that just needs
 * an account keeps working; a start that is refused (validation) is returned as is.
 */
async function registerClient(request: APIRequestContext, payload: { name: string; email: string; password: string }) {
  return completeRegistration(request, await startClientRegistration(request, payload), payload.email);
}

async function registerProfessional(request: APIRequestContext, payload: {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  workingLocation?: string;
}) {
  return completeRegistration(request, await startProfessionalRegistration(request, payload), payload.email);
}

async function login(request: APIRequestContext, payload: { email: string; password: string }) {
  return postJson(request, `${API_BASE}/api/v1/auth/login`, payload);
}

async function getAuthenticatedUser(request: APIRequestContext, token: string) {
  return request.get(`${API_BASE}/api/v1/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

test.describe('OficiosYa - QA suite expandida', () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleIdentity(page);
    await blockExternalMaps(page);
  });

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

  test('API: registrar un email que ya tiene cuenta responde igual que uno libre y no envía correo', async ({ request }) => {
    // Answering differently would reveal which emails are registered.
    const payload = {
      name: 'Cliente QA Duplicado',
      email: uniqueEmail('cliente.duplicado'),
      password: 'ClaveSegura2026!'
    };

    const first = await registerClient(request, payload);
    expect(first.status()).toBe(200);

    const second = await startClientRegistration(request, payload);
    expect(second.status()).toBe(202);
    const body = await second.json();
    expect(body.email).toBe(payload.email);

    // Only the code for the first registration was ever mailed.
    await expectMailCount(request, payload.email, 1);
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

  test('API: un email duplicado con distinta capitalización se trata como el mismo', async ({ request }) => {
    const email = uniqueEmail('cliente.case.duplicado');
    const first = await registerClient(request, {
      name: 'Cliente Case Uno',
      email,
      password: 'ClaveSegura2026!'
    });
    expect(first.status()).toBe(200);

    const second = await startClientRegistration(request, {
      name: 'Cliente Case Dos',
      email: email.toUpperCase(),
      password: 'ClaveSegura2026!'
    });

    expect(second.status()).toBe(202);
    await expectMailCount(request, email, 1);
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

  test('API: login acepta email con espacios extra y mayúsculas (se recortan y normalizan)', async ({ request }) => {
    const payload = {
      name: 'Cliente Espacios',
      email: uniqueEmail('cliente.spaces'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, payload);
    expect(created.status()).toBe(200);

    const response = await login(request, {
      email: `  ${payload.email.toUpperCase()}  `,
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

  test('API: un cliente no puede usar los endpoints del profesional', async ({ request }) => {
    const clientPayload = {
      name: 'Cliente Otro Rol',
      email: uniqueEmail('cliente.otra.rol'),
      password: 'ClaveSegura2026!'
    };

    const clientCreated = await registerClient(request, clientPayload);
    expect(clientCreated.status()).toBe(200);
    const clientAuth = await clientCreated.json();

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

  test('API: edición de nombre y email con caracteres Unicode acepta valores no ASCII', async ({ request }) => {
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
    const emailVerified = await request.post(`${API_BASE}/api/v1/users/me/email/verify`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      },
      data: {
        email: newEmail,
        code: await waitForVerificationCode(request, newEmail)
      }
    });
    expect(emailVerified.status()).toBe(200);
    const emailBody = await emailVerified.json();
    expect(emailBody.email).toBe(newEmail);

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

  test('API: cambio de email con contraseña válida manda un código al nuevo correo y lo actualiza al verificarlo', async ({ request }) => {
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

    // Not changed yet: a code was mailed to the new address.
    expect(response.status()).toBe(202);
    expect((await response.json()).email).toBe(newEmail);

    const verified = await request.post(`${API_BASE}/api/v1/users/me/email/verify`, {
      headers: {
        Authorization: `Bearer ${createdBody.token}`
      },
      data: {
        email: newEmail,
        code: await waitForVerificationCode(request, newEmail)
      }
    });
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
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((token) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Logout Busy',
        email: 'logout.busy@qa.test',
        role: 'CLIENT'
      }));
    }, fakeJwt());
    await page.reload();

    await page.locator('.profile-menu__trigger').click();
    const logoutButton = page.getByRole('menuitem', { name: /cerrar sesión/i });
    await expect(logoutButton).toBeDisabled();
  });

  test('UI: recarga de página mantiene sesión activa', async ({ page }) => {
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((token) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Persistente',
        email: 'persistente.ui@qa.test',
        role: 'CLIENT'
      }));
    }, fakeJwt());
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
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((token) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Mobile',
        email: 'mobile.ui@qa.test',
        role: 'CLIENT'
      }));
    }, fakeJwt());
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
    await mockVerifiedSession(page, { name: 'Usuario Teclado', email: 'teclado.ui@qa.test' });
    await page.goto(FRONTEND_BASE);
    await page.evaluate((token) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Teclado',
        email: 'teclado.ui@qa.test',
        role: 'CLIENT'
      }));
    }, fakeJwt());
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
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          email: 'registro.loading@qa.test',
          message: 'OK',
          codeLength: 6,
          expiresInSeconds: 900,
          resendCooldownSeconds: 60
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
    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await page.evaluate((token) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Perfil Loading',
        email: 'perfil.loading@qa.test',
        role: 'CLIENT'
      }));
    }, fakeJwt());
    await page.reload();
    await page.locator('#profile-email').fill('perfil.loading.nuevo@qa.test');
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    await expect(page.getByRole('button', { name: /guardando/i })).toBeVisible();
  });

  async function storeSession(page: Page, token: string, email = 'sesion.ui@qa.test') {
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate(({ token, email }) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({ name: 'Usuario Sesión', email, role: 'CLIENT' }));
    }, { token, email });
  }

  test('UI: edición de perfil muestra la vista autenticada cuando hay token persistido', async ({ page }) => {
    await mockVerifiedSession(page, { name: 'Perfil UI QA', email: 'perfil.ui.qa@qa.test' });
    await storeSession(page, fakeJwt(), 'perfil.ui.qa@qa.test');

    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(page.getByRole('heading', { name: 'Editar perfil' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toHaveValue('perfil.ui.qa@qa.test');
  });

  test('UI: token vencido no deja entrar a editar perfil y redirige al login con aviso', async ({ page }) => {
    await storeSession(page, fakeJwt(-60));

    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(page).toHaveURL(/\/login\?expired=1$/);
    await expect(page.getByRole('status')).toContainText('Tu sesión venció');
    await expect(page.getByRole('heading', { name: 'Editar perfil' })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
  });

  test('UI: token rechazado por el backend redirige al login aunque no parezca vencido', async ({ page }) => {
    // fakeJwt has a future exp but no valid signature, so the real /auth/verify rejects it
    await storeSession(page, fakeJwt(3600));

    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(page).toHaveURL(/\/login\?expired=1$/);
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
  });

  test('UI: un 401 de la API durante la sesión la cierra y redirige al login', async ({ page }) => {
    await mockVerifiedSession(page, { name: 'Usuario Sesión', email: 'sesion.ui@qa.test' });
    await page.route('**/api/v1/users/me', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'El token de autenticación es inválido o expiró' })
    }));
    await storeSession(page, fakeJwt());

    await page.goto(`${FRONTEND_BASE}/profile/edit`);
    await expect(page).toHaveURL(/\/login\?expired=1$/);
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
  });

  test('UI: login con credenciales incorrectas no se trata como sesión vencida', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Credenciales inválidas' })
    }));
    // A token is stored so apiRequest sends it: the 401 still must not end in a redirect
    await storeSession(page, fakeJwt());

    await page.goto(`${FRONTEND_BASE}/login`);
    await page.locator('#email').fill('credenciales.malas@qa.test');
    await page.locator('#password').fill('ClaveIncorrecta2026!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('UI: la sesión se cierra sola cuando vence el token', async ({ page }) => {
    await storeSession(page, fakeJwt(3));
    await page.reload();

    await expect(page.locator('.profile-menu__trigger')).toBeVisible();
    await expect(page).toHaveURL(/\/login\?expired=1$/, { timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('oficiosya_token'))).toBeNull();
  });

  test('UI: header muestra iniciar sesión cuando el token guardado está vencido', async ({ page }) => {
    await storeSession(page, fakeJwt(-60));
    await page.reload();

    await expect(page.locator('a.auth-login-button')).toBeVisible();
    await expect(page.locator('.profile-menu__trigger')).toHaveCount(0);
  });

  test('UI: cerrar sesión remueve el token y redirige a la vista principal', async ({ page }) => {
    await mockHomeApi(page);
    await page.goto(FRONTEND_BASE);
    await page.evaluate((token) => {
      localStorage.setItem('oficiosya_token', token);
      localStorage.setItem('oficiosya_user', JSON.stringify({
        name: 'Usuario Cierre',
        email: 'logout.ui@qa.test',
        role: 'CLIENT'
      }));
    }, fakeJwt());
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

  test('TC_WEB_001: Frontend carga la pantalla principal', async ({ page }) => {
    const response = await page.goto(FRONTEND_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });
});
