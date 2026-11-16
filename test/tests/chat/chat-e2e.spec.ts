import { expect, test, type Page } from '@playwright/test';
import { blockExternalMaps, fakeJwt, mockChat, mockHomeApi, mockSessionVerification } from '../support/ui';

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

async function setupChat(page: Page, conversations = [conversation()], socket = false) {
  await page.addInitScript(({ token, clientId }) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({
      id: clientId, name: 'Cliente Chat', email: 'cliente.chat@qa.test', role: 'CLIENT',
    }));
  }, { token: fakeJwt(), clientId });
  await mockSessionVerification(page);
  if (socket) {
    await page.route('**/api/v1/conversations/unread-count', route => route.fulfill({ json: { count: 0 } }));
  } else {
    await mockChat(page);
  }
  // The header asks for the user's requests; unmocked, the real backend's 401 ends the session.
  await page.route('**/api/v1/job-requests/mine', route => route.fulfill({ json: [] }));
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
  await page.route('**/api/v1/conversations/43/messages?**', route => route.fulfill({ json: [{ ...message(2, 'Respuesta de Andrés'), conversationId: 43 }] }));
  await page.route('**/api/v1/conversations/43/read', route => route.fulfill({ status: 204 }));
  await page.goto('/chat');

  await expect(page.getByRole('button', { name: /Lucía Pérez, 2 mensajes sin leer/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Andrés Silva/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar conversaciones' }).fill('silva');
  await expect(page.getByRole('button', { name: /Andrés Silva/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lucía Pérez/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Andrés Silva/ }).click();
  await expect(page).toHaveURL(/\/chat\?c=43$/);
  await expect(page.getByText('Respuesta de Andrés', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeFocused();
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

test('SCRUM-84: a user sends a message and sees the delivered message in the conversation', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [] }));

  let sentPayload: { content?: string; clientMessageId?: string } | null = null;
  await page.route('**/api/v1/conversations/42/messages', async route => {
    expect(route.request().method()).toBe('POST');
    sentPayload = route.request().postDataJSON();
    await route.fulfill({ json: {
      id: 7,
      conversationId: 42,
      type: 'TEXT',
      senderId: clientId,
      content: sentPayload.content,
      clientMessageId: sentPayload.clientMessageId,
      jobRequestId: null,
      job: null,
      createdAt: '2026-10-30T12:00:00Z',
    } });
  });

  await page.goto('/chat?c=42');
  const composer = page.getByRole('textbox', { name: 'Mensaje', exact: true });
  await composer.fill('Hola, ¿coordinamos el horario?');
  await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();

  await expect(page.getByText('Hola, ¿coordinamos el horario?', { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');
  expect(sentPayload?.content).toBe('Hola, ¿coordinamos el horario?');
  expect(sentPayload?.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
});

test('SCRUM-84: blank messages are not sent and a failed send can be retried once', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [] }));
  let attempts = 0;
  await page.route('**/api/v1/conversations/42/messages', async route => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 500, json: { message: 'No se pudo enviar' } });
    const body = route.request().postDataJSON();
    return route.fulfill({ json: {
      id: 8, conversationId: 42, type: 'TEXT', senderId: clientId, content: body.content,
      clientMessageId: body.clientMessageId, jobRequestId: null, job: null, createdAt: '2026-10-30T12:00:00Z',
    } });
  });
  await page.goto('/chat?c=42');
  const composer = page.getByRole('textbox', { name: 'Mensaje', exact: true });
  const send = page.getByRole('button', { name: 'Enviar mensaje', exact: true });
  await composer.fill('   \n\t');
  await expect(send).toBeDisabled();
  await composer.fill('Mensaje reintentable');
  await send.click();
  await expect(page.getByRole('alert')).toContainText('No se pudo enviar');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByText('Mensaje reintentable', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test('SCRUM-84: a real WebSocket push refreshes and displays the received message', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0 })], true);
  let historyCalls = 0;
  await page.route('**/api/v1/conversations/42/messages?**', route => {
    historyCalls++;
    return route.fulfill({ json: historyCalls === 1 ? [] : [message(9, 'Mensaje recibido por WebSocket')] });
  });
  await page.routeWebSocket('**/ws/chat', ws => {
    ws.onMessage(raw => {
      const text = String(raw);
      if (text.startsWith('CONNECT\n')) ws.send('CONNECTED\n\n\0');
      if (text.includes('destination:/user/queue/messages')) {
        ws.send(`MESSAGE\ndestination:/user/queue/messages\n\n${JSON.stringify(message(9, 'Mensaje recibido por WebSocket'))}\0`);
      }
    });
  });
  await page.goto('/chat?c=42');
  await expect(page.getByText('Mensaje recibido por WebSocket', { exact: true })).toBeVisible();
});

