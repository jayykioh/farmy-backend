# Hướng dẫn Sử dụng & Tổng kết Cloudflare R2 Storage Service

File này tổng hợp toàn bộ các thay đổi, mã nguồn đã viết và hướng dẫn cách bạn sử dụng dịch vụ `R2StorageService` để tải lên, xóa và tạo đường dẫn có chữ ký (presigned URL) cho file.

---

## 1. Các File Đã Tạo / Chỉnh Sửa

| File | Trạng thái | Mô tả |
| :--- | :--- | :--- |
| [R2_STORAGE_GUIDE.md](./R2_STORAGE_GUIDE.md) | **[MỚI]** | File hướng dẫn cụ thể này |
| [src/modules/storage/r2-storage.service.ts](./src/modules/storage/r2-storage.service.ts) | **[MỚI]** | Chứa class `R2StorageService` với 3 hàm: `uploadFile`, `getSignedUrl`, `deleteFile` |
| [src/modules/storage/storage.module.ts](./src/modules/storage/storage.module.ts) | **[MỚI]** | NestJS module chứa và export `R2StorageService` |
| [src/modules/storage/r2-storage.service.spec.ts](./src/modules/storage/r2-storage.service.spec.ts) | **[MỚI]** | Unit test đầy đủ cho service, đã cấu hình tắt cảnh báo ESLint liên quan đến mock |
| [src/app.module.ts](./src/app.module.ts) | **[SỬA]** | Đăng ký `StorageModule` vào danh sách `imports` của AppModule |
| [.env](./.env) & [.env.example](./.env.example) | **[SỬA]** | Thêm các biến cấu hình Cloudflare R2 |

---

## 2. Cấu Hình Biến Môi Trường (Environment Variables)

Bạn cần mở file `.env` ở thư mục gốc và điền thông tin tài khoản Cloudflare R2 của bạn:

```env
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
```

---

## 3. Cách Sử Dụng `R2StorageService` ở Module Khác

Để sử dụng dịch vụ lưu trữ này ở bất kỳ module nào khác trong dự án (ví dụ `FarmModule` hay `UserModule`), bạn thực hiện theo 2 bước:

### Bước 3.1: Import `StorageModule` vào Module cần dùng
```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module'; // import module lưu trữ
import { FarmService } from './farm.service';
import { FarmController } from './farm.controller';

@Module({
  imports: [StorageModule], // Thêm vào đây
  controllers: [FarmController],
  providers: [FarmService],
})
export class FarmModule {}
```

### Bước 3.2: Inject `R2StorageService` vào Service của bạn và sử dụng
```typescript
import { Injectable } from '@nestjs/common';
import { R2StorageService } from '../storage/r2-storage.service';

@Injectable()
export class FarmService {
  constructor(private readonly storageService: R2StorageService) {}

  // Ví dụ hàm tải lên ảnh nhật ký làm ruộng
  async uploadDiaryPhoto(fileBuffer: Buffer, fileName: string): Promise<string> {
    const key = `diary/photos/${Date.now()}-${fileName}`;
    const contentType = 'image/jpeg';

    // 1. Upload lên Cloudflare R2
    const fileKey = await this.storageService.uploadFile(fileBuffer, key, contentType);

    // Bạn có thể lưu fileKey này vào MongoDB (ví dụ: diaryLog.photoKey = fileKey)
    return fileKey;
  }

  // Ví dụ hàm hiển thị ảnh bảo mật bằng cách sinh Signed URL
  async getDiaryPhotoUrl(fileKey: string): Promise<string> {
    // Sinh đường dẫn truy cập tạm thời có hiệu lực trong 1 giờ (3600 giây)
    const signedUrl = await this.storageService.getSignedUrl(fileKey, 3600);
    return signedUrl;
  }

  // Ví dụ hàm xóa ảnh
  async deleteDiaryPhoto(fileKey: string): Promise<void> {
    await this.storageService.deleteFile(fileKey);
  }
}
```

---

## 4. Kiểm Thử (Unit Tests)

Dịch vụ đã được viết unit test hoàn chỉnh bao phủ cả trường hợp thành công lẫn thất bại. 

### Lệnh chạy test:
Mở Terminal tại thư mục gốc dự án và chạy:
```bash
npm run test src/modules/storage/r2-storage.service.spec.ts
```

### Kết quả chạy kiểm thử thực tế:
```bash
PASS src/modules/storage/r2-storage.service.spec.ts
  R2StorageService
    ✓ should be defined (7 ms)
    uploadFile
      ✓ should successfully upload a file buffer and return the key (2 ms)
      ✓ should throw an error if s3Client.send fails (7 ms)
    getSignedUrl
      ✓ should generate a signed URL successfully (4 ms)
      ✓ should default to 3600 seconds expiration if not provided (2 ms)
      ✓ should throw an error if getSignedUrl function throws (2 ms)
    deleteFile
      ✓ should successfully delete a file (1 ms)
      ✓ should throw an error if delete command fails (2 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        0.646 s
```
