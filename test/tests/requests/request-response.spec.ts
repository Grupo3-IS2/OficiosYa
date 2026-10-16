import { test, expect, type Page } from '@playwright/test';
import { blockExternalMaps, fakeJwt, mockVerifiedSession } from '../support/ui';

const professionalId = '33333333-3333-3333-3333-333333333333';
const clientId = '44444444-4444-4444-8444-444444444444';

function proposedRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 71,
    clientId,
    clientName: 'Carla Cliente',
    clientProfileImageUrl: null,
    professionalId,
    professionalName: 'Pablo Profesional',
    professionalProfileImageUrl: null,
    location: 'Av. Italia 1234',
    paymentAmount: 1500,
    paymentState: 'PENDING',
    status: 'PROPOSED',
    tasks: [{ id: 1, tradeId: 1, tradeName: 'Plomería', description: 'Cambiar la canilla de la cocina' }],
    scheduledStart: null,
    scheduledEnd: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Logged in as `viewerId`, on the list of requests. */
async function listRequests(page: Page, viewerId: string, requests = [proposedRequest()], role: 'CLIENT' | 'PROFESSIONAL' = 'PROFESSIONAL') {
  await mockVerifiedSession(page, { name: 'Pablo Profesional', email: 'pablo@qa.test', role: 'PROFESSIONAL' });
  // The detail looks the job's address up on OpenStreetMap: never reach it from a test
  await blockExternalMaps(page);
  await page.route('**/api/v1/job-requests/mine', route => route.fulfill({ json: requests }));
  await page.addInitScript(([token, id, userRole]) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id, name: 'Usuario QA', email: 'qa@qa.test', role: userRole }));
  }, [fakeJwt(), viewerId, role] as const);
  await page.goto('/mis-solicitudes');
}

/** The detail of the request, from the card's "Ver solicitud". */
async function openRequests(page: Page, viewerId: string, request = proposedRequest()) {
  await listRequests(page, viewerId, [request]);
  await page.getByRole('button', { name: /^Ver solicitud de/ }).click();
  return page.getByRole('dialog', { name: 'Detalle de la solicitud' });
}

