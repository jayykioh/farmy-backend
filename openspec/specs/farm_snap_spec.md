# FarmDiaries AI — Farm Snap Specification
### Instant Photo Sharing · AI Data Flywheel · Community Feed

| Thuộc tính | Giá trị |
|---|---|
| **Dự án** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tài liệu** | Farm Snap Feature Specification |
| **Đường dẫn** | `openspec/specs/farm_snap_spec.md` |
| **Phiên bản** | v1.0 |
| **Trạng thái** | Active · specs folder |
| **Liên quan** | blueprint.md §6 SnapModule · screen_flow.md §14 · design.md §6.10 |

---

## 1. Tổng quan & Mục tiêu (Overview & Goals)

**Farm Snap** là tính năng chụp ảnh tức thì theo phong cách Locket / Instagram Instant, phục vụ **hai mục tiêu song song**:

### 1.1 Mục tiêu Sản phẩm (UX / Engagement)
- **Habit loop nhanh**: Thay vì viết nhật ký dài, nông dân có thể *chụp → gán nhãn → đăng* trong < 15 giây.
- **Cảm giác kết nối cộng đồng**: Xem ảnh ruộng của nhau, nhận reaction, cảm giác không cô đơn trong nghề nông.
- **Gamification nhẹ**: +10 XP mỗi snap có nhãn, badge AI Contributor khi đạt mốc.

### 1.2 Mục tiêu Dữ liệu (AI Training Flywheel)
- Mỗi Farm Snap là một **labeled training sample** tự nhiên:
  - **Ảnh**: Hình ảnh cây trồng thực tế từ điều kiện nông nghiệp Việt Nam.
  - **Nhãn chính**: `cropType` (loại cây) + `condition` (tình trạng).
  - **Metadata tự động**: GPS, thời tiết, timestamp → context mùa vụ, vùng địa lý.
- Dataset tích lũy → nâng cao chính xác của `PlantScanModule` (Gemini Vision fine-tuning hoặc few-shot prompt enrichment trong tương lai).

> **Nguyên tắc**: User không biết mình đang annotate data — họ chỉ thấy mình đang share ảnh vườn để vui và nhận XP.

---

## 2. Data Schema

### 2.1 FarmSnap Entity (MongoDB — collection `farm_snaps`)

```javascript
// Schema validation rules cho farm_snaps
{
  "_id": "ObjectId",
  "userId": "UUID string", // Tham chiếu tới users
  
  // Media
  "imageUrl": "string",    // Cloudflare R2 public URL
  "imageKey": "string",    // R2 object key (for deletion)
  "caption": "string",     // Optional, max 100 chars
  
  // AI Training Labels (core value)
  "cropType": "string",    // "Lúa" | "Bưởi" | "Cà phê" | "Rau màu" | "Khác"
  "condition": "string",   // "healthy" | "issue" | "harvest" | "other"
  "conditionNote": "string", // Free text nếu condition = 'issue'
  
  // Auto-collected metadata
  "location": {
    "lat": "number",
    "lng": "number",
    "province": "string",
    "district": "string"
  },
  "weather": {
    "temp": "number",
    "humidity": "number",
    "condition": "string",
    "source": "string"
  },
  "capturedAt": "ISODate", // Thời điểm chụp (từ client)
  
  // Moderation & Quality
  "isPublic": "boolean",   // default true
  "isFlagged": "boolean",  // default false
  "qualityScore": "number", // 1-5 = AI/admin review
  
  // Engagement
  "xpEarned": "number",    // default 10
  
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}

// Indexes
db.farm_snaps.createIndex({ userId: 1, createdAt: -1 });
db.farm_snaps.createIndex({ createdAt: -1 }, { partialFilterExpression: { isPublic: true, isFlagged: false } });
db.farm_snaps.createIndex({ cropType: 1, condition: 1 });
```

### 2.2 SnapReaction Entity (MongoDB — collection `snap_reactions`)

