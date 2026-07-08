import { test, expect } from '@playwright/test';
import { ENDPOINTS, TEST_USERS, FarmyResponse, FarmyError } from '../helpers/constants';
import { login, authHeader } from '../helpers/api.helpers';

test.describe('Journey 1: Auth Flow', () => {
  let userToken: string;

  test('should successfully log in as seed user', async ({ request }) => {
    const res = await request.post(ENDPOINTS.LOGIN, {
      data: {
        email: TEST_USERS.regular.email,
        password: TEST_USERS.regular.password,
      },
    });

    expect(res.status()).toBe(200);
    const body = (await res.json()) as FarmyResponse<{ access_token: string }>;
    expect(body.success).toBe(true);
    expect(body.data?.access_token).toBeDefined();
    userToken = body.data!.access_token;
  });

  test('should get profile details using access token', async ({ request }) => {
    const res = await request.get(ENDPOINTS.ME, {
      headers: authHeader(userToken),
    });

    expect(res.status()).toBe(200);
    const body = (await res.json()) as FarmyResponse<{ email: string }>;
    expect(body.success).toBe(true);
    expect(body.data?.email).toBe(TEST_USERS.regular.email);
  });

  test('should fail to access profile with invalid token', async ({ request }) => {
    const res = await request.get(ENDPOINTS.ME, {
      headers: authHeader('invalid-token-value'),
    });

    expect(res.status()).toBe(401);
  });

  test('should support token refresh using cookie jar', async ({ request }) => {
    // Refresh token endpoint gets the refresh_token from cookies set on login
    const res = await request.post(ENDPOINTS.REFRESH);
    
    expect(res.status()).toBe(200);
    const body = (await res.json()) as FarmyResponse<{ access_token: string }>;
    expect(body.success).toBe(true);
    expect(body.data?.access_token).toBeDefined();
  });

  test('should successfully log out and clean cookie state', async ({ request }) => {
    const res = await request.post(ENDPOINTS.LOGOUT);
    expect(res.status()).toBe(200);

    const body = (await res.json()) as FarmyResponse;
    expect(body.success).toBe(true);
  });
});
