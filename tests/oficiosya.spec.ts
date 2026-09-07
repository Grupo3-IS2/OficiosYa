import { test, expect } from '@playwright/test';

const BASE_URL = 'https://dev.oficiosya.duckdns.org';

test.describe('Suite de Pruebas E2E - OficiosYa', () => {

  test('TC_AUTH_001: Login Exitoso', async ({ page }) => {
    // 1. Ir a la raíz del sitio
    await page.goto(BASE_URL);

    // 2. Navegar al Login (si hay un botón o enlace inicial)
    // Ajustar 'Iniciar sesión' según el texto exacto del botón/enlace en tu pantalla
    const botonLogin = page.getByRole('link', { name: /iniciar sesión|login|ingresar/i });
    if (await botonLogin.isVisible()) {
      await botonLogin.click();
    }

    // 3. Completar credenciales usando los roles de accesibilidad
    await page.getByPlaceholder(/correo|email/i).fill('cliente@test.com');
    await page.getByPlaceholder(/contraseña|password/i).fill('Password123!');

    // 4. Hacer clic en el botón de submit
    await page.getByRole('button', { name: /iniciar|ingresar|entrar/i }).click();

    // 5. Validar que la navegación se haya completado
    await page.waitForURL((url) => !url.href.includes('login'), { timeout: 10000 });
  });

});