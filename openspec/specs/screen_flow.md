# FarmDiaries AI - Screen Flow and Interaction Architecture
### Soft Farming Wellness - ASCII State Diagrams - API Integration Points

| Thuoc tinh | Gia tri |
|---|---|
| **Du an** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tai lieu** | Screen Flow and Interaction Architecture |
| **Duong dan** | openspec/specs/screen_flow.md |
| **Phien ban** | v3.0 - Canonical nav model + full interaction coverage |
| **Trang thai** | Active - specs folder - Source of Truth cho screen flows |
| **Muc tieu** | Dac ta day du luong man hinh, state machines, va cach UI ket noi voi API. |
| **Lien quan** | design.md v5.3 - core_features_spec.md - ai_chat_spec.md - auth_spec.md |

---

## 0. Navigation Model Canonical (v3.0)

> **Quyet dinh chinh thuc:** App co **4 tabs** tren BottomNavBar. Khong co tab Scan rieng.

| Tab | Icon | Role |
|---|---|---|
| **Home** | home | Daily habit dashboard, mascot, streak, next action |
| **Diary** | book | Instagram-style farm journal - list, create, detail |
| **AI Pet** | smart_toy | Conversational AI + camera scan tich hop trong input bar |
| **Profile** | person | Level, XP, streak calendar, badges, shop, settings |

**PlantScan** khong phai tab rieng. User tap icon camera trong AI Pet input bar -> camera viewfinder mo nhu modal fullscreen de len chat -> ket qua scan inject vao chat thread duoi dang mot card dac biet. Mental model: "Dang hoi AI, thay gi la thi chup luon cho AI xem."

**Shop** nam trong Profile tab -> tappable section card -> bottom sheet slide len. Mental model: "Shop la phan thuong, khong phai tinh nang hang ngay."

---

## 1. Global App Flow

```
                          [ APP LAUNCH ]
                                 |
                                 v
  +------------------------------------------------------------------+
  |                    SCR-01: Welcome and Auth                      |
  |  [UI]: Bau troi, Mascot Be Thoc float idle, Bottom Sheet trang   |
  |  [Action]: POST /api/v1/auth/google  OR  POST /api/v1/auth/login  |
  +------------------------------------------------------------------+
                                 |
                                 | (Auth Success, JWT stored)
                                 v
                 [Check: onboarding_completed?]
                                 |
                 +---------------+----------------+
                 | false                          | true
                 v                                v
        [SCR-01B/C/D]                    [SCR-02: Home]
        Onboarding Setup                (Main App Shell)
        Wizard (3 steps)                      |
                 |                             |
                 +------------------+----------+
                                    v
  +------------------------------------------------------------------+
  |                   SCR-02: Home / Mascot Garden                   |
  |  Bottom Nav: [Home] [Diary] [AI Pet] [Profile]                   |
  +------------------------------------------------------------------+
         |                  |                  |
    [Diary Tab]       [AI Pet Tab]       [Profile Tab]
         |                  |                  |
         v                  v                  v
      SCR-03             SCR-05B            SCR-07
      Diary List         Chat List          Profile and Progress
```

---

## 2. Mascot Mood State Machine

Trang thai cam xuc Mascot dong bo truc tiep tu `pet_state` trong DB va System Prompt AI Chat.

```
 +------------------+    [ Nong dan bao cao: Da phun thuoc ]    +------------------+
 | State: WORRIED   |-------------------------------------------->| State: HAPPY     |
 | Lottie: Heo ru   |  (Trigger: chat.disease_resolved)          | Lottie: Vay tay  |
 +------------------+                                            +------------------+
          ^                                                                |
          |                                                                v
 [ Scan trong Chat ]                                        [ Dat Streak 7/14/30 ngay ]
 [ tra ket qua benh ]                                       (Trigger: pet.milestone)
          |                                                                |
          |                                                                v
          |                                                    +------------------+
 +------------------+     [ Quen ghi nhat ky > 36h ]           | State: EXCITED   |
 | State: NEUTRAL   |<-------------------------------------------| Lottie: Nhay mua |
 | Lottie: Tho deu  |     (Trigger: CronJob check)             +------------------+
 +------------------+
```

Ghi chu UI: Khi doi State, file Lottie JSON chuyen muot ma (interpolate) khong bi giat hinh.

---

## 3. Onboarding Setup Flow (SCR-01B / C / D)

Chi trigger **mot lan** sau lan dang nhap thanh cong dau tien (onboarding_completed = false).

