import { expect, test, type Page } from '@playwright/test';
import { fakeJwt, mockChat, mockSessionVerification } from '../support/ui';

const clientId = 'chat-client-id';
const professionalId = 'chat-professional-id';

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    otherParticipant: {
      id: professionalId,
      name: 'Lucía Pérez',
      profileImageUrl: null,
      role: 'PROFESSIONAL',
    },
    myRole: 'CLIENT',
    lastMessagePreview: '¿Coordinamos el horario?',
    lastMessageAt: '2026-10-22T15:00:00Z',
    unreadCount: 2,
    canWrite: true,
    blockedByMe: false,
    ...overrides,
  };
}

function message(id: number, content: string) {
  return {
    id,
    conversationId: 42,
    senderId: professionalId,
    type: 'TEXT',
    content,
    clientMessageId: `message-${id}`,
    jobRequestId: null,
    job: null,
    createdAt: '2026-10-22T15:00:00Z',
  };
}

async function setupChat(page: Page, conversations = [conversation()]) {
  await page.addInitScript(({ token, clientId }) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({
      id: clientId, name: 'Cliente Chat', email: 'cliente.chat@qa.test', role: 'CLIENT',
    }));
  }, { token: fakeJwt(), clientId });
  await mockSessionVerification(page);
  await mockChat(page);
  await page.route('**/api/v1/users/me', route => route.fulfill({ json: {
    id: clientId, name: 'Cliente Chat', email: 'cliente.chat@qa.test', role: 'CLIENT',
  } }));
  await page.route('**/api/v1/conversations', route => route.fulfill({ json: conversations }));
  await page.route('**/api/v1/professionals/**', route => route.fulfill({ json: {
    id: professionalId, name: 'Lucía Pérez', profileImageUrl: null,
    workingLocation: 'Montevideo', description: 'Soluciones para tu hogar.',
    rating: 9, expertiseTrades: [{ id: 1, tradeId: 3, tradeName: 'Electricidad', minimumHourlyWage: 500, maximumHourlyWage: 900 }],
  } }));
  await page.route('**/api/v1/schedules?**', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/professionals/*/reviews?**', route => route.fulfill({ json: {
    content: [], number: 0, size: 5, totalElements: 0, totalPages: 0, last: true,
  } }));
}

test('SCRUM-83: opening a professional chat from the profile navigates to the conversation', async ({ page }) => {
  await setupChat(page, []);
  await page.route('**/api/v1/professionals/chat-professional-id', route => route.fulfill({ json: {
    id: professionalId, name: 'Lucía Pérez', profileImageUrl: null, workingLocation: 'Montevideo',
    description: 'Soluciones para tu hogar.', rating: 9,
    expertiseTrades: [{ id: 1, tradeId: 3, tradeName: 'Electricidad', minimumHourlyWage: 500, maximumHourlyWage: 900 }],
  } }));
  await page.route('**/api/v1/conversations', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ json: conversation({ unreadCount: 0 }) });
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [] }));
  await page.goto(`/profesionales/${professionalId}`);

  await page.getByRole('button', { name: /Hablar por chat/ }).click();
  await expect(page).toHaveURL(/\/chat\?c=42$/);
  await expect(page.getByRole('button', { name: /Lucía Pérez/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lucía Pérez' })).toBeVisible();
});

test('SCRUM-85: the conversation list filters contacts and opens the selected history', async ({ page }) => {
  await setupChat(page, [
    conversation(),
    conversation({ id: 43, otherParticipant: { ...conversation().otherParticipant, id: 'other-id', name: 'Andrés Silva' }, unreadCount: 0 }),
  ]);
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [message(1, '¿Coordinamos el horario?')] }));
  await page.goto('/chat');

  await expect(page.getByRole('button', { name: /Lucía Pérez, 2 mensajes sin leer/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Andrés Silva/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar conversaciones' }).fill('silva');
  await expect(page.getByRole('button', { name: /Andrés Silva/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lucía Pérez/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Andrés Silva/ }).click();
  await expect(page).toHaveURL(/\/chat\?c=43$/);
});

test('SCRUM-86: a conversation with unread messages displays the notification badge', async ({ page }) => {
  await setupChat(page);
  await page.goto('/chat');

  const contact = page.getByRole('button', { name: /Lucía Pérez, 2 mensajes sin leer/ });
  await expect(contact).toBeVisible();
  await expect(contact.locator('.chat-unread')).toHaveText('2');

  await page.route('**/api/v1/conversations/42/read', route => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [message(1, 'Nuevo mensaje')] }));
  await contact.click();
  await expect(page.getByText('Nuevo mensaje')).toBeVisible();
});
