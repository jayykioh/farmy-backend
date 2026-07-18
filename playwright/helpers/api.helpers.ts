import { APIRequestContext } from '@playwright/test';
import { ENDPOINTS, TEST_USERS, FarmyResponse } from './constants';

/**
 * Login helper — returns access token.
 * Nên dùng trong beforeAll() của mỗi describe block.
 */
export async function login(
  request: APIRequestContext,
  credentials = TEST_USERS.regular,
): Promise<string> {
  const res = await request.post(ENDPOINTS.LOGIN, {
    data: {
      email: credentials.email,
      password: credentials.password,
    },
  });

  if (!res.ok()) {
    throw new Error(
      `Login failed for ${credentials.email}: HTTP ${res.status()} — ${await res.text()}`,
    );
  }

  const body = (await res.json()) as FarmyResponse<{
    access_token: string;
    user: { id: string; email: string; name: string; role: string };
  }>;

  if (!body.data?.access_token) {
    throw new Error(`Login response missing access_token: ${JSON.stringify(body)}`);
  }

  return body.data.access_token;
}

/**
 * Build Authorization header object for authenticated requests.
 */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Parse Server-Sent Events (SSE) raw text into structured events.
 *
 * SSE format:
 *   event: <name>\n
 *   data: <json>\n\n
 */
export interface SSEEvent {
  event: string;
  data: unknown;
}

export function parseSSE(rawText: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  // Split by double newline (event separator)
  const chunks = rawText.split('\n\n').filter((c) => c.trim().length > 0);

  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    let eventName = 'message';
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventName = line.slice('event: '.length).trim();
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice('data: '.length).trim();
      }
    }

    if (dataLine) {
      try {
        events.push({ event: eventName, data: JSON.parse(dataLine) });
      } catch {
        events.push({ event: eventName, data: dataLine });
      }
    }
  }

  return events;
}