```
  [Auth Success - JWT stored]
         |
         v
  [Check: onboarding_completed = false]
         |
         v
  +----------------------------------------------------------+
  | SCR-01B: Farm Setup (Bottom Sheet - Step 1/3)            |
  | - Field: Ten nong trai (text input, required)            |
  | - Chips: Loai cay chinh (Lua / Buoi / Ca phe / Rau mau) |
  | - Be Thoc: State = happy, gesture toward input           |
  | - Progress dots: 1 of 3   CTA: [Tiep theo]              |
  +----------------------------------------------------------+
         |
         v
  +----------------------------------------------------------+
  | SCR-01C: Zalo Connect (Bottom Sheet - Step 2/3)          |
  | - Copy: Nhan nhac nho qua Zalo khi can                   |
  | - CTA Primary: [Ket noi Zalo] -> GET /api/v1/auth/zalo   |
  | - CTA Skip: [Bo qua, lam sau]                            |
  |   -> sets zalo_notification_enabled = false locally      |
  +----------------------------------------------------------+
         |
         v
  +----------------------------------------------------------+
  | SCR-01D: Push Notification (Bottom Sheet - Step 3/3)     |
  | - Pre-permission screen voi Be Thoc giai thich value     |
  | - CTA: [Cho phep thong bao] -> navigator.requestPermission|
  | - CTA: [De sau]                                          |
  +----------------------------------------------------------+
         |
         v (Either path)
  PATCH /api/v1/users/me
  { onboarding_completed: true, farmName, primaryCrops }
         |
         v
  [Navigate to SCR-02 Home]
```

---

## 4. SCR-02: Home / Mascot Garden

API calls khi load: GET /api/v1/pet/state -> { mood, streak_count, level, xp }

```
  +------------------------------------------------------------------+
  | TopBar: "Chao, [Ten]!"                    [Bell Notification]    |
  +------------------------------------------------------------------+
  | Hero area (full bleed):                                          |
  |   bg-sky-day / bg-sky-night (auto-switch 19:00)                 |
  |   Hero Clock: goc trai, Nunito weight 100, 80px                 |
  |   XP Bar glass card: goc phai tren                              |
  |   Be Thoc Lottie: dung tren wavy grass SVG                      |
  |   Pet bubble: loi thoai thong minh tu /pet/state                |
  +------------------------------------------------------------------+
  | Quick Actions row:                                               |
  |   [Ghi nhat ky]   [Hoi Be Thoc]   [Nhac nho]                   |
  +------------------------------------------------------------------+
  | Streak card: 7 ngay lien tiep - Next: 14 ngay                   |
  +------------------------------------------------------------------+
  | Bottom Nav: [Home] [Diary] [AI Pet] [Profile]                   |
  +------------------------------------------------------------------+
```

Celebration trigger tu Home: Khi GET /pet/state tra { mood: "excited", milestone_celebrated: true } -> tu dong hien SCR-08 Celebration overlay.

---

## 5. SCR-03: Diary Tab

### 5.1 Diary List (Instagram-style infinite scroll)

Style: Timeline cuon vo han. Khong co page numbers, khong co nut "Trang 2".

API: GET /api/v1/diary?limit=20&cursor=<created_at_iso> — cursor pagination theo created_at.

**Card Anatomy:**

```
  +------------------------------------------------------------------+
  | [Photo    ] Ten cay: Lua He Thu              2 gio truoc        |
  | [80x80px  ] [Pill: Tro bong]                                    |
  | [thumbnail] "Hom nay phat hien la vang o phan goc, da           |
  | [or crop  ] tuoi them nuoc buoi sang..." (2 dong max)           |
  | [icon]    ------------------------------------------------       |
  |            [Da tuoi]  [32 do C - Nang]  [An Giang]              |
  +------------------------------------------------------------------+
```

Quy tac thumbnail:
- photo_urls[0] ton tai -> anh 80x80px, object-fit cover, bo goc 12px
- photo_urls rong -> icon cay tuong ung cropType

Row icons duoi card:
- watered = true -> [Da tuoi], false -> an
- fertilized = true -> [Da bon phan], false -> an
- weather.temp + weather.condition -> pill thoi tiet
- gps_location.province -> pill dia diem neu co

Relative timestamp: created_at -> "Vua xong" / "2 gio truoc" / "Hom qua" / date absolute neu > 7 ngay.

**Screen Layout:**

```
  +------------------------------------------------------------------+
  | TopBar: "Nhat ky nong trai"          [Tim kiem] [Loc]            |
  +------------------------------------------------------------------+
  | Filter chips (horizontal scroll):                                |
  | [Tat ca] [Lua] [Buoi] [Ca phe] [Co anh] [Tuan nay]             |
  +------------------------------------------------------------------+
  | [Diary Card]                                                     |
  | [Diary Card]                                                     |
  | [Diary Card]                                                     |
  | ...                                                              |
  | [Loading shimmer khi scroll den cuoi]                            |
  | [Het feed text khi het data: "Da xem het nhat ky"]              |
  +------------------------------------------------------------------+
  | Empty state:                                                     |
  | Be Thoc (happy) + "Chua co nhat ky nao. Bat dau ghi nhe!"      |
  | [Ghi nhat ky dau tien] (primary CTA)                            |
  +------------------------------------------------------------------+
  | [+ FAB] - luon visible, goc duoi phai                           |
  | Tap -> SCR-03B: Create Entry bottom sheet                       |
  +------------------------------------------------------------------+
```

Infinite scroll logic:
1. Load dau: GET /diary?limit=20
2. User scroll gan cuoi (last 3 cards visible) -> GET /diary?limit=20&cursor=<last_created_at>
3. Append cards vao list
4. data.length < 20 -> set hasMore = false, hien "Da xem het nhat ky"

