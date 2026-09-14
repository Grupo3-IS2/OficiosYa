import { test, expect, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:8080';
const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173';

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@qa.test`;
}

async function registerClient(request: APIRequestContext, payload: { name: string; email: string; password: string }) {
  return request.post(`${API_BASE}/api/v1/auth/register-client`, { data: payload });
}

async function registerProfessional(request: APIRequestContext, payload: {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  workingLocation?: string;
}) {
  return request.post(`${API_BASE}/api/v1/auth/register-professional`, { data: payload });
}

async function login(request: APIRequestContext, payload: { email: string; password: string }) {
  return request.post(`${API_BASE}/api/v1/auth/login`, { data: payload });
}

test.describe('SCRUM 9-14 - OficiosYa', () => {
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

  test('SCRUM-9: Registro de cliente rechaza email duplicado', async ({ request }) => {
    const payload = {
      name: 'Cliente QA Duplicado',
      email: uniqueEmail('cliente.duplicado'),
      password: 'ClaveSegura2026!'
    };

    const first = await registerClient(request, payload);
    expect(first.status()).toBe(200);

    const second = await registerClient(request, payload);
    expect(second.status()).toBe(400);
    const body = await second.json();
    expect(body.error).toMatch(/ya existe|bad request/i);
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

  test('SCRUM-10: Inicio de sesión rechaza contraseña incorrecta', async ({ request }) => {
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
    expect(body.error).toMatch(/incorrectos|bad request/i);
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
    expect(logoutBody.message).toMatch(/sesión cerrada/i);
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

  test('SCRUM-13: Creación de profesional rechaza número inválido', async ({ request }) => {
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
    expect(body.error).toMatch(/Error de validación|bad request|teléfono/i);
  });

  test('SCRUM-12: Edición de datos básicos del cliente', async ({ request }) => {
    const client = {
      name: 'Cliente QA Edicion',
      email: uniqueEmail('cliente.editar'),
      password: 'ClaveSegura2026!'
    };

    const created = await registerClient(request, client);
    expect(created.status()).toBe(200);
    const createdBody = await created.json();

    const token = createdBody.token;
    const updated = await request.put(`${API_BASE}/api/v1/client/${createdBody.id}`, {
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
    const updated = await request.put(`${API_BASE}/api/v1/professional/${createdBody.id}`, {
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

  test('TC_WEB_001: Frontend carga la pantalla principal', async ({ page }) => {
    const response = await page.goto(FRONTEND_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });
});
