## MODIFIED Requirements

### Requirement: Ghi nhận nhật ký an toàn đa luồng (Effectively-once)
API `POST /api/v1/diaries/:diaryId/logs` sử dụng Atomic Reservation theo `userId`, kết hợp Lease Takeover và Mongo Transactions.

#### Scenario: Sinh Canonical Hash Chuẩn
- **WHEN** Backend nhận multipart request
- **THEN** Backend build object với đúng 6 fields: `{ diaryId, activityType, content, diaryDate, cropType, imageDigests }`.
- **AND** Omit undefined/null, dùng ISO-8601 UTC cho `diaryDate`, NFC normalization cho string, sắp xếp A-Z key sort, UTF-8 encode, SHA-256 lowercase hex.

#### Scenario: Đặt chỗ thực thi (Atomic Lease) & Takeover
- **WHEN** Yêu cầu hợp lệ
- **THEN** Hệ thống cố gắng claim record trong bảng `idempotency_executions` (Unique: `userId` + `idempotencyKey`).
- **AND** Nếu không tồn tại: tạo mới (`processing`, sinh `ownerToken`, set `leaseUntil`).
- **AND** Nếu tồn tại `processing` + `leaseUntil` còn hạn -> trả về `409 IDEMPOTENCY_IN_PROGRESS`.
- **AND** Nếu tồn tại (`processing` hết hạn HOẶC `failed`) + Cùng hash -> Atomic takeover: update `ownerToken` mới, reset `leaseUntil`, tăng `attemptCount`, tiếp tục xử lý.
- **AND** Nếu tồn tại + Khác hash -> trả về `409 IDEMPOTENCY_KEY_REUSED`.
- **AND** CHỈ KHI claim lock thành công, server mới upload ảnh lên R2 và ghi mảng đường dẫn vào `uploadedKeys`.

#### Scenario: Commit Transaction & Safe Cleanup
- **WHEN** Mongo transaction thực thi
- **THEN** Lưu DiaryLog, cập nhật Streak, cập nhật trạng thái `idempotency_executions` thành `completed` **TRONG CÙNG MỘT TRANSACTION**.
- **WHEN** Mongo transaction thất bại
- **THEN** Hệ thống rollback DB, cập nhật execution thành `failed`.
- **AND** Xóa các ảnh trong `uploadedKeys` TRÊN R2, nhưng CHỈ KHI `ownerToken` hiện tại của execution record khớp với `ownerToken` của tiến trình này.