Tap vao card -> SCR-03D: Diary Detail (slide up full-screen bottom sheet)

### 5.2 SCR-03B: Create Entry

**Entry points:**
- FAB + tu SCR-03 Diary List
- Quick Action [Ghi nhat ky] tu SCR-02 Home
- Nut [Ghi Nhat Ky Dieu Tri] tu ket qua scan trong SCR-05 Chat
- Loi goi y cua Be Thoc tren Home

```
  +------------------------------------------------------------------+
  | Header: "Nhat ky moi"                           [X Dong]        |
  +------------------------------------------------------------------+
  | [1] Loai cay * (REQUIRED)                                       |
  |     [Tim va chon loai cay dropdown/search autocomplete]         |
  |     cropType -> foreign key cho memory_embeddings later         |
  |                                                                  |
  | [2] Giai doan canh tac (optional)                               |
  |     [text input]                                                 |
  |     growthStage                                                  |
  |                                                                  |
  | [3] Ghi chu hom nay                                             |
  |     +----------------------------------------------------+       |
  |     | Hom nay vuon the nao?                              |       |
  |     +----------------------------------------------------+       |
  |     notes (multiline, optional)                                  |
  |                                                                  |
  | [4] Hom nay da lam:                                             |
  |     [Tuoi nuoc toggle]   [Bon phan toggle]                      |
  |     watered (bool) / fertilized (bool)                          |
  |                                                                  |
  | [5] Anh ruong vuon (toi da 4):                                  |
  |     [+ Camera] [img1] [img2] [img3]                             |
  |     <- Photo upload flow (xem muc 5.3)                         |
  |                                                                  |
  | [6] Thoi tiet (auto tu GPS):                                    |
  |     32 do C - Nang - Do am 74%  [Tu dong / Nhap tay]           |
  |     weather JSONB                                                |
  +------------------------------------------------------------------+
  | [Luu nhat ky] (primary tactile)              [Huy] (text)       |
  +------------------------------------------------------------------+
         |
         v
  POST /api/v1/diary
  { cropType, growthStage, notes, watered, fertilized, photoUrls[], weather }
         |
    +----+---------------------------+
    | 201 Created                   | Error
    v                               v
  XP Popup: "+30XP"          Toast: "Luu khong duoc,
  Be Thoc: excited (2s)       kiem tra ket noi"
  Sheet dismisses             Form giu nguyen
  Streak updated in DB
  Pet mood -> happy/excited
```

Pre-fill mode (tu scan result trong Chat):
- cropType <- crop da chon khi scan
- notes <- "Phat hien: [disease]. Confidence: [pct]%. Trieu chung: [symptoms]."
- photoUrls[0] <- URL anh scan tu R2
- Sheet mo o trang thai tu dong dien, user co the sua truoc khi luu

### 5.3 Photo Upload Flow (3 buoc - quan trong cho API integration)

FE KHONG gui file truc tiep len backend. Dung quy trinh signed URL:

```
  [User tap slot anh]
         |
         v
  [Native file picker / camera]
         |
         v (user chon anh)
  BUOC 1: FE validate locally
      - Size <= 10MB (client-side guard)
      - Type: image/jpeg OR image/png OR image/webp
         |
         v
  BUOC 2: POST /api/v1/diary/upload-url
      Body: { filename: "photo.jpg", contentType: "image/jpeg" }
      Response: { signedUrl: "https://r2.../...", publicUrl: "..." }
         |
         v
  BUOC 3: PUT <signedUrl>
      Body: <raw file binary>
      Headers: Content-Type: image/jpeg
      Upload thang len Cloudflare R2, KHONG qua backend
         |
         v
  BUOC 4: Append publicUrl vao photoUrls[] trong form state
      Hien thi thumbnail preview
         |
         v
  [Khi submit diary, gui photoUrls[] da co URLs]
  POST /api/v1/diary { ..., photoUrls: ["https://r2.../..."] }
```

UI states trong qua trinh upload:
- Uploading: slot anh hien progress spinner overlay
- Success: thumbnail hien anh that, co nut X xoa
- Error: slot do + Toast "Tai anh that bai, thu lai"

### 5.4 SCR-03C: Edit Entry

Giong SCR-03B nhung:
- Header: "Sua nhat ky"
- Form pre-filled tu GET /api/v1/diary/:id
- Submit: PUT /api/v1/diary/:id

### 5.5 SCR-03D: Diary Detail

Full-screen bottom sheet slide len khi tap vao card tu list.

```
  +------------------------------------------------------------------+
  | [< Quay lai]                            [Edit icon] [Delete]     |
  +------------------------------------------------------------------+
  | [Image gallery - horizontal scroll, 1 anh full-width]           |
  +------------------------------------------------------------------+
  | Lua He Thu - Tro bong                   27/05, 09:30            |
  | 32 do C - Nang - Do am 74%             An Giang                |
  | [Da tuoi]  [Da bon phan]                                        |
  +------------------------------------------------------------------+
  | "Hom nay phat hien la vang o phan goc, da tuoi them nuoc        |
  | buoi sang. Tinh hinh chung on, can theo doi them..."            |
  +------------------------------------------------------------------+
  | [Hoi Be Thoc ve entry nay] <- Quick action                      |
  +------------------------------------------------------------------+
```