/** Tomorrow, as the date input's value. */
function tomorrow() {
  const date = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test('a pending request hides even a saved PIN and explains when it becomes visible', async ({ page }) => {
  await page.addInitScript(id => {
    localStorage.setItem(`oficiosya_job_request_pins:${id}`, JSON.stringify({ 71: '482731' }));
  }, clientId);
  const dialog = await openRequests(page, clientId);
  await expect(dialog.getByText('Una vez que el profesional acepte la solicitud se mostrará el PIN.')).toBeVisible();
  await expect(dialog).not.toContainText('482731');
  await expect(dialog).not.toContainText('navegador');
  await expect(dialog.getByRole('button', { name: 'Copiar PIN' })).toHaveCount(0);
});

for (const status of ['ACCEPTED', 'RESCHEDULE_REQUESTED']) {
  test(`the creator can see and copy a saved PIN after acceptance (${status})`, async ({ page }) => {
    await page.addInitScript(id => {
      localStorage.setItem(`oficiosya_job_request_pins:${id}`, JSON.stringify({ 71: '482731' }));
    }, clientId);
    const dialog = await openRequests(page, clientId, proposedRequest({ status }));
    await expect(dialog.getByText('482731', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copiar PIN' })).toBeVisible();
  });
}

test('the professional cannot see the client PIN even when it is saved on the same browser', async ({ page }) => {
  await page.addInitScript(id => {
    localStorage.setItem(`oficiosya_job_request_pins:${id}`, JSON.stringify({ 71: '482731' }));
  }, clientId);
  const dialog = await openRequests(page, professionalId, proposedRequest({ status: 'ACCEPTED' }));
  await expect(dialog).not.toContainText('482731');
  await expect(dialog.getByRole('button', { name: 'Copiar PIN' })).toHaveCount(0);
});

test('the professional accepts a request choosing when to do the job', async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route('**/api/v1/job-requests/71/accept', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: proposedRequest({ status: 'ACCEPTED', scheduledStart: sent!.startTimestamp, scheduledEnd: sent!.endTimestamp }) });
  });
  const dialog = await openRequests(page, professionalId);
  const response = dialog.getByRole('region', { name: 'Responder solicitud' });

  await response.getByRole('button', { name: 'Aceptar' }).click();
  // Without a timeframe the browser's own validation stops it: nothing is sent
  await response.getByRole('button', { name: 'Confirmar y aceptar' }).click();
  expect(await response.getByLabel('Fecha').evaluate(input => (input as HTMLInputElement).validity.valueMissing)).toBe(true);
  expect(sent).toBeNull();

  // A timeframe that already passed is caught before asking the backend
  await response.getByLabel('Fecha').fill('2020-01-01');
  await response.getByLabel('Desde').fill('09:00');
  await response.getByLabel('Hasta').fill('11:00');
  await response.getByRole('button', { name: 'Confirmar y aceptar' }).click();
  await expect(response.getByRole('alert')).toContainText('tiene que ser en el futuro');
  expect(sent).toBeNull();

  await response.getByLabel('Fecha').fill(tomorrow());
  await response.getByLabel('Desde').fill('09:00');
  await response.getByLabel('Hasta').fill('11:00');
  await response.getByRole('button', { name: 'Confirmar y aceptar' }).click();

  await expect(dialog.getByText('Aceptada', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Responder solicitud' })).toHaveCount(0);
  expect(new Date(sent!.startTimestamp).getTime()).toBe(new Date(`${tomorrow()}T09:00`).getTime());
  expect(new Date(sent!.endTimestamp).getTime()).toBe(new Date(`${tomorrow()}T11:00`).getTime());
  await expect(page.getByText('Solicitud aceptada')).toBeVisible();
});

test('the professional rejects a request with a reason', async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route('**/api/v1/job-requests/71/reject', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: proposedRequest({ status: 'REJECTED', rejectionReason: sent!.reason }) });
  });
  const dialog = await openRequests(page, professionalId);
  const response = dialog.getByRole('region', { name: 'Responder solicitud' });

  await response.getByRole('button', { name: 'Rechazar' }).click();
  await response.getByLabel('Motivo (opcional)').fill('  No trabajo en esa zona.  ');
  await response.getByRole('button', { name: 'Confirmar rechazo' }).click();

  await expect(dialog.getByText('Rechazada', { exact: true })).toBeVisible();
  await expect(dialog.getByText('No trabajo en esa zona.')).toBeVisible();
  expect(sent).toEqual({ reason: 'No trabajo en esa zona.' });
  await expect(page.locator('.request-card').getByText('Rechazada')).toBeVisible();
});

test('a taken timeframe shows the backend error and leaves the request pending', async ({ page }) => {
  await page.route('**/api/v1/job-requests/71/accept', route => route.fulfill({
    status: 409, json: { error: 'El horario se superpone con otro bloque de tu agenda' },
  }));
  const dialog = await openRequests(page, professionalId);
  const response = dialog.getByRole('region', { name: 'Responder solicitud' });

  await response.getByRole('button', { name: 'Aceptar' }).click();
  await response.getByLabel('Fecha').fill(tomorrow());
  await response.getByLabel('Desde').fill('09:00');
  await response.getByLabel('Hasta').fill('11:00');
  await response.getByRole('button', { name: 'Confirmar y aceptar' }).click();

  await expect(response.getByRole('alert')).toContainText('se superpone');
  await expect(dialog.getByText('Pendiente de respuesta', { exact: true })).toBeVisible();
});