```javascript
// Schema validation rules cho snap_reactions
{
  "_id": "ObjectId",
  "snapId": "ObjectId",    // Tham chiếu tới farm_snaps
  "userId": "UUID string", // Tham chiếu tới users
  "type": "string",        // "like" | "helpful" | "worry" | "celebrate"
  "createdAt": "ISODate"
}

// Đảm bảo mỗi user chỉ react 1 type trên 1 snap
db.snap_reactions.createIndex({ snapId: 1, userId: 1, type: 1 }, { unique: true });
```


### 2.3 Frontend Interface

```typescript
// src/types/farmSnap.ts
export type SnapCondition = 'healthy' | 'issue' | 'harvest' | 'other';
export type SnapReactionType = 'like' | 'helpful' | 'worry' | 'celebrate';

export interface FarmSnap {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;

  // Media
  imageUrl: string;
  caption?: string;

  // AI Training Labels
  cropType: string;
  condition: SnapCondition;
  conditionNote?: string;

  // Auto-collected metadata
  location?: { lat: number; lng: number; province: string; district?: string };
  weather?: { temp: number; humidity: number; condition: string };
  capturedAt: string;

  // Gamification
  xpEarned: number;

  // Engagement
  reactions: { type: SnapReactionType; count: number; userReacted: boolean }[];
  commentCount: number;

  createdAt: string;
}

export interface CreateSnapPayload {
  imageFile: File;
  cropType: string;
  condition: SnapCondition;
  conditionNote?: string;
  caption?: string;
  location?: { lat: number; lng: number };
  weather?: { temp: number; humidity: number; condition: string };
  capturedAt: string;
}
```

---

## 3. API Endpoints

### 3.1 Tạo Farm Snap (2-bước: upload URL → create)

**Bước 1: Lấy signed upload URL**
```
POST /api/v1/snaps/upload-url
Auth: Required
Body: { filename: string, contentType: string }
Response 200: {
  signedUrl: string,    // PUT URL lên Cloudflare R2 (TTL: 5 phút)
  publicUrl: string,    // URL public để lưu vào DB
  imageKey: string      // R2 object key
}
```

**Bước 2: Upload ảnh trực tiếp lên R2, rồi tạo snap**
```
POST /api/v1/snaps
Auth: Required
Body: CreateSnapDto {
  imageUrl: string (required)    // publicUrl từ bước 1
  imageKey: string (required)
  cropType: string (required)
  condition: snap_condition_enum (required)
  conditionNote?: string (max 200 chars)
  caption?: string (max 100 chars)
  location?: { lat: number, lng: number }
  weather?: { temp: number, humidity: number, condition: string }
  capturedAt: string (ISO 8601)
}
Response 201: {
  snap: FarmSnap,
  xpEarned: 10,
  totalXp: number,
  badgeUnlocked?: { id: string, name: string }   // nếu đạt mốc
}
```

### 3.2 Feed (Cộng đồng)
```
GET /api/v1/snaps/feed
Auth: Required
Query: {
  limit?: number (default 20, max 50)
  cursor?: string (created_at ISO — cursor pagination)
  cropType?: string (filter)
  condition?: snap_condition_enum (filter)
  mine?: boolean (chỉ snaps của mình)
}
Response 200: {
  data: FarmSnap[],
  nextCursor: string | null,
  hasMore: boolean
}
```

### 3.3 Chi tiết Snap
```
GET /api/v1/snaps/:id
Auth: Required
Response 200: FarmSnap (đầy đủ, kể cả comments)
```

### 3.4 React (Reaction)
```
POST /api/v1/snaps/:id/react
Auth: Required
Body: { type: snap_reaction_enum }
Response 200: { reactions: SnapReaction[] }
Note: Toggle — nếu đã react cùng type → remove. Nếu chưa → add.
```

### 3.5 Xóa Snap
```
DELETE /api/v1/snaps/:id
Auth: Required (chỉ owner hoặc admin)
Side effect: Xóa ảnh trên R2, xóa bản ghi DB
Response 204: No content
```

---

## 4. Upload Flow (Client-side)