---

## 6. SCR-05: AI Pet Tab (Chat + Integrated Scan)

### 6.1 Entry Flow

```
  [Tab AI Pet tap]
         |
         v
  [Check: co active session?]
         |
         +-- YES -> [Mo session cuoi: SCR-05A Active Chat]
         |
         +-- NO  -> [SCR-05B: Chat Session List]
                            |
                            +-- [Tap session card]
                            |       |
                            |       v
                            |   GET /api/v1/chat/sessions/:id/messages
                            |   -> [SCR-05A: Active Chat]
                            |
                            +-- [+ Chat moi]
                                    |
                                    v
                                POST /api/v1/chat/sessions
                                -> [SCR-05A: Active Chat - empty]
```

### 6.2 SCR-05B: Chat Session List

```
  +------------------------------------------------------------------+
  | "Tri Ky AI"                                  [+ Chat moi]       |
  +------------------------------------------------------------------+
  | STATE: HAS SESSIONS                                              |
  | +--------------------------------------------------------------+ |
  | | Hom qua - Lua                                                | |
  | | "Be Thoc oi, lua nha minh bi vang la..."                     | |
  | +--------------------------------------------------------------+ |
  | +--------------------------------------------------------------+ |
  | | 3 ngay truoc - Buoi                                          | |
  | | "Toi muon hoi ve cach bon phan cho buoi..."                  | |
  | +--------------------------------------------------------------+ |
  | [Xem them] - cursor pagination: GET /sessions?cursor=...        |
  +------------------------------------------------------------------+
  | STATE: EMPTY                                                     |
  | Be Thoc (happy) + "Hoi Be Thoc bat cu dieu gi ve vuon!"        |
  | [Bat dau tro chuyen] (primary CTA)                              |
  +------------------------------------------------------------------+
```

### 6.3 SCR-05A: Active Chat

```
  +------------------------------------------------------------------+
  | [< Back]   "Tri Ky AI"         [Mascot avatar: analytical]      |
  +------------------------------------------------------------------+
  |                                                                  |
  |   +----------------------------------------------+              |
  |   | User bubble (green, right-aligned)           |              |
  |   | Lua nha minh bi vang la, co sao khong?       |              |
  |   +----------------------------------------------+              |
  |                                                                  |
  | [Be Thoc avatar]                                                 |
  | +------------------------------------------------------------+   |
  | | AI bubble (white/surface, left-aligned)                   |   |
  | | Chao ban! La vang tren lua co the do nhieu nguyen nhan... |   |
  | | [SSE streaming text]                                      |   |
  | +------------------------------------------------------------+   |
  |                                                                  |
  | Quick Action chips (sau khi AI reply):                          |
  | [Ghi nhat ky]  [Dat nhac nho]  [Luu loi khuyen]               |
  |                                                                  |
  +------------------------------------------------------------------+
  | Input bar:                                                       |
  | [Camera icon]  [Nhan tin Be Thoc...]              [Send]        |
  +------------------------------------------------------------------+
```

Chat input bar elements:
- **[Camera icon]** - tap -> mo SCR-05C Camera Viewfinder (modal fullscreen de len chat, KHONG roi tab)
- Text input - goi POST /api/v1/chat/sessions/:id/messages
- [Send] - submit, AI reply qua SSE stream

Mascot state trong chat:
- Idle -> happy
- Waiting for AI response -> analytical (spinner tren avatar)
- Scan result co benh nang (confidence >= 70%) -> worried
- Scan ket qua tot / khong benh -> happy

### 6.4 SCR-05C: Camera Viewfinder (Modal de len Chat)

Camera viewfinder KHONG roi tab AI Pet. Mo nhu modal fullscreen de len chat.