test('the client who made the request cannot answer it', async ({ page }) => {
  const dialog = await openRequests(page, clientId);

  await expect(dialog.getByRole('heading', { name: 'Detalle de la solicitud' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Responder solicitud' })).toHaveCount(0);
  await expect(dialog.getByText('El profesional todavía no confirmó un horario.')).toBeVisible();
});

test('requests waiting for the professional stand out in the list', async ({ page }) => {
  const answered = proposedRequest({ id: 72, status: 'ACCEPTED', createdAt: new Date(Date.now() - 3600_000).toISOString() });
  await listRequests(page, professionalId, [proposedRequest(), answered]);

  await expect(page.getByRole('status').filter({ hasText: 'esperando tu respuesta' })).toContainText('Tienes 1 solicitud esperando tu respuesta');
  const urgent = page.locator('.request-card--needs-answer');
  await expect(urgent).toHaveCount(1);
  await expect(urgent.getByText('Requiere tu respuesta')).toBeVisible();
  await expect(urgent.getByRole('button', { name: 'Aceptar solicitud de Carla Cliente' })).toBeVisible();
  await expect(urgent.getByRole('button', { name: 'Rechazar solicitud de Carla Cliente' })).toBeVisible();

  await page.getByRole('button', { name: 'Ver por responder' }).click();
  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ver por responder' })).toHaveCount(0);
});

test('the client sees no answer alert for their own pending request', async ({ page }) => {
  await listRequests(page, clientId);

  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(page.locator('.request-card--needs-answer')).toHaveCount(0);
  await expect(page.getByText('esperando tu respuesta')).toHaveCount(0);
});

test('the client cancels their request, with a reason, after confirming', async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route('**/api/v1/job-requests/71/cancel', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: proposedRequest({ status: 'CANCELLED', cancelledBy: 'CLIENT', cancellationReason: sent!.reason }) });
  });
  const dialog = await openRequests(page, clientId);

  await dialog.getByRole('button', { name: 'Cancelar solicitud' }).click();
  const confirmation = dialog.getByRole('region', { name: '¿Cancelar la solicitud?' });
  await expect(confirmation).toContainText('todavía no la respondió');

  // Changing their mind leaves it as it was
  await confirmation.getByRole('button', { name: 'No, mantenerla' }).click();
  await expect(confirmation).toHaveCount(0);
  expect(sent).toBeNull();

  await dialog.getByRole('button', { name: 'Cancelar solicitud' }).click();
  await confirmation.getByLabel('Motivo (opcional)').fill('Ya lo resolví.');
  await confirmation.getByRole('button', { name: 'Sí, cancelar solicitud' }).click();

  await expect(dialog.getByText('Cancelada', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Ya lo resolví.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancelar solicitud' })).toHaveCount(0);
  expect(sent).toEqual({ reason: 'Ya lo resolví.' });
  await expect(page.locator('.request-card').getByText('Cancelada')).toBeVisible();
});

test('an accepted request too close to its start cannot be cancelled: the backend says why', async ({ page }) => {
  const start = new Date(Date.now() + 3600_000).toISOString();
  const end = new Date(Date.now() + 2 * 3600_000).toISOString();
  await page.route('**/api/v1/job-requests/71/cancel', route => route.fulfill({
    status: 400, json: { error: 'No se puede cancelar un trabajo con menos de 24 h de anticipación' },
  }));
  const dialog = await openRequests(page, clientId, proposedRequest({ status: 'ACCEPTED', scheduledStart: start, scheduledEnd: end }));

  await dialog.getByRole('button', { name: 'Cancelar solicitud' }).click();
  const confirmation = dialog.getByRole('region', { name: '¿Cancelar la solicitud?' });
  await expect(confirmation).toContainText('se libera el horario reservado');
  await confirmation.getByRole('button', { name: 'Sí, cancelar solicitud' }).click();

  await expect(confirmation.getByRole('alert')).toContainText('24 h de anticipación');
  await expect(dialog.getByText('Aceptada', { exact: true })).toBeVisible();
});

test('the professional is not offered to cancel a request still pending: "Rechazar" is their way out', async ({ page }) => {
  const dialog = await openRequests(page, professionalId);
  await expect(dialog.getByRole('button', { name: 'Cancelar solicitud' })).toHaveCount(0);
});

test('a completed request cannot be cancelled', async ({ page }) => {
  const dialog = await openRequests(page, clientId, proposedRequest({ status: 'COMPLETED' }));
  await expect(dialog.getByRole('button', { name: 'Cancelar solicitud' })).toHaveCount(0);
});

/** A professional who also hired someone: one request to answer and one of their own, both pending. */
function bothSides() {
  const received = proposedRequest();
  const sent = proposedRequest({
    id: 80, clientId: professionalId, clientName: 'Pablo Profesional',
    professionalId: '55555555-5555-4555-8555-555555555555', professionalName: 'Elena Electricista',
    tasks: [{ id: 2, tradeId: 2, tradeName: 'Electricidad', description: 'Revisar el tablero' }],
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  });
  return [received, sent];
}

test('a professional switches between the requests they received and the ones they sent', async ({ page }) => {
  await listRequests(page, professionalId, bothSides());
  const direction = page.getByRole('group', { name: 'Qué solicitudes ver' });

  await expect(direction.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(direction.getByRole('button', { name: /Recibidas/ })).toContainText('1');
  await expect(direction.getByRole('button', { name: /Enviadas/ })).toContainText('1');
  await expect(page.locator('.request-card')).toHaveCount(2);

  await direction.getByRole('button', { name: /Recibidas/ }).click();
  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(page.locator('.request-card')).toContainText('Carla Cliente');
  await expect(page.getByText('Trabajos que los clientes te pidieron a vos como profesional.')).toBeVisible();

  await direction.getByRole('button', { name: /Enviadas/ }).click();
  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(page.locator('.request-card')).toContainText('Elena Electricista');
  await expect(page.locator('.request-card--needs-answer')).toHaveCount(0);
});

test('a professional who never hired anyone sees why their sent requests are empty', async ({ page }) => {
  await listRequests(page, professionalId);

  await page.getByRole('group', { name: 'Qué solicitudes ver' }).getByRole('button', { name: /Enviadas/ }).click();
  await expect(page.getByRole('heading', { name: 'Todavía no hiciste solicitudes' })).toBeVisible();
});

test('a client does not get the received/sent switch: all their requests are sent', async ({ page }) => {
  await listRequests(page, clientId, [proposedRequest()], 'CLIENT');

  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Qué solicitudes ver' })).toHaveCount(0);
});

test('"Ver por responder" shows only what waits for the viewer, not their own pending requests', async ({ page }) => {
  await listRequests(page, professionalId, bothSides());

  await expect(page.getByRole('status').filter({ hasText: 'esperando tu respuesta' })).toContainText('Tienes 1 solicitud');
  await page.getByRole('button', { name: 'Ver por responder' }).click();

  await expect(page.getByRole('button', { name: 'Por responder' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(page.locator('.request-card--needs-answer')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ver por responder' })).toHaveCount(0);
});

/** An accepted job three days from now, so there is time enough to move it. */
function acceptedRequest(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 3 * 24 * 3600_000);
  return proposedRequest({
    status: 'ACCEPTED',
    scheduledStart: start.toISOString(),
    scheduledEnd: new Date(start.getTime() + 2 * 3600_000).toISOString(),
    ...overrides,
  });
}

test('the professional can reschedule an accepted job too, and then waits for the client', async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route('**/api/v1/job-requests/71/reschedule', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: acceptedRequest({
      status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'PROFESSIONAL',
      rescheduleStart: sent!.startTimestamp, rescheduleEnd: sent!.endTimestamp,
    }) });
  });
  await listRequests(page, professionalId, [acceptedRequest()]);
  const card = page.locator('.request-card');

  await card.getByRole('button', { name: 'Reagendar solicitud de Carla Cliente' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reagendar solicitud' });
  await dialog.getByLabel('Fecha').fill(tomorrow());
  await dialog.getByLabel('Desde').fill('15:00');
  await dialog.getByLabel('Hasta').fill('17:00');
  await dialog.getByRole('button', { name: 'Proponer horario' }).click();

  await expect(card.getByText('Cambio de horario pendiente')).toBeVisible();
  await expect(card).toContainText('Esperando a Carla Cliente');
  // Their own proposal: nothing for them to answer, and no second change on top of it
  await expect(card.getByRole('button', { name: /cambio de horario que pidió/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Reagendar solicitud de Carla Cliente' })).toHaveCount(0);
  expect(new Date(sent!.startTimestamp).getTime()).toBe(new Date(`${tomorrow()}T15:00`).getTime());
});

test('the client answers a reschedule the professional asked for', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  const pending = acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'PROFESSIONAL',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  });
  let answered = false;
  await page.route('**/api/v1/job-requests/71/reschedule/accept', route => {
    answered = true;
    return route.fulfill({ json: acceptedRequest({ scheduledStart: pending.rescheduleStart, scheduledEnd: pending.rescheduleEnd }) });
  });
  await listRequests(page, clientId, [pending], 'CLIENT');
  const card = page.locator('.request-card');

  await expect(card).toContainText('Pablo Profesional propone');
  // With a change to answer, answering it is the only thing to do about the timeframe
  await expect(card.getByRole('button', { name: 'Reagendar solicitud de Pablo Profesional' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Aceptar cambio de horario que pidió Pablo Profesional' }).click();
  // Shows the change being accepted before confirming it
  const dialog = page.getByRole('dialog', { name: '¿Aceptar el cambio de horario?' });
  await expect(dialog).toContainText('Pablo Profesional pidió mover el trabajo. El trabajo pasa al nuevo horario.');
  await expect(dialog).toContainText('Horario actual');
  await expect(dialog).toContainText('Nuevo horario');
  await expect(dialog.getByRole('button', { name: 'Rechazar cambio' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Aceptar cambio' }).click();

  await expect(page.getByText('Cambio aceptado')).toBeVisible();
  await expect(card.getByText('Aceptada')).toBeVisible();
  expect(answered).toBe(true);
});

test('the client who asked for a reschedule cannot answer it', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  const pending = acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'CLIENT',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  });
  await listRequests(page, clientId, [pending], 'CLIENT');

  await expect(page.locator('.request-card')).toContainText('Esperando a Pablo Profesional');
  await expect(page.getByRole('button', { name: /cambio de horario que pidió/ })).toHaveCount(0);
});

test('a reschedule from before either side could ask is the client\'s, so the professional answers it', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  const legacy = acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: null,
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  });
  await listRequests(page, professionalId, [legacy]);

  await expect(page.getByRole('button', { name: 'Aceptar cambio de horario que pidió Carla Cliente' })).toBeVisible();
});

test('a pending change can be seen and answered from the request detail', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  const pending = acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'PROFESSIONAL',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  });
  await page.route('**/api/v1/job-requests/71/reschedule/reject', route =>
    route.fulfill({ json: acceptedRequest({ scheduledStart: pending.scheduledStart, scheduledEnd: pending.scheduledEnd }) }));
  const detail = await openRequests(page, clientId, pending);

  const change = detail.getByRole('region', { name: 'Cambio de horario pendiente' });
  await expect(change).toContainText('Pablo Profesional propone mover el trabajo');
  await expect(change.getByRole('button', { name: 'Ver cambio' })).toHaveCount(0);
  await change.getByRole('button', { name: 'Rechazar' }).click();

  const review = page.getByRole('dialog', { name: '¿Rechazar el cambio de horario?' });
  await expect(review).toContainText('Se mantiene el horario actual.');
  await review.getByRole('button', { name: 'Rechazar cambio' }).click();

  await expect(review).toHaveCount(0);
  await expect(page.getByText('Cambio rechazado')).toBeVisible();
  // The detail stays open behind it, with the change resolved
  await expect(detail.getByText('Aceptada', { exact: true })).toBeVisible();
  await expect(detail.getByRole('region', { name: 'Cambio de horario pendiente' })).toHaveCount(0);
});

