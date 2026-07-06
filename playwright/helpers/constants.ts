/**
 * Farmy E2E — Shared test constants
 *
 * Seeded accounts (từ database-seed.service.ts):
 *  - user@farmy.com / UserPassword123  (role: user)
 *  - admin@farmy.com / AdminPassword123 (role: admin)
 */
export const TEST_USERS = {
  regular: {
    email: 'user@farmy.com',
    password: 'UserPassword123',
    name: 'Nguyễn Văn Ruộng',
  },
  admin: {
    email: 'admin@farmy.com',
    password: 'AdminPassword123',
    name: 'Farmy Admin',
  },
} as const;

export const API_BASE = '/api/v1';

export const ENDPOINTS = {
  // Auth
  REGISTER: `${API_BASE}/auth/register`,
  LOGIN: `${API_BASE}/auth/login`,
  REFRESH: `${API_BASE}/auth/refresh`,
  LOGOUT: `${API_BASE}/auth/logout`,
  ME: `${API_BASE}/auth/me`,

  // Farm
  PLOTS: `${API_BASE}/plots`,
  DIARIES: `${API_BASE}/diaries`,
  REMINDERS: `${API_BASE}/reminders`,

  // Chat
  CHAT_STREAM: `${API_BASE}/chat/stream`,
  CHAT_SESSIONS: `${API_BASE}/chat/sessions`,

  // Plant Scan
  PLANT_SCANS: `${API_BASE}/plant-scans`,

  // Pet
  PET_STATUS: `${API_BASE}/pet/status`,
  PET_RECALCULATE: `${API_BASE}/pet/recalculate`,
  PET_STATE: `${API_BASE}/pet/state`,
} as const;

/** Standard success response format from Farmy backend */
export interface FarmyResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

/** Standard error response format */
export interface FarmyError {
  error_code: string;
  message: string;
}
