# FarmDiaries AI — Authentication & Authorization Specification
### JWT Cookie Rotation · Supabase Integration · Zalo OAuth OIDC · Security Guardrails

| Thuộc tính | Giá trị |
|---|---|
| **Dự án** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tài liệu** | Authentication & Authorization Specification |
| **Đường dẫn** | `openspec/specs/auth_spec.md` |
| **Trạng thái** | Active · specs folder |

---

## 1. Kiến trúc Tổng quan (Auth Architecture Overview)

Hệ thống xác thực của FarmDiaries AI là sự kết hợp giữa **Supabase Auth** (quản lý người dùng, OIDC, xác thực bên thứ ba) và **NestJS Session Layer** (quản lý quay vòng token an toàn qua cookie bảo mật).

```
                      +-----------------------------+
                      |     React Vite PWA Client   |
                      +------+---------------+------+
                             |               ^
        1. Login Request     |               | 4. Access Token (JSON)
        (Email/Password)     |               |    Refresh Token (HTTP-Only Cookie)
                             v               |
                      +------+---------------+------+
                      |      NestJS AuthModule      |
                      +------+---------------+------+
                             |               |
        2. Authenticate      |               | 3. Create Custom Session
        Credentials          v               v
                      +------+---------------+------+
                      |     Supabase Auth Engine    |
                      +-----------------------------+
```

---

## 2. API Endpoints Đặc tả (API Reference)

Tất cả các API Endpoints thuộc Module Auth đều có tiền tố `/api/v1/auth`.

### 2.1 Đăng ký tài khoản (Register)
*   **Endpoint:** `POST /api/v1/auth/register`
*   **Xác thực:** Public
*   **Payload DTO (`RegisterDto`):**
    ```typescript
    export class RegisterDto {
      @IsEmail({}, { message: 'Email không đúng định dạng!' })
      @IsNotEmpty({ message: 'Email không được để trống!' })
      email: string;

      @IsString()
      @MinLength(8, { message: 'Mật khẩu phải chứa ít nhất 8 ký tự!' })
      @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
        message: 'Mật khẩu quá yếu! Phải gồm chữ hoa, chữ thường và chữ số.',
      })
      password: string;

      @IsString()
      @IsNotEmpty({ message: 'Họ tên không được để trống!' })
      name: string;
    }
    ```
*   **Response (201 Created):**
    ```json
    {
      "success": true,
      "message": "Đăng ký tài khoản thành công. Vui lòng xác thực email nếu cần!",
      "data": {
        "user_id": "d748f328-761b-4f9e-a035-715a4b75a133",
        "email": "nongdan@gmail.com",
        "name": "Nguyễn Văn Ruộng"
      }
    }
    ```

### 2.2 Đăng nhập (Login)
*   **Endpoint:** `POST /api/v1/auth/login`
*   **Xác thực:** Public
*   **Payload DTO (`LoginDto`):**
    ```typescript
    export class LoginDto {
      @IsEmail()
      email: string;

      @IsString()
      @IsNotEmpty()
      password: string;
    }
    ```
*   **Response (200 OK):**
    *   *Headers:* `Set-Cookie: refresh_token=<JWT>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000`
    *   *Body:*
        ```json
        {
          "success": true,
          "data": {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkNzQ4ZjMyOC...",
            "expires_in": 900,
            "user": {
              "id": "d748f328-761b-4f9e-a035-715a4b75a133",
              "email": "nongdan@gmail.com",
              "name": "Nguyễn Văn Ruộng",
              "role": "user"
            }
          }
        }
        ```

### 2.3 Quay vòng Token (Token Refresh)
*   **Endpoint:** `POST /api/v1/auth/refresh`
*   **Xác thực:** Đọc Cookie `refresh_token`
*   **Response (200 OK):**
    *   *Headers:* Cấp mới Cookie `refresh_token` (Xoay vòng token - Refresh Token Rotation).
    *   *Body:* Trả Access Token mới (Thời hạn 15 phút).