test('whoever asked for the change sees it in the detail, but has nothing to answer', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  const detail = await openRequests(page, professionalId, acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'PROFESSIONAL',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  }));

  await expect(detail.getByText(/Cambio pedido por vos/)).toBeVisible();
  await expect(detail.getByRole('region', { name: 'Cambio de horario pendiente' })).toHaveCount(0);
});

test('accepting a request from its card opens it with the timeframe to choose', async ({ page }) => {
  await listRequests(page, professionalId);

  await page.getByRole('button', { name: 'Aceptar solicitud de Carla Cliente' }).click();

  const response = page.getByRole('dialog', { name: 'Detalle de la solicitud' }).getByRole('region', { name: 'Responder solicitud' });
  await expect(response.getByLabel('Fecha')).toBeVisible();
  await expect(response.getByRole('button', { name: 'Confirmar y aceptar' })).toBeVisible();
});

test('rejecting a request from its card opens it with the reason to fill in', async ({ page }) => {
  await listRequests(page, professionalId);

  await page.getByRole('button', { name: 'Rechazar solicitud de Carla Cliente' }).click();

  const response = page.getByRole('dialog', { name: 'Detalle de la solicitud' }).getByRole('region', { name: 'Responder solicitud' });
  await expect(response.getByLabel('Motivo (opcional)')).toBeVisible();
  await expect(response.getByRole('button', { name: 'Confirmar rechazo' })).toBeVisible();
});

