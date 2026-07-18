import { test, expect } from '@playwright/test';
import { ENDPOINTS } from '../helpers/constants';
import { login, authHeader } from '../helpers/api.helpers';

test.describe('Journey 2: Farm Core CRUD', () => {
  let token: string;
  let plotId: string;
  let diaryId: string;
  let logId: string;
  let reminderId: string;

  test.beforeAll(async ({ request }) => {
    token = await login(request);
  });

  test('should create a farm plot', async ({ request }) => {
    const res = await request.post(ENDPOINTS.PLOTS, {
      headers: authHeader(token),
      data: {
        name: 'Vườn thực nghiệm Playwright',
        area_size: 150,
        description: 'Vườn tạo bởi kiểm thử E2E Playwright',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBeDefined();
    plotId = body.data._id;
  });

  test('should retrieve plots list and find the created plot', async ({ request }) => {
    const res = await request.get(ENDPOINTS.PLOTS, {
      headers: authHeader(token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    const plot = body.data.find((p: any) => p._id === plotId);
    expect(plot).toBeDefined();
    expect(plot.name).toBe('Vườn thực nghiệm Playwright');
  });

  test('should create a crop diary on the plot', async ({ request }) => {
    const res = await request.post(ENDPOINTS.DIARIES, {
      headers: authHeader(token),
      data: {
        plot_id: plotId,
        crop_type: 'Dưa lưới Playwright',
        start_date: new Date().toISOString(),
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBeDefined();
    diaryId = body.data._id;
  });

  test('should create a daily log for the diary', async ({ request }) => {
    const res = await request.post(`${ENDPOINTS.DIARIES}/${diaryId}/logs`, {
      headers: authHeader(token),
      data: {
        activity_type: 'Tưới nước',
        content: 'Tưới đẫm bằng hệ thống phun sương',
        image_url: 'https://example.com/playwright-test.jpg',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBeDefined();
    logId = body.data._id;
  });

  test('should create a reminder linked to the diary', async ({ request }) => {
    const res = await request.post(ENDPOINTS.REMINDERS, {
      headers: authHeader(token),
      data: {
        title: 'Tưới nước dưa lưới Playwright',
        remind_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        diary_id: diaryId,
        type: 'water',
        schedule_slot: 'morning',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBeDefined();
    reminderId = body.data._id;
  });

  test('should mark the reminder as completed', async ({ request }) => {
    const res = await request.patch(`${ENDPOINTS.REMINDERS}/${reminderId}/complete`, {
      headers: authHeader(token),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.is_sent).toBe(true);
  });

  test('should clean up all created resources in correct order', async ({ request }) => {
    // Delete reminder
    const resRem = await request.delete(`${ENDPOINTS.REMINDERS}/${reminderId}`, {
      headers: authHeader(token),
    });
    expect(resRem.status()).toBe(204);

    // Delete log
    const resLog = await request.delete(`${ENDPOINTS.DIARIES}/logs/${logId}`, {
      headers: authHeader(token),
    });
    expect(resLog.status()).toBe(204);

    // Delete diary
    const resDiary = await request.delete(`${ENDPOINTS.DIARIES}/${diaryId}`, {
      headers: authHeader(token),
    });
    expect(resDiary.status()).toBe(204);

    // Delete plot
    const resPlot = await request.delete(`${ENDPOINTS.PLOTS}/${plotId}`, {
      headers: authHeader(token),
    });
    expect(resPlot.status()).toBe(204);
  });
});
