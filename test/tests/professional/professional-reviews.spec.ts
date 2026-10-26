import { test, expect, type Page } from '@playwright/test';
import { fakeJwt, mockChat } from '../support/ui';

const id = 'professional-reviews-id';
const review = { jobRequestId: 1, clientName: 'Ana Rodríguez', clientProfileImageUrl: null,
  professionalId: id, professionalName: 'Lucía Pérez', rating: 9, review: 'Excelente trabajo. Muy puntual y cuidadosa.' };

async function setup(page: Page, role = 'CLIENT') {
  await page.addInitScript(({ token, role }) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id: 'client-id', name: 'Cliente', role }));
  }, { token: fakeJwt(), role });
  await mockChat(page);
  await page.route('**/api/v1/auth/verify', route => route.fulfill({ json: { verified: true } }));
  await page.route('**/api/v1/job-requests/mine', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/schedules?**', route => route.fulfill({ json: [] }));
  await page.route(`**/api/v1/professionals/${id}`, route => route.fulfill({ json: {
    id, name: 'Lucía Pérez', profileImageUrl: null, workingLocation: '',
    description: 'Soluciones para tu hogar.', rating: 9, expertiseTrades: [],
  } }));
}

test('reviews display five stars and preserve earlier opinions across pagination errors and retries', async ({ page }) => {
  await setup(page);
  const pages: string[] = [];
  let fail = true;
  await page.route(`**/api/v1/professionals/${id}/reviews?**`, route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('size')).toBe('5');
    pages.push(query.get('page')!);
    if (query.get('page') === '1' && fail) { fail = false; return route.fulfill({ status: 500, json: {} }); }
    return route.fulfill({ json: { content: query.get('page') === '0' ? [review] : [{ ...review, jobRequestId: 2, clientName: 'Carlos', rating: 6, review: null }],
      number: Number(query.get('page')), totalElements: 2, last: query.get('page') === '1' } });
  });
  await page.goto(`/profesionales/${id}`);
  const section = page.locator('.reviews-section');
  await expect(section.getByRole('heading', { name: review.clientName })).toBeVisible();
  await expect(section.getByText(review.review, { exact: true })).toBeVisible();
  await expect(section.getByRole('img', { name: `Foto de ${review.clientName}` })).toBeVisible();
  const stars = section.locator('.profile-review .rating-stars');
  await expect(stars).toHaveAttribute('aria-label', '4,5 de 5 estrellas');
  await expect(stars.locator('.rating-stars__star')).toHaveCount(5);
  await expect(stars.locator('.rating-stars__fill').nth(4)).toHaveCSS('clip-path', 'inset(0px 50% 0px 0px)');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await section.getByRole('button', { name: 'Ver más opiniones' }).click();
  await expect(section.getByRole('alert')).toContainText('No pudimos cargar');
  await expect(section.getByText(review.review, { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Reintentar' }).click();
  await expect(section.getByRole('heading', { name: 'Carlos', exact: true })).toBeVisible();
  await expect(section.locator('.profile-review')).toHaveCount(2);
  await expect(section.getByRole('button', { name: 'Ver más opiniones' })).toHaveCount(0);
  expect(pages[0]).toBe('0');
  expect(pages.filter(value => value !== '0')).toEqual(['1', '1']);
});

test('empty reviews show an empty state', async ({ page }) => {
  await setup(page);
  await page.route('**/reviews?**', route => route.fulfill({ json: { content: [], number: 0, totalElements: 0, last: true } }));
  await page.goto(`/profesionales/${id}`);
  await expect(page.locator('.reviews-section')).toContainText('todavía no tiene calificaciones');
});

test('every half-star score colors only the left half of its outlined star', async ({ page }) => {
  await setup(page);
  const cases = [
    { rating: 1, label: '0,5', clips: [50, 100, 100, 100, 100] },
    { rating: 3, label: '1,5', clips: [0, 50, 100, 100, 100] },
    { rating: 5, label: '2,5', clips: [0, 0, 50, 100, 100] },
    { rating: 7, label: '3,5', clips: [0, 0, 0, 50, 100] },
    { rating: 9, label: '4,5', clips: [0, 0, 0, 0, 50] },
  ];
  await page.route('**/reviews?**', route => route.fulfill({ json: {
    content: cases.map(item => ({ ...review, jobRequestId: item.rating, rating: item.rating })),
    number: 0, totalElements: cases.length, last: true,
  } }));
  await page.goto(`/profesionales/${id}`);
  const rows = page.locator('.profile-review');
  await expect(rows).toHaveCount(cases.length);
  for (const [row, item] of cases.entries()) {
    const stars = rows.nth(row).locator('.rating-stars');
    await expect(stars).toHaveAttribute('aria-label', `${item.label} de 5 estrellas`);
    await expect(stars.locator('.rating-stars__star')).toHaveCount(5);
    for (const [index, clip] of item.clips.entries()) {
      const gold = stars.locator('.rating-stars__fill').nth(index);
      await expect(gold).toHaveCSS('clip-path', `inset(0px ${clip}% 0px 0px)`);
      await expect(gold.locator('svg')).toHaveCSS('fill', 'none');
      await expect(gold).toHaveCSS('color', 'rgb(245, 171, 0)');
    }
  }
  if (process.env.REVIEW_SCREENSHOTS) await page.locator('.reviews-section').screenshot({ path: process.env.REVIEW_SCREENSHOTS });
});

test('professional accounts also see the reviews', async ({ page }) => {
  await setup(page, 'PROFESSIONAL');
  await page.route('**/reviews?**', route => route.fulfill({ json: { content: [review], number: 0, totalElements: 1, last: true } }));
  await page.goto(`/profesionales/${id}`);
  const section = page.locator('.reviews-section');
  await expect(section.getByRole('heading', { name: review.clientName })).toBeVisible();
  await expect(section).not.toContainText('Iniciá sesión para ver las opiniones');
});