test('going back from a reschedule decision answers nothing', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  let answered = false;
  await page.route('**/api/v1/job-requests/71/reschedule/**', route => { answered = true; return route.abort(); });
  await listRequests(page, clientId, [acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'PROFESSIONAL',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  })], 'CLIENT');

  await page.getByRole('button', { name: 'Rechazar cambio de horario que pidió Pablo Profesional' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Rechazar el cambio de horario?' });
  await dialog.getByRole('button', { name: 'Volver' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.request-card').getByText('Cambio de horario pendiente')).toBeVisible();
  expect(answered).toBe(false);
});

test('a reschedule to answer is as urgent as a request to accept, for the client too', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  const changeForClient = acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'PROFESSIONAL',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  });
  await listRequests(page, clientId, [changeForClient, acceptedRequest({ id: 74 })], 'CLIENT');

  const alert = page.getByRole('status').filter({ hasText: 'esperando tu respuesta' });
  await expect(alert).toContainText('Tienes 1 solicitud esperando tu respuesta.');
  await expect(alert).toContainText('Te pidieron un cambio de horario: aceptalo o rechazalo.');
  const urgent = page.locator('.request-card--needs-answer');
  await expect(urgent).toHaveCount(1);
  await expect(urgent.getByText('Requiere tu respuesta')).toBeVisible();

  await page.getByRole('button', { name: 'Ver por responder' }).click();
  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Aceptar cambio de horario que pidió Pablo Profesional' })).toBeVisible();
});