```
  [Tap Camera icon trong chat input bar]
         |
         v
  [Check: Camera Permission?]
         |
         +-- NOT GRANTED -> [Permission Request Dialog]
         |                        |
         |                        +-- Granted -> [Tiep tuc]
         |                        +-- Denied  -> Toast: "Can quyen camera de chup benh cay"
         |                                       + [Mo Cai dat] button
         | GRANTED
         v
  +------------------------------------------------------------------+
  | SCR-05C: Camera Viewfinder (fullscreen modal)                    |
  |                                                                  |
  | [X Dong]                               [Be Thoc: analytical]    |
  |                                                                  |
  | +------------------------------------------------------------+   |
  | |                                                            |   |
  | |    +==============================================+        |   |
  | |    | Huong vao la benh, giu cho net               |        |   |
  | |    +==============================================+        |   |
  | |                 rounded crop guide                         |   |
  | |                                                            |   |
  | +------------------------------------------------------------+   |
  |                                                                  |
  | Dropdown pill: [Loai cay: Lua (dropdown)]                       |
  |                                                                  |
  | Bottom bar: [Huy]        [CHUP]         [Thu vien]              |
  +------------------------------------------------------------------+
         | (Nhan chup / chon tu thu vien)
         v
  [Preview and Confirm]
   - Hien thi anh vua chup
   - [Chup lai] | [Dung anh nay]
         |
         | (Dung anh nay)
         v
  +------------------------------------------------------------------+
  | Processing Overlay                                               |
  | - Blur backdrop voi anh preview                                  |
  | - Be Thoc: analytical + loading animation                        |
  | - "Be Thoc dang phan tich..."                                    |
  |                                                                  |
  | BE Flow:                                                         |
  |   1. Sharp.js: size <= 5MB, magic bytes, Laplacian >= 100       |
  |   2. pHash cache check (Hamming < 10) -> return cache           |
  |   3. POST /api/v1/plant-scan/diagnose (multipart)               |
  +------------------------------------------------------------------+
         |
    +----+--------------------------------+
    | 200 OK                             | Error
    v                                    v
  [Modal dong]                  [Error Bottom Sheet]
  [Inject scan result card       422: "Anh hoi mo, chup lai nhe!"
   vao chat thread]              429: "Het luot quet hom nay!"
                                 5xx: "Loi server, thu lai"
```

### 6.5 Scan Result Card trong Chat Thread

Sau khi scan thanh cong, camera modal dong va mot card dac biet inject vao chat thread nhu tin nhan cua AI:

```
  [Be Thoc avatar]
  +------------------------------------------------------------------+
  | Ket qua phan tich anh cua ban:                                   |
  | +--------------------------------------------------------------+ |
  | | [Anh 120x90px]  Benh Dao On (Pyricularia oryzae)            | |
  | |                 Do chinh xac: 92%                            | |
  | |                 [Confidence bar fill ==================]     | |
  | |                                                              | |
  | | [PHI Warning mau cam D35400]:                               | |
  | | "Cach ly 14 ngay truoc thu hoach"                            | |
  | +--------------------------------------------------------------+ |
  | Be Thoc dang lo lang cho vuon cua ban! Toi khuyen ban...        |
  | [SSE streaming AI advice]                                       |
  |                                                                  |
  | Quick Actions:                                                   |
  | [Ghi nhat ky dieu tri]   [Nhac nho phun thuoc]                  |
  +------------------------------------------------------------------+
```

Mascot state sau scan:
- Benh nang (confidence >= 70%) -> worried
- Khoe manh / khong phat hien benh -> happy
- Anh mo / khong ro -> analytical

### 6.6 Quick Action -> Reminder Flow (tu Chat)

```
  [AI Chat response voi chip: [Dat nhac nho tuoi nuoc]]
         |
         v
  [Parse intent tu AI response context]
  { activity: "Tuoi nuoc", time: "08:00", type: "water" }
         |
         v
  +------------------------------------------------------------------+
  | SCR-09B: Create Reminder (Bottom Sheet - Pre-filled)             |
  | - Hoat dong: "Tuoi nuoc" (editable)                             |
  | - Thoi gian: 08:00 Ngay mai (editable)                          |
  | - Lap lai: Khong lap (default, editable)                        |
  | - Kenh: Push / Zalo (neu da ket noi)                            |
  | - CTA: [Dat nhac nho] | [Huy]                                   |
  +------------------------------------------------------------------+
         |
         v
  POST /api/v1/reminders { activity, scheduledAt, repeat, channel }
         |
    +----+------------------------+
    | 201 Created                | Error
    v                            v
  Toast: "Da dat nhac nho     Toast: "Khong the dat, thu lai"
   luc 08:00 ngay mai"
  Sheet dong -> return to chat
```

---

## 7. SCR-07: Profile and Progress

API calls khi mo: GET /api/v1/pet/state, GET /api/v1/profile/me, GET /api/v1/badges

```
  +------------------------------------------------------------------+
  | [1] Profile Card                                                 |
  |     [Avatar]  Nguyen Van Ruong                                  |
  |               Nong dan Sieng Nang - An Giang                    |
  |               [Badge hien tai]                                  |
  +------------------------------------------------------------------+
  | [2] Level and XP Card                                           |
  |     Level 4 - Nong dan Sieng Nang                              |
  |     [XP progress bar] 850 / 1200 XP                            |
  +------------------------------------------------------------------+
  | [3] Pet State Row                                               |
  |     Streak: 7 ngay - mood: happy - Ke tiep milestone: 14 ngay  |
  +------------------------------------------------------------------+
  | [4] Streak Calendar (scroll ngang, 4 tuan)                      |
  |     Mau: xanh = completed, xam = missed, border = hom nay      |
  |     Tuong lai = locked. Tap ngay -> xem diary entry ngay do.   |
  +------------------------------------------------------------------+
  | [5] Weekly Insights Card (collapsible)                          |
  |     "Tuan nay: 2 lan phat hien benh Dao On tren Lua..."        |
  +------------------------------------------------------------------+
  | [6] Badge Shelf                                                  |
  |     Full color = unlocked. Glow border = newest.               |
  |     Grayscale + lock icon = chua mo.                            |
  +------------------------------------------------------------------+
  | [7] Cua hang phu kien (tappable card -> SCR-06 sheet)          |
  +------------------------------------------------------------------+
  | [8] Settings rows                                               |
  |     Ket noi Zalo [toggle]                                       |
  |     Thong bao Push [toggle]                                     |
  |     Nhac nho cua toi -> SCR-09                                  |
  |     Thong tin tai khoan                                         |
  |     Dang xuat                                                   |
  +------------------------------------------------------------------+
```

