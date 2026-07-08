import { test, expect } from '@playwright/test';
import { ENDPOINTS } from '../helpers/constants';
import { login, authHeader } from '../helpers/api.helpers';

test.describe('Journey 4 & 5: Plant Scan & Pet Mascot', () => {
  let token: string;
  let scanId: string;

  test.beforeAll(async ({ request }) => {
    token = await login(request);
  });

  // ----------------------------------------------------
  // Journey 4: Plant Scan
  // ----------------------------------------------------
  test('should fail plant scan request when file is missing', async ({ request }) => {
    const res = await request.post(ENDPOINTS.PLANT_SCANS, {
      headers: authHeader(token),
      // No multipart file attached
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('SCAN_INVALID_FILE');
  });

  // ----------------------------------------------------
  // Journey 5: Pet Mascot
  // ----------------------------------------------------
  test('should retrieve current pet mascot status', async ({ request }) => {
    const res = await request.get(ENDPOINTS.PET_STATUS, {
      headers: authHeader(token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mood).toBeDefined();
    expect(body.data.streak_count).toBeDefined();
  });

  test('should recalculate pet status', async ({ request }) => {
    const res = await request.post(ENDPOINTS.PET_RECALCULATE, {
      headers: authHeader(token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mood).toBeDefined();
  });

  test('should fallback correctly using deprecated state endpoint', async ({ request }) => {
    const res = await request.get(ENDPOINTS.PET_STATE, {
      headers: authHeader(token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mood).toBeDefined();
  });
});