test('the alert tells requests to accept and changes to answer apart', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  await listRequests(page, professionalId, [proposedRequest(), acceptedRequest({
    id: 75, status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'CLIENT',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  })]);

  await expect(page.getByRole('status').filter({ hasText: 'esperando tu respuesta' }))
    .toContainText('Tienes 2 solicitudes esperando tu respuesta. 1 pedido de trabajo y 1 cambio de horario para aceptar o rechazar.');
  await expect(page.locator('.request-card--needs-answer')).toHaveCount(2);
});

test('"Por responder" is not offered when nothing waits for the viewer', async ({ page }) => {
  await listRequests(page, clientId, [proposedRequest()], 'CLIENT');

  await expect(page.getByRole('button', { name: 'Pendientes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Por responder' })).toHaveCount(0);
});

test('only an accepted job offers to reschedule', async ({ page }) => {
  await listRequests(page, professionalId, [
    proposedRequest(),
    acceptedRequest({ id: 76, clientName: 'Eva Estévez' }),
    proposedRequest({ id: 77, clientName: 'Hugo Hernández', status: 'COMPLETED' }),
  ]);

  await expect(page.getByRole('button', { name: /^Reagendar solicitud de/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Reagendar solicitud de Eva Estévez' })).toBeVisible();
});

test('the professional cancels a job they had accepted, and the client is told who did', async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route('**/api/v1/job-requests/71/cancel', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: acceptedRequest({ status: 'CANCELLED', cancelledBy: 'PROFESSIONAL', cancellationReason: sent!.reason, scheduledStart: null, scheduledEnd: null }) });
  });
  const dialog = await openRequests(page, professionalId, acceptedRequest());

  await dialog.getByRole('button', { name: 'Cancelar solicitud' }).click();
  const confirmation = dialog.getByRole('region', { name: '¿Cancelar la solicitud?' });
  await expect(confirmation).toContainText('Ya la aceptaste: se libera el horario de tu agenda y Carla Cliente va a ver que la cancelaste.');
  await expect(confirmation.getByLabel('Motivo (opcional)')).toHaveAttribute('placeholder', 'Contale a Carla Cliente por qué la cancelás.');
  await confirmation.getByLabel('Motivo (opcional)').fill('Me surgió una urgencia.');
  await confirmation.getByRole('button', { name: 'Sí, cancelar solicitud' }).click();

  await expect(dialog.getByText('Cancelada', { exact: true })).toBeVisible();
  await expect(page.getByText('Carla Cliente va a ver que la cancelaste.')).toBeVisible();
  expect(sent).toEqual({ reason: 'Me surgió una urgencia.' });
});

test('the professional can also cancel while a change of timeframe is pending', async ({ page }) => {
  const newStart = new Date(Date.now() + 5 * 24 * 3600_000);
  const dialog = await openRequests(page, professionalId, acceptedRequest({
    status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'CLIENT',
    rescheduleStart: newStart.toISOString(), rescheduleEnd: new Date(newStart.getTime() + 2 * 3600_000).toISOString(),
  }));

  await expect(dialog.getByRole('button', { name: 'Cancelar solicitud' })).toBeVisible();
});