FE KHÔNG gửi file binary qua backend. Dùng signed URL (giống DiaryModule):

```
[User chụp/chọn ảnh]
        |
        v
[1. FE validate locally]
    - Size <= 10MB
    - Type: image/jpeg | image/png | image/webp
    - Resize nếu > 1920px (Canvas API)
        |
        v
[2. POST /api/v1/snaps/upload-url]
    Body: { filename, contentType }
    Response: { signedUrl, publicUrl, imageKey }
        |
        v
[3. PUT <signedUrl>]
    Body: <raw file binary>
    Headers: Content-Type: image/jpeg
    Upload thẳng lên Cloudflare R2
        |
        v
[4. POST /api/v1/snaps]
    Body: { imageUrl: publicUrl, imageKey, cropType, condition, ... }
        |
        v
[5. Response 201 → show +XP popup → update feed]
```

**Client-side resize trước khi upload:**
```typescript
async function resizeImage(file: File, maxPx = 1920): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const canvas = new OffscreenCanvas(img.width * scale, img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
}
```

---

## 5. Screen Flow (UI/UX)

### 5.1 SCR-10: SnapCaptureModal

Entry points:
- FAB camera icon nổi trên các màn hình: Home, DiaryList, FarmFeed
- Nút [📸 Chụp ngay] trong FarmFeed header

```
[Tap FAB / Chụp ngay]
        |
        v
[Check camera permission]
        |
        +-- NOT GRANTED → Permission dialog
        |                 Denied → Toast: "Cần quyền camera"
        |                          + nút [Mở Cài đặt]
        | GRANTED
        v
+------------------------------------------------------------------+
| SCR-10: SnapCaptureModal (fullscreen, dark theme)                |
|                                                                  |
| [X Đóng]                          [Bé Thóc: happy nhỏ]          |
|                                                                  |
| +------------------------------------------------------------+   |
| |                                                            |   |
| |              Live camera feed (full bleed)                 |   |
| |                                                            |   |
| +------------------------------------------------------------+   |
|                                                                  |
| [Loại cây: Lúa ▾]        [🌿 Khỏe][⚠️ Vấn đề][🌾 Thu hoạch]   |
|                                                                  |
| [Thư viện]    [● CHỤP]    [Đổi cam]                            |
+------------------------------------------------------------------+
        | (Chụp / chọn từ thư viện)
        v
+------------------------------------------------------------------+
| Preview & Confirm                                                |
|                                                                  |
| [Ảnh vừa chụp - full width]                                      |
|                                                                  |
| [Label pill: 🌾 Lúa · ⚠️ Có vấn đề]                            |
|                                                                  |
| Caption (optional):                                              |
| ┌──────────────────────────────────────────────────────────┐    |
| │ Mô tả ngắn... (max 100 ký tự)                            │    |
| └──────────────────────────────────────────────────────────┘    |
|                                                                  |
| [Chụp lại]                    [🚀 Đăng lên Feed +10XP]         |
+------------------------------------------------------------------+
        | (Đăng)
        v
[Uploading state: spinner + "Đang đăng..."]
        |
        v
[Success: +10XP popup + animation → modal tự đóng sau 1.5s]
[FarmFeed refresh → snap mới ở đầu feed]
```

### 5.2 SCR-11: FarmFeed Page

```
+------------------------------------------------------------------+
| "Farm Feed 🌱"                              [📸 Chụp ngay]      |
+------------------------------------------------------------------+
| [Tất cả] [🌿 Khỏe] [⚠️ Vấn đề] [🌾 Thu hoạch] [Của tôi]     |
+------------------------------------------------------------------+
|                                                                  |
| [SnapCard]                                                       |
| [SnapCard]                                                       |
| ...                                                              |
| [Loading shimmer — khi scroll gần cuối]                         |
| [Đã xem hết feed] — khi hết data                                |
|                                                                  |
+------------------------------------------------------------------+
| Empty state:                                                     |
| Bé Thóc (happy) + "Chưa có snap nào!"                          |
| [📸 Chụp Farm Snap đầu tiên] (primary CTA)                      |
+------------------------------------------------------------------+
```