test('SCRUM-85: conversation and history errors can be retried, and an unknown conversation is not selectable', async ({ page }) => {
  let inboxAttempts = 0;
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await page.route('**/api/v1/conversations/unread-count', route => route.fulfill({ json: { count: 0 } }));
  await page.unroute('**/api/v1/conversations');
  await page.route('**/api/v1/conversations', route => {
    inboxAttempts++;
    return inboxAttempts === 1
      ? route.fulfill({ status: 500, json: { message: 'Error de conversaciones' } })
      : route.fulfill({ json: [conversation({ unreadCount: 0 })] });
  });
  await page.goto('/chat');
  await expect(page.getByRole('alert')).toContainText('Error de conversaciones');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lucía Pérez', exact: true })).toBeVisible();

  let historyAttempts = 0;
  await page.route('**/api/v1/conversations/42/messages?**', route => {
    historyAttempts++;
    return historyAttempts === 1
      ? route.fulfill({ status: 500, json: { message: 'Error de historial' } })
      : route.fulfill({ json: [] });
  });
  await page.getByRole('button', { name: 'Lucía Pérez', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Historial de mensajes' }).getByRole('alert')).toContainText('Error de historial');
  await page.getByRole('region', { name: 'Historial de mensajes' }).getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('La conversación empieza acá')).toBeVisible();
  await page.route('**/api/v1/conversations/999/messages?**', route => route.fulfill({ status: 404, json: { message: 'Conversación inexistente' } }));
  await page.goto('/chat?c=999');
  await expect(page.getByRole('region', { name: 'Historial de mensajes' }).getByRole('alert')).toContainText('Conversación inexistente');
});

test('SCRUM-86: marking messages read persists after reloading the conversation list', async ({ page }) => {
  await setupChat(page);
  let unread = 2;
  await page.unroute('**/api/v1/conversations');
  await page.route('**/api/v1/conversations', route => route.fulfill({ json: [conversation({ unreadCount: unread })] }));
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [message(10, 'Pendiente de leer')] }));
  await page.route('**/api/v1/conversations/42/read', route => {
    unread = 0;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/chat');
  await page.getByRole('button', { name: /Lucía Pérez, 2 mensajes sin leer/ }).click();
  await expect(page.getByText('Pendiente de leer', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lucía Pérez', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Lucía Pérez', exact: true })).toBeVisible();
  await expect(page.locator('.chat-unread')).toHaveCount(0);
});

test('selecting a contact focuses the composer after loading; clicking it again closes the conversation', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  let release!: () => void;
  const historyReady = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/conversations/42/messages?**', async route => {
    await historyReady;
    await route.fulfill({ json: [] });
  });
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Tus conversaciones, en un solo lugar' })).toBeVisible();
  const contact = page.getByRole('button', { name: 'Lucía Pérez', exact: true });
  await contact.click();
  const composer = page.getByRole('textbox', { name: 'Mensaje', exact: true });
  await expect(composer).toBeDisabled();
  release();
  await expect(composer).toBeFocused();
  await page.keyboard.type('Hola, quería consultar por un servicio');
  await expect(composer).toHaveValue('Hola, quería consultar por un servicio');
  await contact.click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('heading', { name: 'Tus conversaciones, en un solo lugar' })).toBeVisible();
  await expect(composer).toHaveCount(0);
  await contact.click();
  await expect(composer).toBeFocused();
});

test('switching contacts focuses the new composer and Escape clears the selection and its URL parameter', async ({ page }) => {
  await setupChat(page, [
    conversation({ unreadCount: 0 }),
    conversation({ id: 43, otherParticipant: { ...conversation().otherParticipant, id: 'other-id', name: 'Andrés Silva' }, unreadCount: 0 }),
  ]);
  await page.route('**/api/v1/conversations/*/messages?**', route => route.fulfill({ json: [] }));
  await page.goto('/chat?source=test&c=42');
  const composer = page.getByRole('textbox', { name: 'Mensaje', exact: true });
  await expect(composer).toBeFocused();
  await page.getByRole('button', { name: 'Andrés Silva', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Andrés Silva', exact: true })).toBeVisible();
  await expect(composer).toBeFocused();
  await page.keyboard.type('Hola Andrés');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/chat\?source=test$/);
  await expect(page.getByRole('region', { name: 'Conversación activa' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tus conversaciones, en un solo lugar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Andrés Silva', exact: true })).not.toHaveAttribute('aria-current', 'true');
});

test('Escape closes the options menu before closing the active conversation', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [] }));
  await page.goto('/chat?c=42');
  await expect(page.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Opciones de conversación', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Opciones de conversación' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Opciones de conversación' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/chat\?c=42$/);
  await expect(page.getByRole('button', { name: 'Opciones de conversación', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/chat$/);
});

test('Escape dismisses the service dialog without closing its conversation', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await blockExternalMaps(page);
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [] }));
  await page.goto('/chat?c=42');
  await expect(page.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Opciones de conversación', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Solicitar servicio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Solicitar servicio', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/chat\?c=42$/);
  await expect(page.getByRole('heading', { name: 'Lucía Pérez', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/chat$/);
});

test('a blocked conversation stays disabled and can still be closed with Escape', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0, canWrite: false, blockedByMe: true })]);
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [] }));
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Lucía Pérez', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Mensaje', exact: true });
  await expect(page.getByText('Bloqueaste esta conversación.', { exact: false })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(composer).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/chat$/);
});

