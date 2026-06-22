# 🔌 Backend API Contract — Farmy

Tài liệu này mô tả cách FE kết nối với backend.  
Cập nhật: 08/06/2026

---

## Base URL

| Môi trường | URL |
|-----------|-----|
| Local dev | `http://localhost:3000` |
| Production | `https://your-api-domain.com` (cập nhật khi deploy) |

FE lưu vào `.env.local`:
```env
VITE_API_URL=http://localhost:3000/api/v1
```

---

## Response Format chuẩn

**Tất cả** responses đều theo format sau:

```ts
// Thành công (có data)
{ success: true, data: T }

// Thành công (chỉ message)
{ success: true, message: string }

// Lỗi
{ error_code: string, message: string }
```

---

## Authentication

### Setup FE — Axios client
```ts
// src/api/client.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL, // http://localhost:3000/api/v1
  withCredentials: true, // ← BẮT BUỘC — để refresh_token cookie được gửi kèm
});

// Lưu access token vào memory (không localStorage!)
let _accessToken: string | null = null;

export const setAccessToken = (token: string) => { _accessToken = token; };
export const getAccessToken = () => _accessToken;

// Tự động gắn Bearer token vào mọi request
apiClient.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// Auto-refresh khi 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const res = await apiClient.post('/auth/refresh'); // cookie tự gửi
        const newToken = res.data.data.access_token;
        setAccessToken(newToken);
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient.request(error.config);
      } catch {
        setAccessToken(null);
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

### Lưu ý về Token

| Item | Vị trí | Ghi chú |
|------|--------|---------|
| `access_token` | Response body → memory (JS variable) | **Không** lưu localStorage |
| `refreshToken` | HttpOnly Cookie `refresh_token` | Browser tự quản lý |
| Cookie path | `/api/v1/auth` | Cookie chỉ gửi với auth routes |

---

## Endpoints

### Auth — `/api/v1/auth`

#### `POST /auth/register`
```ts
// Request
{ email: string; password: string; name: string }

// Response 201
{
  success: true,
  message: "Đăng ký tài khoản thành công...",
  data: {
    user_id: string,
    email: string,
    name: string,
    access_token: string
  }
}
```

#### `POST /auth/login`
```ts
// Request
{ email: string; password: string }

// Response 200
{
  success: true,
  data: {
    access_token: string,  // lưu vào memory
    expires_in: 900,       // 15 phút
    user: { id, email, name, role }
  }
}
// + Set-Cookie: refresh_token=...; HttpOnly; Path=/api/v1/auth
```

#### `POST /auth/refresh`
```ts
// Request: không cần body, refresh_token cookie tự gửi (withCredentials: true)

// Response 200
{
  success: true,
  data: {
    access_token: string,
    expires_in: 900,
    user: { id, email, name, role }
  }
}
```

#### `POST /auth/logout`
```ts
// Response 200
{ success: true, message: "Đăng xuất thành công!" }
// Cookie refresh_token bị xóa
```

#### `GET /auth/me` — 🔐 Bearer token required
```ts
// Response 200
{
  success: true,
  data: { id, email, name, role }
}
```

---

### Farm Plots — `/api/v1/plots` — 🔐

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/plots` | Tạo mảnh vườn |
| GET | `/plots` | Danh sách mảnh vườn của user |
| GET | `/plots/:id` | Chi tiết 1 mảnh vườn |
| PUT | `/plots/:id` | Cập nhật |
| DELETE | `/plots/:id` | Xóa (204 No Content) |

```ts
// POST /plots — Request body
{ name: string; area_size: number; description?: string }

// Response data
{ _id, user_id, name, area_size, description, created_at }
```

---

### Diaries — `/api/v1/diaries` — 🔐

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/diaries` | Tạo nhật ký |
| GET | `/diaries` | Danh sách nhật ký |
| GET | `/diaries/:id` | Chi tiết |
| PUT | `/diaries/:id` | Cập nhật |
| DELETE | `/diaries/:id` | Xóa |
| POST | `/diaries/:diaryId/logs` | Thêm log hoạt động |
| GET | `/diaries/:diaryId/logs` | Danh sách logs |
| GET | `/diaries/logs/:id` | Chi tiết log |
| PUT | `/diaries/logs/:id` | Cập nhật log |
| DELETE | `/diaries/logs/:id` | Xóa log |

```ts
// POST /diaries — Request body
{ plot_id: string; crop_type: string; start_date: string }