---

## 8. SCR-06: Accessory Shop (Inside Profile)

Entry: SCR-07 Profile -> tap card "Cua hang phu kien" -> bottom sheet slide len.
API: GET /api/v1/pet/items, POST /api/v1/pet/equip { itemId }

```
  +------------------------------------------------------------------+
  | "Cua hang phu kien"                  XP hien tai: 850           |
  +------------------------------------------------------------------+
  | [<-] Carousel items lo lung tren be do anh sang [->]           |
  |   +----------+    +----------+    +----------+                   |
  |   | Item 1   |    | Item 2   |    | Item 3   |                   |
  |   | 200 XP   |    | 500 XP   |    | 150 XP   |                   |
  |   | [Mua]    |    | [Chua du]|    | [Mua]    |                   |
  |   +----------+    +----------+    +----------+                   |
  | [Xem Mascot Preview] <- Live preview voi accessory              |
  +------------------------------------------------------------------+
```

Tap [Mua]: POST /api/v1/pet/equip { itemId } -> Tru XP -> Cap nhat appearance -> Render lai Lottie tren Home ngay (seamless update) -> Toast "Da trang bi thanh cong!"

---

## 9. SCR-08: Celebration / Level-up Overlay

Celebration la **modal overlay** hien de len man hinh hien tai, KHONG phai man hinh rieng.

**Trigger conditions:**

```
  TRIGGER 1: Streak milestone (7 / 14 / 30 ngay)
  -> Backend: pet.milestone_celebrated = true, mood = 'excited'
     Frontend: check sau moi diary save OR polling GET /pet/state

  TRIGGER 2: Level up
  -> Diary save response: { levelUp: true, newLevel: "Nong dan Sieng Nang" }

  TRIGGER 3: Badge unlock
  -> Any API response: { badgeUnlocked: { id, name, icon } }
```

**SCR-08 Overlay Layout:**

```
  +------------------------------------------------------------------+
  | [Confetti / star particles - CSS keyframes, tu destroy sau 4s]  |
  |                                                                  |
  |           [Be Thoc - celebrating state, hero size]               |
  |                                                                  |
  |       7 ngay lien tiep!                                          |
  |       +50XP  [====================] Level 4                     |
  |                                                                  |
  |   Huy hieu moi: "Nong dan Sieng Nang" (card, animated)         |
  |                                                                  |
  |             [Tuyet voi! Tiep tuc] (primary CTA)                 |
  |   [Auto-dismiss sau 4 giay neu user khong tap]                   |
  +------------------------------------------------------------------+
  Backdrop: rgba(0, 0, 0, 0.6)
  KHONG block critical farming warnings.
  After dismiss: PATCH /api/v1/pet/state { milestone_celebrated: false }
```

---

## 10. SCR-09: Reminder List and Create

Entry: Profile -> Settings -> [Nhac nho cua toi] hoac deeplink tu chat quick action.

**SCR-09 Reminder List:**

```
  GET /api/v1/reminders
         |
  +------------------------------------------------------------------+
  | "Nhac nho cua toi"                               [+ Them]       |
  +------------------------------------------------------------------+
  | SAP TOI                                                          |
  | +--------------------------------------------------------------+ |
  | | [Drop] Tuoi nuoc - 08:00 hang ngay    [pending green]       | |
  | +--------------------------------------------------------------+ |
  | +--------------------------------------------------------------+ |
  | | [Leaf] Bon phan - Thu 2 hang tuan     [pending green]       | |
  | +--------------------------------------------------------------+ |
  +------------------------------------------------------------------+
  | DA QUA                                                           |
  | [Reminders cu, list nho, mau xam]                               |
  +------------------------------------------------------------------+
  | Empty: Be Thoc + "Them nhac nho de khong quen cham vuon!"      |
  | [+ FAB] -> SCR-09B Create                                       |
  +------------------------------------------------------------------+
```

SCR-09B Create Reminder: da spec day du tai Section 6.6. Khi mo truc tiep tu SCR-09, tat ca fields bat dau trong.

---

## 11. Error States and API Error Map

