import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:8080';

test.describe('Administración: contrato REST', () => {
  test('los endpoints administrativos rechazan una sesión anónima', async ({ request }) => {
    for (const path of ['/users', '/clients', '/professionals', '/job-requests', '/schedules']) {
      const response = await request.get(`${API_BASE}/api/v1/admin${path}`);
      expect(response.status(), path).toBe(401);
    }
    const trade = await request.post(`${API_BASE}/api/v1/admin/trades`, { data: { name: 'QA' } });
    expect(trade.status()).toBe(401);
  });
});
