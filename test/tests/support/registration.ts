import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

export const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:8080';

/** Mailpit: the fake inbox `docker compose --profile dev up mailpit` starts, where the app's emails land. */
export const MAIL_BASE = process.env.MAIL_BASE_URL ?? 'http://localhost:8025';

interface MailSummary {
  ID: string;
}

async function postJson(request: APIRequestContext, url: string, payload: unknown) {
  return request.post(url, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify(payload)
  });
}

/** Emails sent to `email`, newest first. */
export async function mailsTo(request: APIRequestContext, email: string): Promise<MailSummary[]> {
  const response = await request.get(`${MAIL_BASE}/api/v1/search`, {
    params: { query: `to:${email.toLowerCase()}` }
  });
  expect(response.ok(), `Mailpit no responde en ${MAIL_BASE}: ¿está levantado (docker compose --profile dev up mailpit)?`).toBeTruthy();
  return (await response.json()).messages ?? [];
}

/**
 * The code in the newest email to `email`, once at least `messages` emails have arrived
 * (a resend is the second one, and so on).
 */
export async function waitForVerificationCode(request: APIRequestContext, email: string, messages = 1): Promise<string> {
  let inbox: MailSummary[] = [];
  await expect.poll(async () => (inbox = await mailsTo(request, email)).length, {
    message: `no llegó el correo con el código a ${email}`,
    timeout: 15_000
  }).toBeGreaterThanOrEqual(messages);

  const detail = await (await request.get(`${MAIL_BASE}/api/v1/message/${inbox[0].ID}`)).json();
  const match = /es:\s*(\d+)/.exec(detail.Text);
  expect(match, `el correo no trae un código: ${detail.Text}`).not.toBeNull();
  return match![1];
}

/** For "nothing was sent": gives a late email a moment to show up, then checks the count. */
export async function expectMailCount(request: APIRequestContext, email: string, count: number) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(await mailsTo(request, email)).toHaveLength(count);
}

/** A code that is not `code`. */
export function otherCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

export function startClientRegistration(request: APIRequestContext, payload: { name: string; email: string; password: string }) {
  return postJson(request, `${API_BASE}/api/v1/auth/register-client`, payload);
}

export function startProfessionalRegistration(request: APIRequestContext, payload: {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  workingLocation?: string;
}) {
  return postJson(request, `${API_BASE}/api/v1/auth/register-professional`, payload);
}

export function verifyEmail(request: APIRequestContext, email: string, code: string) {
  return postJson(request, `${API_BASE}/api/v1/auth/verify-email`, { email, code });
}

export function resendCode(request: APIRequestContext, email: string) {
  return postJson(request, `${API_BASE}/api/v1/auth/resend-code`, { email });
}

/**
 * Finishes a registration that was just started: reads the code from the inbox and verifies
 * it, so the result is the login the old one-step registration returned. A start that was
 * refused (validation) is returned as is, since there is no code to wait for.
 */
export async function completeRegistration(request: APIRequestContext, started: APIResponse, email: string): Promise<APIResponse> {
  if (started.status() !== 202) {
    return started;
  }
  return verifyEmail(request, email, await waitForVerificationCode(request, email));
}
