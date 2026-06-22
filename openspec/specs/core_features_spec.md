# FarmDiaries AI — Core Features Specification
### Diary Entries · Plant Scanning · Virtual Pet Gamification · Reminders & Insights

| Thuộc tính | Giá trị |
|---|---|
| **Dự án** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tài liệu** | Core Features Specification |
| **Đường dẫn** | `openspec/specs/core_features_spec.md` |
| **Trạng thái** | Active · specs folder |

---

## 1. Nhật ký số & Đồng bộ hóa Vườn (DiaryModule)

### 1.1 Nghiệp vụ Cốt lõi (Business Rules)
*   **Ghi nhận nhật ký:** Cho phép nông dân lưu trữ các hoạt động hàng ngày (tưới nước, bón phân, thu hoạch, phun thuốc, mô tả tình trạng).
*   **Tích hợp Thời tiết (Weather Sync):** Khi tạo nhật ký mới từ client có tọa độ GPS, backend tự động gọi API thời tiết (hoặc lưu nested `weather` object gửi từ client) để đồng bộ nhiệt độ, độ ẩm và lượng mưa thực tế phục vụ phân tích AI sau này.
*   **Tải ảnh an toàn:** Ảnh chụp ruộng vườn tải lên được đẩy thẳng lên **Cloudflare R2** dưới dạng ký pre-signed URL (Thao tác tại [File Upload Security](file:///d:/coding/farmdiary/openspec/specs/auth_spec.md#L46-L55)).

### 1.2 API Endpoints
*   `POST /api/v1/diary` (Tạo nhật ký mới)
    *   *Payload DTO (`CreateDiaryEntryDto`):*
        ```typescript
        export class CreateDiaryEntryDto {
          @IsString()
          @IsNotEmpty()
          cropType: string; // Tên loại cây trồng (ví dụ: Lúa, Bưởi)

          @IsString()
          @IsOptional()
          growthStage?: string; // Giai đoạn canh tác (ví dụ: Trổ bông, Cây con)

          @IsString()
          @IsOptional()
          notes?: string;

          @IsArray()
          @IsString({ each: true })
          @IsOptional()
          photoUrls?: string[];

          @IsBoolean()
          @IsOptional()
          watered?: boolean;

          @IsBoolean()
          @IsOptional()
          fertilized?: boolean;

          @IsObject()
          @IsOptional()
          weather?: any; // Thông tin thời tiết thực tế JSON
        }
        ```
    *   *Response (201 Created):* Trả thực thể nhật ký vừa tạo và kích hoạt sự kiện tăng streak chăm chỉ cho thú ảo [PetModule](file:///d:/coding/farmdiary/project/backend/src/modules/pet).
*   `GET /api/v1/diary` (Lấy danh sách nhật ký phân trang)
*   `GET /api/v1/diary/:id` (Xem chi tiết nhật ký)
*   `PUT /api/v1/diary/:id` (Cập nhật nhật ký)
*   `DELETE /api/v1/diary/:id` (Xóa mềm - Soft Delete)

---

## 2. Trợ lý Chẩn đoán Hình ảnh bệnh cây (PlantScanModule)

Tính năng cốt lõi giúp nông dân phát hiện dịch hại tức thời bằng camera di động.

```
  [User Upload Image]
          |
          v
  [1. Sharp.js Image Verification]
  - Size check (<= 5MB)
  - Magic bytes check (WebP/PNG/JPG)
  - Laplacian Variance check (> 100)
          |
          +--> FAIL: Trả thông báo yêu cầu chụp lại ảnh nét hơn
          v
  [2. pHash Cache Check] (Hamming Distance < 10)
          |
          +--> HIT: Trả ngay kết quả cache 7 ngày (Tiết kiệm gọi Gemini API)
          v
  [3. Cloudflare R2 Private Store] (Signed URLs)
          |
          v
  [4. Google Gemini Vision Call]
  - System Prompts & Guardrails
  - Diagnosis & PHI (Pre-Harvest Interval) Warnings
          |
          v
  [5. Save to MongoDB & Return to Client]
```

### 2.1 API Endpoints
*   `POST /api/v1/plant-scan/diagnose`
    *   *Payload:* Multipart/form-data (chứa file ảnh `image` và loại cây `cropType`).
    *   *Response (200 OK):*
        ```json
        {
          "success": true,
          "data": {
            "disease": "Bệnh Đạo Ôn (Pyricularia oryzae)",
            "confidence": 0.92,
            "symptoms": ["Vết bệnh hình thoi trên lá", "Tâm màu xám tro", "Viền màu nâu đỏ"],
            "treatment": {
              "chemical": "Phun thuốc gốc hoạt chất Tricyclazole hoặc Fuji-one 40EC",
              "organic": "Dọn sạch cỏ dại, hạn chế bón nhiều phân đạm trong giai đoạn trổ bông",
              "phiWarning": "⚠️ Chú ý cách ly tuyệt đối 14 ngày trước khi thu hoạch sau khi phun thuốc!"
            },
            "imageUrl": "https://r2.farmdiaries.vn/scans/userId/disease_hash.jpg?expires=..."
          }
        }
        ```

---

## 3. Thú ảo đồng hành & Trò chơi hóa (PetModule)

Tạo động lực ghi nhật ký đều đặn cho nông dân bằng cơ chế nuôi thú ảo vui nhộn (gamification).

```
   Ghi nhật ký hàng ngày (Diary Created)
                 |
                 v
   [Tăng Streak & Cập nhật trạng thái Thú]
   - streak_count = streak_count + 1
   - mood = 'happy' (Nếu viết nhật ký tích cực)
   - pet_bubbles = Gợi ý lời thoại chào mừng động viên
                 |
        Không ghi > 24h
                 v
   [Trạng thái Thú suy giảm]
   - mood = 'sad' hoặc 'neutral'
   - Thú ảo gửi tin nhắn nhắc nhở Zalo OA
```

### 3.1 Quy tắc Trạng thái Thú (Pet State Engine)
*   **Trạng thái Mood (Vui/Buồn):**
    *   `excited` (Phấn khích): Khi đạt streak liên tục 7, 14, 30 ngày canh tác.
    *   `happy` (Vui vẻ): Ghi nhật ký đều đặn mỗi ngày.
    *   `neutral` (Bình thường): Chưa ghi nhật ký trong 24 giờ.
    *   `sad` (Buồn bã): Quá 36 giờ chưa cập nhật tình hình nông trại.
    *   `worried` (Lo lắng): Nhận cảnh báo sâu bệnh nặng từ tính năng Quét bệnh (PlantScan).

### 3.2 Lời thoại thông minh (Pet Bubble Message Generator)
Khi người dùng truy cập trang chủ, backend phân tích nhật ký gần nhất để xuất lời khuyên đáng yêu:
*   *Ví dụ (Mood Happy):* *"Chào chủ vườn! Hôm qua bạn đã tưới nước cho Lúa rồi, hôm nay thời tiết dự kiến nắng nóng, hãy kiểm tra độ ẩm đất nhé! 🌾"*
*   *Ví dụ (Mood Worried):* *"Hôm qua AI phát hiện rầy nâu nhẹ trên Bưởi, hôm nay cây thế nào rồi, bạn đã phun xịt chưa? 🍊"*

### 3.3 Đồng bộ Thú Ảo vào Giao diện Trò chuyện (AI Chat Integration)
Để hoàn tất tính hai chiều và tạo sự gắn kết liên tục giống Duolingo, `PetModule` phối hợp chặt chẽ với `ChatModule` qua hai cơ chế chính:

#### a. Đồng bộ Trạng thái từ Pet sang Chat (Context Feeding)
Khi nông dân bắt đầu một tin nhắn mới, `ChatService` sẽ gọi `PetService.getPetState(userId)` để lấy thông tin `streak_count` và `mood` hiện tại từ collection `pet_states` trong MongoDB.
*   **Gemini System Prompt Injection:** Các giá trị này được đưa trực tiếp vào các biến `{streak_count}` và `{pet_mood}` của System Prompt (chi tiết tại [System Prompt Template](file:///d:/coding/farmdiary/openspec/specs/ai_chat_spec.md#L150-L177)) giúp AI phản hồi phù hợp với tâm lý người dùng.
*   **Mascot Default Mood:** Biểu cảm mặc định khi mở khung chat của Mascot động được đồng bộ trực tiếp từ trường `mood` trong database (ví dụ: nếu `pet_state.mood = 'sad'`, Mascot sẽ hiển thị biểu cảm buồn bã ngay lúc mới mở chat để nhắc nhở bà con).

#### b. Đồng bộ Hành vi từ Chat sang Pet (Behavior & State Evolution)
Các tương tác và luồng hội thoại trong `ChatModule` trực tiếp thay đổi trạng thái của Pet trong MongoDB thông qua các sự kiện hoặc gọi API nội bộ:
1.  **Sự kiện Giải quyết dịch bệnh (`chat.disease_resolved`):**
    *   *Trigger:* Khi nông dân trò chuyện với AI và xác nhận đã xử lý hoặc phun thuốc thành công cho vùng bệnh được chẩn đoán trước đó (hoặc click thẻ hành động nhanh `[📝 Đã xử lý dịch bệnh]`).
    *   *Ảnh hưởng:* `PetService.updateMood(userId, 'happy', 'Chủ vườn đã xử lý sâu bệnh cho cây!')` -> Cập nhật `mood` của pet từ `worried` về `happy` hoặc `neutral`.
2.  **Kích hoạt Streak qua Thẻ Hành động Nhanh (`chat.quick_action_executed`):**
    *   *Trigger:* Khi người dùng nhấn nút hành động nhanh Duolingo-style do AI Chatbot gợi ý (ví dụ: tạo nhật ký nhanh).
    *   *Ảnh hưởng:* Hệ thống gọi API tạo nhật ký của `DiaryModule`, từ đó tự động trigger tăng `streak_count` thêm 1 và chuyển `mood` sang `happy`/`excited`.
3.  **Huy chương & Vinh danh Cột mốc (`pet.milestone_celebrated`):**
    *   *Trigger:* Khi người dùng đạt chuỗi streak 7/14/30 ngày và chat chúc mừng được kích hoạt.
    *   *Ảnh hưởng:* Đánh dấu trạng thái đạt phần thưởng trong `pet_state.mood = 'excited'`, mở khóa biểu cảm ăn mừng độc quyền của Mascot trên UI.

---

## 4. Hàng đợi Nhắc nhở thông minh (ReminderModule)

Xử lý nhắc nhở lịch tưới nước, bón phân tự động thông qua hàng đợi phân tán BullMQ và Zalo OA ZNS.

```
       Master Cron (Định kỳ chạy mỗi giờ)
                     |
                     v
   [Quét MongoDB collection `reminders`]
   Tìm các nhắc nhở trạng thái 'pending' có scheduled_at <= Giờ hiện tại
                     |
                     v
   [Đưa vào Reminder Worker Queue (BullMQ)]
   - Lọc phân tầng kênh gửi ưu tiên (Web Push -> Zalo ZNS -> Email)
                     |
                     v
   [Gọi API gửi thông báo]
   - Thành công: Cập nhật status = 'delivered', lưu delivered_at
   - Thất bại: Tăng retry_count. Nếu retry > 3 -> status = 'failed' và trigger email fallback
```

---

## 5. Tổng kết Insight nông nghiệp tuần (InsightModule)

Master Cron tự động vận hành vào **Chủ nhật lúc 6:00 AM** để tổng hợp toàn bộ nhật ký canh tác của từng hộ nông dân, dùng RAG phân tích xu hướng dịch bệnh và gửi một bản báo cáo khuyến nghị chất lượng cao qua Zalo ZNS.

### Quy trình phân tán an toàn Quota LLM:
Để bảo vệ Quota miễn phí của Gemini (15 RPM), hệ thống bắt buộc sử dụng **Giải thuật phân rải đều thời gian (Delay Spreading Algorithm)** chi tiết hóa tại [architecture.md](file:///d:/coding/farmdiary/openspec/specs/architecture.md#L487-L493) để đảm bảo toàn bộ worker chạy rải đều công việc nền trong 4 tiếng đồng hồ, không dồn cục gây lỗi nghẽn hệ thống.

---

## 6. Kịch bản Kiểm thử Tính năng Cốt lõi (Core Testing Checklist)

Trước khi đẩy PR lên nhánh `main`, nhóm phát triển bắt buộc kiểm thử thành công các case sau tại suite `test/core-features.e2e-spec.ts`:

- [ ] **TC-CORE-01:** Tạo nhật ký số thành công -> Đảm bảo ghi nhận tọa độ GPS và thời tiết thời gian thực lưu dưới dạng nested object trong MongoDB document.
- [ ] **TC-CORE-02:** Tạo nhật ký thành công -> Check xem collection `pet_states` có cập nhật tăng `streak_count` và chuyển đổi `mood` tương ứng hay không.
- [ ] **TC-CORE-03:** Quét ảnh mờ (Laplacian Variance = 60) -> Trả lỗi ngoại lệ 422 và không gọi Gemini API.
- [ ] **TC-CORE-04:** Quét 2 ảnh trùng lặp trong vòng 7 ngày -> Hệ thống nhận diện pHash trùng khớp và trả ngay kết quả từ MongoDB cache, không phát sinh chi phí gọi API.
- [ ] **TC-CORE-05:** Lên lịch nhắc nhở lúc 8:00 PM tưới nước -> Chạy mô phỏng worker verify tin nhắn được gửi đúng giờ qua kênh Web Push hoặc Zalo ZNS.
- [ ] **TC-CORE-06:** Chạy Weekly Insight Cron giả lập với 100 users -> Đảm bảo hàng đợi BullMQ phân rải đều delay đúng công thức và không có request nào bị lỗi 429 quá tải.
- [ ] **TC-CORE-07:** Tương tác hai chiều Chat & Pet -> Đảm bảo khi gửi sự kiện `chat.disease_resolved` hoặc click hành động nhanh từ chat, trạng thái Pet trong MongoDB được cập nhật đúng.
