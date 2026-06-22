# API Wiring Specification (FE-BE Integration)

*Single source of truth cho việc tích hợp giữa React Frontend và NestJS Backend.*

## 1. Network & Client Configuration

- **API Base URL**: Được quản lý qua `import.meta.env.VITE_API_URL`. Khi chạy local: `http://localhost:3000/api/v1`.
- **Axios Client (`src/api/client.ts`)**: 
  - Bắt buộc phải có `withCredentials: true` trên mọi request để đảm bảo Refresh Token (được lưu trong HttpOnly Cookie) có thể gửi đi và nhận về.
  - Tự động gắn Bearer Token (`accessToken`) vào header `Authorization`.
  - Tự động bắt lỗi HTTP 401 để gọi `POST /auth/refresh`, rotate token, và thực hiện lại các request đang pending.

## 2. Response Standard

Mọi response từ backend khi HTTP status = `2xx` đều có dạng:
```typescript
type ApiResponse<T> = {
  success: true;
  data: T; // Hoặc message: string
}
```

## 3. Data Mapping & Conventions

> **Quan Trọng**: Backend của Farmy sử dụng chuẩn `snake_case` cho hầu hết các field name (do map trực tiếp từ MongoDB Document và DTO).
> Để tránh lộn xộn, Frontend API interfaces/types cũng sẽ sử dụng `snake_case` tại tầng giao tiếp API. 

### 3.1. Auth Module (`/auth`)
- **Login**: `POST /auth/login` - Payload: `{ email, password }` -> Returns `accessToken` (đây là ngoại lệ dùng camelCase từ Backend).
- **Register**: `POST /auth/register` - Payload: `{ name, email, password }`.
- **Me**: `GET /auth/me` -> Returns `{ id, email, name, role }`.

### 3.2. Farm Plots Module (`/plots`)
Mảnh vườn (plot) là thực thể cha của Diary. Bắt buộc phải có plot mới tạo được diary.
- **GET All**: `GET /plots` -> Returns `Plot[]`.
- **Create**: `POST /plots` -> Payload: `{ name: string, area_size: number, description?: string }`.
- **Update**: `PUT /plots/:id` -> Payload: (như Create).

*Type mapping*:
```typescript
type Plot = {
  _id: string;
  user_id: string;
  name: string;
  area_size: number;
  description?: string;
  created_at: string;
}
```

### 3.3. Diaries & Logs Module (`/diaries`)
Nhật ký gieo trồng (Diary) quản lý vòng đời 1 loại cây trồng trên 1 mảnh vườn. Hoạt động hàng ngày (tưới cây, bón phân...) được ghi vào Logs.

- **Create Diary**: `POST /diaries` -> Payload: `{ plot_id: string, crop_type: string, start_date: string }`.
- **Get Diaries**: `GET /diaries`.
- **Create Log**: `POST /diaries/:diaryId/logs` -> Payload: `{ activity_type: string, content: string, image_url?: string }`.
- **Get Logs**: `GET /diaries/:diaryId/logs`.

*Type mapping*:
```typescript
type Diary = {
  _id: string;
  plot_id: string;
  crop_type: string;
  start_date: string;
  status: string;
}

type DiaryLog = {
  _id: string;
  diary_id: string;
  activity_type: string;
  content: string;
  image_url?: string;
  created_at: string;
}
```

### 3.4. Reminders Module (`/reminders`)
Tạo các nhắc nhở, tự động chạy qua BullMQ.

- **Get All**: `GET /reminders`.
- **Get Pending**: `GET /reminders/pending`.
- **Create**: `POST /reminders` -> Payload: 
  `{ title: string, remind_at: string, type?: string, schedule_slot?: string, repeat?: string, diary_id?: string }`
- **Complete**: `PATCH /reminders/:id/complete` (Chuyển sang Done và kích mood cho Thú mascot).
- **Cancel**: `PATCH /reminders/:id/cancel`.

### 3.5. Pet Mascot Module (`/pet`)
Trạng thái Thú Ảo. Mood sẽ thay đổi dựa vào số lượng log tạo ra và việc hoàn thành nhắc nhở.

- **Get State**: `GET /pet/state`
- Returns:
```typescript
type PetState = {
  _id: string;
  mood: 'happy' | 'excited' | 'neutral' | 'sad' | 'worried';
  streak_count: number;
  level: number;
  xp: number;
  mood_reason: string;
  bubble_message: string;
}
```