// POST /diaries/:diaryId/logs — Request body
{ activity_type: string; content: string; image_url?: string }
```

---

### Reminders — `/api/v1/reminders` — 🔐

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/reminders` | Tạo nhắc nhở |
| GET | `/reminders` | Tất cả nhắc nhở |
| GET | `/reminders/pending` | Nhắc nhở chờ xử lý |
| GET | `/reminders/:id` | Chi tiết |
| PUT | `/reminders/:id` | Cập nhật |
| PATCH | `/reminders/:id/complete` | Đánh dấu hoàn thành |
| PATCH | `/reminders/:id/cancel` | Hủy |
| DELETE | `/reminders/:id` | Xóa |

```ts
// POST /reminders — Request body
{
  title: string;
  remind_at: string;          // ISO date string
  diary_id?: string;
  type?: 'diary' | 'water' | 'fertilize' | 'weekly_insight' | 'streak_milestone' | 'plant_alert';
  schedule_slot?: 'morning' | 'noon' | 'afternoon' | 'evening';
  action_type?: string;
  action_detail?: string;
  repeat?: 'none' | 'daily' | 'weekly';
}
```

---

### Pet Mascot — `/api/v1/pet` — 🔐

#### `GET /pet/state`
```ts
// Response 200
{
  success: true,
  data: {
    _id: string,
    user_id: string,
    mood: 'happy' | 'excited' | 'neutral' | 'sad' | 'worried',
    streak_count: number,   // Số ngày ghi nhật ký liên tiếp
    level: number,
    xp: number,
    mood_reason: string,
    last_diary_at: string | null,
    updated_at: string,
    bubble_message: string  // Câu thoại hiển thị lên bong bóng
  }
}
```

**Mapping mood → UI:**
| mood | SVG/Lottie | Gợi ý |
|------|-----------|-------|
| `happy` | Thú vui vẻ 🌱 | Animation nhẹ nhàng |
| `excited` | Thú nhảy múa 🎉 | Animation nhanh |
| `neutral` | Thú đứng yên | Static hoặc idle |
| `sad` | Thú buồn 😢 | Animation chậm |
| `worried` | Thú lo lắng 😰 | Animation rung nhẹ |

---

### System — 🔓 Public

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Health check (DB + Redis) |
| GET | `/` | Hello |

---

## Error Codes (Auth)

| error_code | HTTP | Tình huống |
|-----------|------|-----------|
| `AUTH_MISSING_ACCESS_TOKEN` | 401 | Không có Bearer token |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token hết hạn |
| `AUTH_INVALID_TOKEN` | 401 | Token sai chữ ký |
| `AUTH_INVALID_CREDENTIALS` | 401 | Sai email/password |
| `AUTH_EMAIL_EXISTS` | 409 | Email đã tồn tại |
| `AUTH_REFRESH_FAILED` | 401 | Refresh token không hợp lệ |
| `AUTH_TOKEN_REUSED` | 401 | Phát hiện tấn công reuse token |
| `AUTH_FORBIDDEN` | 403 | Không đủ quyền |

---

## Gaps cần làm sau (chưa có BE)

| FE cần | Tình trạng BE |
|--------|--------------|
| `/users/me` hay `/profile/me` | → Dùng `GET /api/v1/auth/me` |
| `/diary` | → Dùng `GET /api/v1/diaries` |
| `/chat/sessions` | ❌ Chưa có |
| `/plant-scan/diagnose` | ❌ Chưa có |
| `/pet/items`, `/pet/equip` | ❌ Chưa có |
| `/snaps/feed`, `/snaps` | ❌ Chưa có |
| Upload file endpoint | ❌ R2 service xong, chưa expose HTTP |