Desktop layout: 2-column masonry grid.
Mobile: 1 column, infinite scroll.

### 5.3 SnapCard Anatomy

```
+------------------------------------------------------------------+
| [Ảnh cây - tỉ lệ 4:5, object-fit cover]                         |
|                                                                  |
| ┌── Overlay top ──────────────────────────────────────────────┐  |
| │ 🌾 Lúa Hè Thu   ⚠️ Có vấn đề                               │  |
| └──────────────────────────────────────────────────────────────┘ |
|                                                                  |
| ┌── Overlay bottom (gradient) ────────────────────────────────┐  |
| │ "Phát hiện lá vàng ở gốc, cần kiểm tra"                    │  |
| │ Nguyễn Văn Ruộng · An Giang · 2 giờ trước                  │  |
| │ [😍 12]  [👍 8]  [😟 2]  [🎉 5]   |  [💬 Hỏi AI]          │  |
| └──────────────────────────────────────────────────────────────┘ |
+------------------------------------------------------------------+
```

Tap ảnh → Xem full-screen detail (SCR-11B).
Tap [💬 Hỏi AI] → navigate tới `/chat` với pre-filled context: "Tôi thấy ảnh [cropType] đang [condition], bạn có thể tư vấn không?"

---

## 6. Backend Module: SnapModule

| Trách nhiệm | Chi tiết |
|---|---|
| **CRUD snaps** | Create, Read, SoftDelete (owner + admin only) |
| **Upload URL** | Generate R2 signed PUT URL, TTL 5 phút |
| **Feed pagination** | Cursor-based, filter by cropType/condition/mine |
| **Reactions** | Toggle add/remove, count update |
| **XP trigger** | Sau khi tạo snap thành công → gọi PetService.addXp(10) |
| **Badge check** | Sau khi +XP → check snap count → nếu đạt mốc → set badgeUnlocked |
| **Moderation** | is_flagged = true nếu report > 3 → ẩn khỏi feed công khai |
| **Data export** | Admin API: GET /admin/snaps/training-export → CSV/JSONL labeled dataset |

### Phase trong blueprint

SnapModule nằm ở **Phase 2** (sau Diary, Chat, Pet Phase 1):
- Phase 1: Core (Diary, Chat, Pet, Reminder)
- **Phase 2: SnapModule + EmbeddingModule + RAGModule**
- Phase 3: PlantScanModule
- Phase 4+: Full SocialModule (follows, comments, DM)

---

## 7. AI Training Data Export

Admin có thể export toàn bộ snaps đã reviewed thành dataset:

```
GET /api/v1/admin/snaps/training-export
Auth: Admin only
Query: { quality_score_min: 3, format: 'jsonl' | 'csv' }
Response: File download

JSONL format (1 snap/line):
{
  "image_url": "https://r2.farmdiaries.vn/snaps/...",
  "crop_type": "Lúa",
  "condition": "issue",
  "condition_note": "Lá vàng ở gốc",
  "location_province": "An Giang",
  "weather_temp": 32,
  "weather_humidity": 74,
  "captured_month": 5,
  "captured_hour": 9,
  "quality_score": 4
}
```

Điều này tạo ra **structured dataset** có thể dùng để:
1. Fine-tune Gemini Vision với dữ liệu nông nghiệp Việt Nam
2. Enrich few-shot prompts trong PlantScanModule
3. Nghiên cứu phân bổ dịch bệnh theo vùng/mùa

---

## 8. Gamification Rules

| Hành động | XP | Điều kiện |
|---|---|---|
| Đăng snap có nhãn (cropType + condition) | +10 XP | Mỗi snap hợp lệ |
| Snap đầu tiên trong ngày | +5 XP bonus | Streak bonus |
| Nhận 10 reactions trên 1 snap | +5 XP | Achievement |

### Badge: AI Contributor