test('mobile contact selection focuses the composer and Escape returns to the contact list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await page.route('**/api/v1/conversations/42/messages?**', route => route.fulfill({ json: [] }));
  await page.goto('/chat');
  const contact = page.getByRole('button', { name: 'Lucía Pérez', exact: true });
  await contact.click();
  await expect(page.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(contact).toBeVisible();
  await expect(page).toHaveURL(/\/chat$/);
});

test('the collapsed sidebar shows a logo above contacts and changes to an expand arrow when hovering anywhere on the sidebar', async ({ page }) => {
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Contraer conversaciones', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Conversaciones', exact: true });
  const expand = page.getByRole('button', { name: 'Expandir conversaciones', exact: true });
  const logo = expand.locator('.chat-sidebar-toggle__logo');
  const arrow = expand.locator('.chat-sidebar-toggle__arrow');
  await page.mouse.move(800, 300);
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(logo).toHaveCSS('opacity', '1');
  await expect(arrow).toHaveCSS('opacity', '0');
  await expect(expand).toHaveCSS('background-color', 'rgb(0, 166, 91)');
  await expect(logo).toHaveCSS('color', 'rgb(245, 250, 251)');
  const top = (await expand.boundingBox())!;
  const contact = (await page.getByRole('button', { name: 'Lucía Pérez', exact: true }).boundingBox())!;
  expect(top.width).toBe(top.height);
  expect(top.y + top.height).toBeLessThan(contact.y);
  if (process.env.CHAT_SIDEBAR_QA_DIR) await sidebar.screenshot({ path: `${process.env.CHAT_SIDEBAR_QA_DIR}/sidebar-logo.png` });
  await sidebar.hover({ position: { x: 5, y: 300 } });
  await expect(logo).toHaveCSS('opacity', '0');
  await expect(arrow).toHaveCSS('opacity', '1');
  if (process.env.CHAT_SIDEBAR_QA_DIR) await sidebar.screenshot({ path: `${process.env.CHAT_SIDEBAR_QA_DIR}/sidebar-expand.png` });
  await page.mouse.move(800, 300);
  await expect(logo).toHaveCSS('opacity', '1');
  await expand.click();
  await expect(page.getByRole('searchbox', { name: 'Buscar conversaciones', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/chat$/);
});

test('the sidebar expansion works with the keyboard and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setupChat(page, [conversation({ unreadCount: 0 })]);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Contraer conversaciones', exact: true }).click();
  await page.mouse.move(800, 300);
  const expand = page.getByRole('button', { name: 'Expandir conversaciones', exact: true });
  await expand.focus();
  await expect(expand.locator('.chat-sidebar-toggle__arrow')).toHaveCSS('opacity', '1');
  await expect(expand.locator('.chat-sidebar-toggle__arrow')).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Contraer conversaciones', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('searchbox', { name: 'Buscar conversaciones', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al inicio', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.CHAT_SIDEBAR_QA_DIR) await page.screenshot({ path: `${process.env.CHAT_SIDEBAR_QA_DIR}/sidebar-mobile.png` });
});

test('the home circle stays at the bottom while contacts scroll and navigates to Home', async ({ page }) => {
  const contacts = Array.from({ length: 30 }, (_, index) => conversation({ id: index + 1, unreadCount: 0,
    otherParticipant: { ...conversation().otherParticipant, id: `person-${index}`, name: `Contacto ${index + 1}` } }));
  await setupChat(page, contacts);
  await mockHomeApi(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Contraer conversaciones', exact: true }).click();
  const home = page.getByRole('link', { name: 'Volver al inicio', exact: true });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute('href', '/');
  await expect(home).toHaveCSS('border-radius', '50%');
  const before = (await home.boundingBox())!;
  expect(before.y).toBeGreaterThan(page.viewportSize()!.height - 100);
  await page.locator('.chat-conversation-list').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(home).toBeVisible();
  expect((await home.boundingBox())!.y).toBeCloseTo(before.y, 0);
  await home.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'OficiosYa inicio', exact: true })).toBeVisible();
});