| API / Scenario | HTTP | Error Code | UI Response |
|---|---|---|---|
| Auth - Token het han | 401 | AUTH_TOKEN_EXPIRED | Axios interceptor tu refresh -> neu fail -> redirect SCR-01 + Toast |
| Auth - Refresh fail | 401 | AUTH_REFRESH_FAILED | Force logout -> SCR-01 |
| PlantScan - Anh mo | 422 | SCAN_IMAGE_BLURRY | Bottom sheet: "Anh hoi mo, chup lai nhe!" + [Chup lai] |
| PlantScan - Het quota | 429 | SCAN_QUOTA_EXCEEDED | Bottom sheet: "Het luot quet hom nay" + [Hoi Be Thoc] |
| PlantScan - File sai | 400 | SCAN_INVALID_FILE | Toast: "File khong hop le (JPG/PNG/WebP <= 5MB)" |
| Diary save - Network | 0/5xx | - | Toast: "Luu khong duoc, kiem tra mang" + form giu nguyen |
| Photo upload - R2 fail | 5xx | - | Slot anh do + Toast "Tai anh that bai, thu lai" |
| Reminder create | 400 | - | Inline field validation |
| Chat - Session error | 5xx | - | Toast: "Khong ket noi duoc Be Thoc, thu lai" |
| Zalo OAuth invalid | 401 | - | Toast: "Ket noi Zalo that bai" + redirect SCR-01C |

**Toast vs Bottom Sheet rule:**
- Toast (auto-dismiss 3s): loi nhe, khong block flow.
- Bottom Sheet error (co CTA): loi yeu cau user action nhu chup lai, thu lai.
- Redirect: chi cho auth failure hoac session expire.

---

## 12. Offline / PWA State

Target users o nong thon voi mang yeu - app phai handle offline gracefully.

```
  [navigator.onLine = false detected]
         v
  +------------------------------------------------------------------+
  | Offline Banner (sticky top):                                     |
  | "Dang ngoai tuyen - mot so tinh nang khong kha dung"           |
  | [Tai lai khi co mang]                                           |
  +------------------------------------------------------------------+
```

| Tinh nang | Offline? | Ghi chu |
|---|---|---|
| Xem diary entries cu | Co | Service Worker cache GET /diary |
| Xem scan results cu | Co | Cache tu lan truoc |
| Xem Profile / Streak | Co | Cache last GET /pet/state |
| Tao nhat ky moi | Partial | Form hien thi -> IndexedDB queue -> sync khi online |
| PlantScan moi | Khong | Can Gemini Vision API |
| AI Chat | Khong | Can LLM API |
| Nhac nho (da dat) | Co | Web Push khong can app mo |

Offline queue cho Diary Create:
```
  [User submit diary khi offline]
  -> Luu vao IndexedDB: { diaryPayload, timestamp }
  -> Toast: "Da luu tam - se dong bo khi co mang"
  -> (khi online): Service Worker background sync
  -> POST /api/v1/diary (flush queue)
  -> Toast: "Da dong bo nhat ky offline"
```

---

## 13. Animation Guidelines

| Animation | Trigger | Spec |
|---|---|---|
| Modal slide-up | Moi bottom sheet / modal | cubic-bezier(0.32, 0.72, 0, 1) - 400ms |
| Button squeeze | Tap button / card tuong tac | scale(0.95) - 100ms, khong dung translateY |
| XP fill | Diary save, reward | XP bar fill + "+30XP" pop text mau cam |
| Mascot transition | Mood change | Lottie frame interpolate, khong hard-cut |
| Confetti | SCR-08 Celebration | CSS keyframes, auto-destroy sau 4s |
| Offline banner | onLine event | Slide down tu top - ease-out 200ms - khong push content |
| Scan card inject | Scan success | Card fade-in + slide-up vao chat thread |
| Camera modal | Camera icon tap | Fullscreen modal scale-up tu input bar |

Motion constraints:
- Idle mascot: loop cham, subtle, khong distract
- Celebration: ephemeral, tu dismiss
- Reduced motion: respect prefers-reduced-motion
- No continuous background animation tren productivity screens

---

## 14. SCR-10: Farm Snap — Camera Capture Modal

Entry points:
- FAB 📸 nổi trên Home, DiaryList, FarmFeed
- Nút [📸 Chụp ngay] trong FarmFeed header

API: POST /api/v1/snaps/upload-url → PUT <signedUrl> → POST /api/v1/snaps

```
[Tap FAB 📸]
       |
       v
[Check camera permission]
       |
       +-- DENIED → Toast "Can quyen camera" + [Mo Cai dat]
       | GRANTED
       v
+------------------------------------------------------------------+
| SCR-10: SnapCaptureModal (fullscreen, dark theme)                |
|                                                                  |
| [X Dong]                           [Be Thoc: happy nho]          |
|                                                                  |
| +------------------------------------------------------------+   |
| |                                                            |   |
| |            Live camera feed (full bleed)                   |   |
| |                                                            |   |
| +------------------------------------------------------------+   |
|                                                                  |
| [Loai cay: Lua ▾]   [Khoe][Co van de][Thu hoach]               |
|                                                                  |
| [Thu vien]      [● CHUP]       [Doi camera]                     |
+------------------------------------------------------------------+
       | (Chup / chon tu thu vien)
       v
+------------------------------------------------------------------+
| Preview & Confirm                                                |
|                                                                  |
| [Anh vua chup - full width 4:5]                                  |
| [Lua · Co van de] (pill label)                                   |
|                                                                  |
| Caption (optional, max 100 chars):                               |
| [                                            ]                   |
|                                                                  |
| [Chup lai]              [Dang len Feed +10XP]                   |
+------------------------------------------------------------------+
       | (Dang)
       v
[Uploading: spinner + "Dang dang..."]
BUOC 1: POST /api/v1/snaps/upload-url
BUOC 2: PUT <signedUrl> (truc tiep len R2)
BUOC 3: POST /api/v1/snaps { imageUrl, cropType, condition, ... }
       |
  +----+---------------------------+
  | 201 Created                   | Error
  v                               v
[+10XP popup]              Toast theo bang loi (Section 11)
[Modal tu dong dong 1.5s]
[FarmFeed refresh]
[PetService: addXp(10)]
[BadgeCheck: moc 10/50/100 snaps]
```