test('the request detail shows where the job is on the map', async ({ page }) => {
  const searches: string[] = [];
  await listRequests(page, clientId);
  // Registered after listRequests' blank one, so it is the one that answers
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    searches.push(new URL(route.request().url()).searchParams.get('q') ?? '');
    return route.fulfill({
      contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([{ lat: '-34.8941', lon: '-56.1525', boundingbox: ['-34.8950', '-34.8930', '-56.1535', '-56.1515'] }]),
    });
  });

  await page.getByRole('button', { name: /^Ver solicitud de/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Detalle de la solicitud' });

  await expect(dialog.getByRole('region', { name: 'Mapa de Av. Italia 1234' })).toBeVisible();
  expect(searches.some(query => query.includes('Av. Italia 1234'))).toBe(true);
});

test('an address the map cannot find says so, and the rest of the detail is there', async ({ page }) => {
  const dialog = await openRequests(page, clientId);

  await expect(dialog.getByText('No pudimos ubicar esta dirección en el mapa.')).toBeVisible();
  await expect(dialog.getByText('Cambiar la canilla de la cocina')).toBeVisible();
});

const requestsLink = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: /Mis solicitudes/ });

test('the header warns on "Mis solicitudes" when something waits for the user, from any page', async ({ page }) => {
  await mockVerifiedSession(page, { name: 'Pablo Profesional', email: 'pablo@qa.test', role: 'PROFESSIONAL' });
  await page.route('**/api/v1/job-requests/mine', route => route.fulfill({ json: [proposedRequest()] }));
  await page.addInitScript(([token, id]) => {
    localStorage.setItem('oficiosya_token', token);
    localStorage.setItem('oficiosya_user', JSON.stringify({ id, name: 'Pablo', email: 'pablo@qa.test', role: 'PROFESSIONAL' }));
  }, [fakeJwt(), professionalId] as const);
  await page.goto('/');

  await expect(requestsLink(page).locator('.nav-alert')).toHaveText('!');
  await expect(requestsLink(page)).toHaveAccessibleName('Mis solicitudes (1 solicitud espera tu respuesta)');
});

test('with nothing waiting, "Mis solicitudes" has no alert', async ({ page }) => {
  await listRequests(page, clientId, [proposedRequest()], 'CLIENT');

  await expect(page.locator('.request-card')).toHaveCount(1);
  await expect(requestsLink(page).locator('.nav-alert')).toHaveCount(0);
});

test('answering the last request that waits takes the alert away', async ({ page }) => {
  await page.route('**/api/v1/job-requests/71/reject', route => route.fulfill({ json: proposedRequest({ status: 'REJECTED' }) }));
  await listRequests(page, professionalId);
  await expect(requestsLink(page).locator('.nav-alert')).toBeVisible();

  await page.getByRole('button', { name: 'Rechazar solicitud de Carla Cliente' }).click();
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();

  await expect(page.getByRole('dialog', { name: 'Detalle de la solicitud' }).getByText('Rechazada', { exact: true })).toBeVisible();
  await expect(requestsLink(page).locator('.nav-alert')).toHaveCount(0);
});

test('an accepted job can be rescheduled from its detail too, which then shows the change asked for', async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route('**/api/v1/job-requests/71/reschedule', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: acceptedRequest({
      status: 'RESCHEDULE_REQUESTED', rescheduleRequestedBy: 'CLIENT',
      rescheduleStart: sent!.startTimestamp, rescheduleEnd: sent!.endTimestamp,
    }) });
  });
  const detail = await openRequests(page, clientId, acceptedRequest());

  await detail.getByRole('button', { name: 'Reagendar' }).click();
  const form = page.getByRole('dialog', { name: 'Reagendar solicitud' });
  await form.getByLabel('Fecha').fill(tomorrow());
  await form.getByLabel('Desde').fill('15:00');
  await form.getByLabel('Hasta').fill('17:00');
  await form.getByRole('button', { name: 'Proponer horario' }).click();

  await expect(form).toHaveCount(0);
  await expect(detail.getByText('Cambio de horario pendiente', { exact: true })).toBeVisible();
  await expect(detail.getByText(/Cambio pedido por vos/)).toBeVisible();
  // A change waits for the professional now: no second one on top
  await expect(detail.getByRole('button', { name: 'Reagendar' })).toHaveCount(0);
  expect(new Date(sent!.startTimestamp).getTime()).toBe(new Date(`${tomorrow()}T15:00`).getTime());
});

test('the detail only offers to reschedule an accepted job', async ({ page }) => {
  const detail = await openRequests(page, professionalId);

  await expect(detail.getByRole('heading', { name: 'Detalle de la solicitud' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Reagendar' })).toHaveCount(0);
});