| Mốc | Badge | Mô tả |
|---|---|---|
| 10 snaps | 🤖 Cộng tác viên AI | Đã đóng góp 10 ảnh cho AI |
| 50 snaps | 🧑‍🔬 Nhà nghiên cứu AI | Đã đóng góp 50 ảnh |
| 100 snaps | 🏆 Chuyên gia AI | Đã đóng góp 100 ảnh |

---

## 9. Validation Rules

| Field | Rule |
|---|---|
| `image` | JPEG / PNG / WebP, max 10MB (client-side resize trước) |
| `cropType` | Required, max 50 chars |
| `condition` | Required, enum: healthy/issue/harvest/other |
| `conditionNote` | Optional, max 200 chars |
| `caption` | Optional, max 100 chars |
| `location.lat` | -90 to 90 |
| `location.lng` | -180 to 180 |
| `capturedAt` | Valid ISO 8601, không được ở tương lai > 5 phút |

**Rate limit**: 10 snaps/user/ngày (free), 30 snaps/user/ngày (premium).

---

## 10. Privacy & Consent

- Ảnh được đăng là **public** theo mặc định (`is_public = true`).
- User có thể xóa snap bất kỳ lúc nào → ảnh bị xóa khỏi R2 và DB ngay lập tức.
- Location chỉ lưu ở mức **tỉnh/huyện** (không lưu tọa độ chính xác trong dữ liệu public).
- Khi export training data: không có `user_id`, không có thông tin cá nhân — chỉ có label và metadata nông nghiệp.
- Điều khoản sử dụng (Terms) cần đề cập rõ: ảnh đăng tải có thể được dùng để cải thiện AI (opt-in checkbox trong Onboarding hoặc Settings).

---

## 11. Error States

| Tình huống | HTTP | UI Response |
|---|---|---|
| Upload ảnh quá 10MB | 400 | Toast: "Ảnh quá lớn, tối đa 10MB" |
| Sai định dạng file | 400 | Toast: "Chỉ chấp nhận JPG/PNG/WebP" |
| Vượt rate limit (10 snaps/ngày) | 429 | Bottom sheet: "Đã đăng đủ 10 snap hôm nay! Quay lại ngày mai nhé 🌱" |
| Không có quyền camera | — | Toast: "Cần quyền camera" + [Mở Cài đặt] |
| Network error khi upload | — | Slot đỏ + Toast: "Đăng thất bại, thử lại" + form giữ nguyên |
| Snap không tìm thấy | 404 | Toast: "Snap này đã bị xóa" + redirect feed |

---

## 12. Testing Checklist

- [ ] **TC-SNAP-01**: Đăng snap hợp lệ → Verify bản ghi trong `farm_snaps`, XP +10 trong `pet_state`, và ảnh tồn tại trên R2.
- [ ] **TC-SNAP-02**: Đăng ảnh > 10MB → Verify client reject trước khi gọi API (không có request lên server).
- [ ] **TC-SNAP-03**: Feed cursor pagination → GET /snaps/feed với cursor → Verify không trùng lặp snap giữa các page.
- [ ] **TC-SNAP-04**: Filter `condition=issue` → Verify chỉ trả về snaps có condition = 'issue'.
- [ ] **TC-SNAP-05**: Toggle reaction → POST react 2 lần cùng type → Verify chỉ có 1 reaction (idempotent).
- [ ] **TC-SNAP-06**: Xóa snap → Verify ảnh bị xóa khỏi R2 và bản ghi không còn trong feed.
- [ ] **TC-SNAP-07**: Đăng 10 snaps → Verify badge "Cộng tác viên AI" được unlock và XP cộng đúng.
- [ ] **TC-SNAP-08**: Vượt rate limit 10 snaps/ngày → Verify response 429 và UI hiển thị bottom sheet đúng.
- [ ] **TC-SNAP-09**: Admin export training data → Verify JSONL không chứa user_id hoặc tọa độ chính xác.

---

*FarmDiaries AI — Farm Snap Specification v1.0*
*Dual purpose: Habit-forming instant photo sharing + AI training data flywheel*