### 2.4 Đăng xuất (Logout)
*   **Endpoint:** `POST /api/v1/auth/logout`
*   **Xác thực:** Yêu cầu Access Token hợp lệ (Bearer)
*   **Response (200 OK):**
    *   *Headers:* `Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=0` (Xóa bỏ cookie).
    *   *Body:*
        ```json
        {
          "success": true,
          "message": "Đăng xuất thành công!"
        }
        ```

### 2.5 Liên kết Zalo OA OAuth
*   **Endpoint:** `GET /api/v1/auth/zalo`
*   **Xác thực:** Yêu cầu Access Token (Để liên kết tài khoản đang đăng nhập với Zalo)
*   **Mô tả:** Redirect người dùng đến trang xin quyền của Zalo Official Account với cấu hình `state` mã hóa:
    ```typescript
    // Cấu trúc state param — chống CSRF và verify user identity
    const statePayload = {
      userId: currentUser.id,          // Để liên kết đúng account
      nonce: crypto.randomUUID(),       // Ngẫu nhiên, lưu vào Redis TTL 10phút
      timestamp: Date.now(),            // Để detect stale state
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
    // Redis key: `oauth:nonce:{nonce}` → TTL 600s, value = userId
    ```
*   **Callback Endpoint:** `GET /api/v1/auth/zalo/callback`
    *   *Query params:* `code`, `state`
    *   *Mô tả:* Verify `state` param:
        ```typescript
        // Bước 1: Decode base64url và parse JSON
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
        // Bước 2: Verify nonce tồn tại trong Redis (chống CSRF)
        const storedUserId = await redis.get(`oauth:nonce:${decoded.nonce}`);
        if (!storedUserId) throw new UnauthorizedException('Invalid OAuth state');
        // Bước 3: Xóa nonce sau khi dùng (one-time use)
        await redis.del(`oauth:nonce:${decoded.nonce}`);
        // Bước 4: Trao đổi code lấy zalo_user_id và cập nhật User entity
        ```
    *   Cập nhật `zalo_user_id` và `zalo_access_token_encrypted` vào thực thể [User](file:///d:/coding/farmdiary/project/backend/src/modules/users/entities/user.entity.ts).

---

## 3. Cấu trúc Token Payload (Token Claims)

### 3.1 Access Token Payload (Mặc định hết hạn sau 15 phút)
```json
{
  "sub": "d748f328-761b-4f9e-a035-715a4b75a133",
  "email": "nongdan@gmail.com",
  "role": "user",
  "name": "Nguyễn Văn Ruộng",
  "iss": "farmdiaries-backend",
  "aud": "farmdiaries-pwa",
  "iat": 1715904000,
  "exp": 1715904900
}
```

### 3.2 Refresh Token Payload (Mặc định hết hạn sau 30 ngày)
```json
{
  "sub": "d748f328-761b-4f9e-a035-715a4b75a133",
  "jti": "8bc8cf6e-7832-47c0-a7d5-e2d9a69ab35c",
  "iss": "farmdiaries-backend",
  "iat": 1715904000,
  "exp": 1718496000
}
```

---

## 4. Đặc tả Guards & Decorators trong NestJS

Để sử dụng nhất quán trong toàn nhóm phát triển, ba bộ công cụ cốt lõi sau được xây dựng sẵn:

### 4.1 JwtAuthGuard & Public Decorator
Mặc định mọi controller cần được bảo vệ bằng JWT. Một số API public sẽ sử dụng Decorator `@Public()` để bypass.

```typescript
// src/common/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```typescript
// src/common/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

### 4.2 RolesGuard & Roles Decorator
Phục vụ phân quyền RBAC (User, Admin, Moderator) kiểm tra nghiêm ngặt vai trò người dùng sau khi giải mã JWT:

```typescript
// src/common/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

```typescript
// src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}
```

### 4.3 CurrentUser Decorator
Giúp lấy nhanh thông tin User đã được giải mã trực tiếp tại controller tham số:

```typescript
// src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

*Sử dụng tại Controller:*
```typescript
@Get('me')
getProfile(@CurrentUser() user: any) {
  return { success: true, data: user };
}
```

---

## 5. Danh sách Mã lỗi & Xử lý Ngoại lệ (Error Matrix)

Khi xác thực thất bại, hệ thống bắt buộc trả về cấu trúc lỗi chuẩn JSON dạng:
```json
{
  "success": false,
  "status_code": 401,
  "error_code": "AUTH_TOKEN_EXPIRED",
  "message": "Access Token đã hết hạn!",
  "timestamp": "2026-05-18T01:12:46Z"
}
```

### Bảng tra cứu mã lỗi bảo mật (Auth Error Code Table)
| HTTP Status | Error Code | Nguyên nhân | Hướng xử lý ở Client |
|---|---|---|---|
| **401 Unauthorized** | `AUTH_MISSING_TOKEN` | Không đính kèm Bearer token ở header | Kiểm tra Authorization header |
| **401 Unauthorized** | `AUTH_INVALID_TOKEN` | Token bị sai chữ ký hoặc sai cấu trúc | Yêu cầu user login lại |
| **401 Unauthorized** | `AUTH_TOKEN_EXPIRED` | Access Token hết hạn | Gửi request `/auth/refresh` lấy token mới (distinguish bằng `error_code`, không bằng HTTP status) |
| **401 Unauthorized** | `AUTH_REFRESH_FAILED` | Refresh Token sai/hết hạn/thu hồi | Điều hướng bắt buộc về màn hình Login |
| **403 Forbidden** | `AUTH_INSUFFICIENT_ROLE` | Vai trò người dùng không đủ quyền truy cập | Hiển thị thông báo Toast cấm truy cập |

> **Quy tắc Axios Interceptor:** Phân biệt token hết hạn bằng `error_code` trong response body, không bằng HTTP status code:
> ```typescript
> if (error.response?.data?.error_code === 'AUTH_TOKEN_EXPIRED') {
>   // trigger refresh token flow
> } else if (error.response?.status === 401) {
>   // force logout
> }
> ```

---

## 6. Kịch bản Kiểm thử Tự động (Testing Checklist)

Trước khi đẩy PR lên nhánh `main`, nhóm phát triển bắt buộc kiểm thử thành công các case sau tại suite `test/auth.e2e-spec.ts`:

- [ ] **TC-AUTH-01:** Đăng ký tài khoản mới với email hợp lệ và mật khẩu mạnh -> Kết quả: 201 Created.
- [ ] **TC-AUTH-02:** Đăng ký tài khoản với email đã tồn tại -> Kết quả: 409 Conflict.
- [ ] **TC-AUTH-03:** Đăng nhập với mật khẩu không chính xác -> Kết quả: 400 Bad Request / 401 Unauthorized.
- [ ] **TC-AUTH-04:** Đăng nhập thành công -> Kết quả: Nhận Access Token trong Body, Refresh Token trong cookie HTTP-Only.
- [ ] **TC-AUTH-05:** Gọi API được bảo vệ không có token -> Kết quả: 401 Unauthorized.
- [ ] **TC-AUTH-06:** Gọi API với Access Token hết hạn -> Kết quả: 401 Unauthorized với `error_code: AUTH_TOKEN_EXPIRED`.
- [ ] **TC-AUTH-07:** Làm mới token thành công bằng Refresh Token còn hạn -> Kết quả: Cấp mới cặp token.
- [ ] **TC-AUTH-08:** Thu hồi phiên (Logout) -> Kết quả: Refresh Token trong database bị xóa/revoke, cookie bị xóa sạch.
- [ ] **TC-AUTH-09:** Zalo OAuth — Verify nông dân gửi lại `state` cũ (replay attack) -> Kết quả: 401 Unauthorized do nonce đã bị xóa khỏi Redis sau lần dùng đầu.
