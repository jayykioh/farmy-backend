import { test, expect } from '@playwright/test';
import { ENDPOINTS } from '../helpers/constants';
import { login, authHeader, parseSSE } from '../helpers/api.helpers';
import * as crypto from 'crypto';

test.describe('Journey 3: AI Chat (RAG) + SSE Streaming', () => {
  let token: string;
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    token = await login(request);
  });

  test('should stream chat completion using server-sent events (SSE)', async ({ request }) => {
    const clientMessageId = crypto.randomUUID();

    const response = await request.post(ENDPOINTS.CHAT_STREAM, {
      headers: {
        ...authHeader(token),
        'Accept': 'text/event-stream',
      },
      data: {
        message: 'Tôi nên tưới nước cho cây dưa lưới thế nào?',
        client_message_id: clientMessageId,
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');

    const bodyText = await response.text();
    const events = parseSSE(bodyText);

    // Verify presence of critical events in order
    expect(events.length).toBeGreaterThan(0);
    
    const metaEvent = events.find((e) => e.event === 'meta');
    expect(metaEvent).toBeDefined();
    expect((metaEvent?.data as any).session_id).toBeDefined();
    
    // Store session id for history testing
    sessionId = (metaEvent?.data as any).session_id;

    // Tokens should be generated
    const tokenEvents = events.filter((e) => e.event === 'token');
    expect(tokenEvents.length).toBeGreaterThan(0);

    // Done marker
    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent?.data as any).assistant_message_id).toBeDefined();
  });

  test('should retrieve active sessions listing including the new session', async ({ request }) => {
    const res = await request.get(ENDPOINTS.CHAT_SESSIONS, {
      headers: authHeader(token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    const session = body.data.find((s: any) => s._id === sessionId);
    expect(session).toBeDefined();
  });

  test('should list messages within the newly created session', async ({ request }) => {
    const res = await request.get(`${ENDPOINTS.CHAT_SESSIONS}/${sessionId}/messages`, {
      headers: authHeader(token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2); // Prompt + response
  });
});