---

## 15. SCR-11: Farm Feed — Community Snap Feed

Entry point: Home → section "Farm Feed gan day" → [Xem tat ca] HOAC FAB direct to /farm-feed

API: GET /api/v1/snaps/feed?limit=20&cursor=<iso>&cropType=&condition=

```
+------------------------------------------------------------------+
| "Farm Feed 🌱"                              [📸 Chup ngay]      |
+------------------------------------------------------------------+
| [Tat ca] [Khoe] [Co van de] [Thu hoach] [Cua toi]              |
+------------------------------------------------------------------+
| [SnapCard 1]                                                     |
| [SnapCard 2]                                                     |
| [SnapCard 3]                                                     |
| ...                                                              |
| [Shimmer loading - khi scroll den cuoi]                          |
| [Da xem het feed] - khi hasMore = false                          |
+------------------------------------------------------------------+
| Empty state:                                                     |
| Be Thoc (happy) + "Chua co snap nao!"                           |
| [Chup Farm Snap dau tien] (primary CTA)                         |
+------------------------------------------------------------------+
```

Desktop: 2-column masonry grid (gap-4, thi le 4:5 moi card)
Mobile: 1 column, infinite scroll (cursor pagination)

### SCR-11 SnapCard Anatomy

```
+------------------------------------------------------------------+
| [Anh - ty le 4:5, object-fit cover, bo goc 20px]                |
|                                                                  |
| Overlay top (gradient):                                          |
| [Lua He Thu]  [Co van de]   (condition pills)                   |
|                                                                  |
| Overlay bottom (gradient den):                                   |
| "Phat hien la vang o goc..."           (caption - 2 dong max)   |
| Nguyen Van Ruong · An Giang · 2 gio truoc                       |
| [😍 12] [👍 8] [😟 2] [🎉 5]    [💬 Hoi AI ve cay nay]        |
+------------------------------------------------------------------+
```

Tap anh → SCR-11B: SnapDetail (fullscreen bottom sheet / modal)
Tap [Hoi AI] → navigate /chat voi pre-filled: "Toi thay [cropType] dang [condition]..."
Reaction tap → POST /api/v1/snaps/:id/react { type } (toggle)

### SCR-11B: SnapDetail

Full-screen modal overlay:
- Anh full-width (header)
- Label pills: crop, condition
- Caption day du
- Reaction bar
- Comments section (Phase 4+)
- [Hoi Be Thoc ve cay nay] CTA → navigate to /chat

---

## 16. Home Integration — Farm Feed Preview Section

SCR-02 (Home) bo sung 1 section o cuoi trang (sau Quick Actions):

```
+------------------------------------------------------------------+
| Farm Feed gan day 🌱                         [Xem tat ca →]     |
+------------------------------------------------------------------+
| [Mini SnapCard 1] [Mini SnapCard 2] [Mini SnapCard 3]           |
| (Horizontal scroll, 160px wide x 200px tall cards)               |
+------------------------------------------------------------------+
```

API: GET /api/v1/snaps/feed?limit=5 (preview nho)

---

## 17. Error State Additions (Farm Snap)

Bo sung vao bang Section 11:

| API / Scenario | HTTP | Error Code | UI Response |
|---|---|---|---|
| Snap - Upload qua 10MB | 400 | SNAP_FILE_TOO_LARGE | Toast: "Anh qua lon, toi da 10MB" |
| Snap - Sai dinh dang | 400 | SNAP_INVALID_FORMAT | Toast: "Chi nhan JPG/PNG/WebP" |
| Snap - Vuot rate limit | 429 | SNAP_QUOTA_EXCEEDED | Bottom sheet: "Da dang du 10 snap hom nay!" |
| Snap - Khong co quyen camera | — | — | Toast: "Can quyen camera" + [Mo Cai dat] |
| Snap - Network khi upload | — | — | Toast: "Dang that bai, thu lai" |

---

*FarmDiaries AI - Screen Flow and Interaction Architecture v3.1*
*Navigation: 4 tabs (Home / Diary / AI Pet / Profile) - PlantScan in Chat - Shop in Profile*
*v3.1: Added Farm Snap (SCR-10, SCR-11), Home Feed Preview, Snap error states*
*Source of Truth for all UI flows and API integration points*
