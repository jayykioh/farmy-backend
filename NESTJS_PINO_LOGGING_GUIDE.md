# Hướng dẫn tích hợp & Test Logger (nestjs-pino)

Tài liệu này ghi lại quá trình tích hợp `nestjs-pino` vào dự án để hỗ trợ ghi log có cấu trúc (Structured Logging) và tự động ghi log các HTTP request/response.

## 1. Mục tiêu
- Thay thế logger mặc định của NestJS bằng `nestjs-pino`.
- Tự động ghi lại log của tất cả request và response (auto-logging).
- Xuất log dưới dạng JSON chuẩn khi chạy ở production.
- Xuất log dưới dạng "pretty" (có màu sắc, dễ đọc) khi chạy ở môi trường development.

---

## 2. Các thay đổi đã thực hiện

### Cài đặt thư viện
```bash
npm install nestjs-pino pino-http pino --legacy-peer-deps
npm install -D pino-pretty --legacy-peer-deps
```
*(Ghi chú: Dùng `--legacy-peer-deps` để tránh lỗi xung đột phiên bản peer dependency của `@nestjs/bullmq`)*

### Cập nhật `src/app.module.ts`
Thêm cấu hình `LoggerModule` vào danh sách `imports`:
```typescript
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true, // Tự động ghi log request/response
        transport: process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty', // Format dễ đọc cho dev
                options: { singleLine: true },
              }
            : undefined, // Bỏ qua pretty format ở production để lấy chuỗi JSON thuần
      },
    }),
    // ... các module khác
  ]
})
```

### Cập nhật `src/main.ts`
Chỉ định `PinoLogger` làm Global Logger cho toàn bộ ứng dụng:
```typescript
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  // Bật bufferLogs để lưu tạm log trước khi module Logger khởi tạo xong
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  
  // Áp dụng logger mới
  app.useLogger(app.get(Logger));
  
  // ...
}
```

---

## 3. Cách Test (Nghiệm thu task)

### Test ở môi trường Development
1. **Khởi động server:**
   ```bash
   npm run start:dev
   ```
   *Kết quả:* Log khởi động của server sẽ hiển thị màu sắc và định dạng gọn gàng nhờ `pino-pretty` chứ không phải là chuỗi JSON khô khan.

2. **Gửi request test:**
   Mở một tab Terminal khác và gọi API:
   ```bash
   curl http://localhost:3000/health
   ```

3. **Kiểm tra Log tự động:**
   Quay lại tab đang chạy server, bạn sẽ thấy tự động xuất hiện một dòng log cho request này bao gồm Method, URL, Status Code, và Response Time. 
   *(Mặc dù API health trả về 503 do lỗi kết nối DB/Redis, log vẫn ghi nhận chính xác mã lỗi này).*

### Test ở môi trường Production
1. **Build và chạy server:**
   ```bash
   npm run build
   NODE_ENV=production node dist/main
   ```
   
2. **Gửi request test:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Kiểm tra Log JSON:**
   Ở màn hình server, bạn sẽ không còn thấy log có màu nữa, thay vào đó là một chuỗi JSON chuẩn. Định dạng này giúp các hệ thống quản lý log (Kibana, CloudWatch, Datadog...) dễ dàng parse dữ liệu.
   
   *Ví dụ output:*
   ```json
   {"level":30,"time":1781061081810,"pid":94142,"hostname":"localhost","req":{"id":1,"method":"GET","url":"/health","query":{},"params":{},"headers":{},"remoteAddress":"::1","remotePort":54321},"res":{"statusCode":503},"responseTime":5,"msg":"request completed"}
   ```
